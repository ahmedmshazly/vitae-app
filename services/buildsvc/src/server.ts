/**
 * Vitae LaTeX build service (SRS §8.4). A tiny HTTP server that compiles a
 * self-contained LaTeX document with Tectonic and extracts the PDF's text with
 * poppler. It is:
 *   • HMAC-gated (T4), every request is signed over `timestamp + "." + body`;
 *   • sandboxed (T3): Tectonic runs `--untrusted` (no shell-escape), in a
 *     per-request /tmp workdir, with the package cache pre-warmed at image build
 *     time so no network is needed at runtime;
 *   • deterministic, honours SOURCE_DATE_EPOCH for byte-identical re-exports.
 */
import { execFile } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import express, { type Request, type Response } from 'express';

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 8787);
// Bind to loopback unless told otherwise. In Compose the container needs
// 0.0.0.0 to be reachable at all, but the published port is pinned to
// 127.0.0.1 there, the default keeps a bare `node server.js` off the LAN.
const HOST = process.env.BUILDSVC_HOST ?? '127.0.0.1';
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/**
 * FR-027: the signing key IS the authentication. A published fallback means any
 * network-adjacent caller can sign a compile request, so there is no default.
 * an unset or known-development secret is a startup failure, not a warning.
 */
const KNOWN_DEV_SECRETS = new Set([
  'dev-buildsvc-secret',
  'dev-only-buildsvc-hmac-secret-please-rotate-3d8e5f',
  'change-me-to-a-shared-secret',
]);

function loadSecret(): string {
  const secret = process.env.BUILDSVC_HMAC_SECRET;
  if (!secret || secret.length < 8) {
    console.error(
      '[buildsvc] BUILDSVC_HMAC_SECRET is required (min 8 chars).\n' +
        "           Generate one with:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    process.exit(1);
  }
  if (KNOWN_DEV_SECRETS.has(secret) && process.env.NODE_ENV === 'production') {
    console.error('[buildsvc] BUILDSVC_HMAC_SECRET is a published development default, refusing to start in production.');
    process.exit(1);
  }
  if (KNOWN_DEV_SECRETS.has(secret)) {
    console.warn('[buildsvc] using a published development secret, fine locally, never in production.');
  }
  return secret;
}

const SECRET = loadSecret();

const app = express();
let activeRequests = 0;
let shuttingDown = false;
app.use((req, res, next) => {
  const requestId = req.header('x-request-id') || randomUUID();
  const started = Date.now();
  activeRequests += 1;
  let settled = false;
  res.setHeader('x-request-id', requestId);
  const finish = (aborted: boolean): void => {
    if (settled) return;
    settled = true;
    activeRequests -= 1;
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - started,
      aborted,
    }));
  };
  res.once('finish', () => finish(false));
  res.once('close', () => finish(!res.writableFinished));
  next();
});
app.use(
  express.json({
    limit: '8mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  }),
);

function verifySignature(req: Request): boolean {
  const ts = req.header('x-timestamp');
  const sig = req.header('x-signature');
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() - Number(ts)) > MAX_TIMESTAMP_SKEW_MS) return false;
  const raw = (req as Request & { rawBody?: string }).rawBody ?? '';
  const expected = createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Page count, or null when poppler could not tell us. It used to answer 1 on
 * both failure paths, which is the one answer callers act on: the résumé
 * one-page gate read that invented 1 as a passing measurement and finalized a
 * document nobody had measured. An honest null makes the gate refuse instead.
 */
async function pdfPages(pdfPath: string): Promise<number | null> {
  try {
    const { stdout } = await run('pdfinfo', [pdfPath]);
    const m = stdout.match(/Pages:\s+(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function pdfText(pdfPath: string): Promise<string> {
  try {
    const { stdout } = await run('pdftotext', ['-layout', pdfPath, '-']);
    return stdout;
  } catch {
    return '';
  }
}

// Written during the Docker build by calibrate.ts, the honest list of what
// this image actually warmed (and proved compilable offline).
interface PageCalibration {
  kind: string;
  expected: string;
  measured: number;
}
interface WarmedManifest {
  templates_warmed: string[];
  line_calibration?: Record<string, { configured: number; measured: number }>;
  /** Absent for templates whose length is content-driven rather than line-budgeted. */
  page_calibration?: Record<string, PageCalibration>;
  generated_at?: string;
}
const warmedManifest: WarmedManifest = (() => {
  try {
    const manifest = JSON.parse(
      readFileSync(process.env.WARMED_MANIFEST_PATH ?? '/app/warmed-manifest.json', 'utf8'),
    ) as {
      templates_warmed?: string[];
      line_calibration?: Record<string, { configured: number; measured: number }>;
      page_calibration?: Record<string, PageCalibration>;
      generated_at?: string;
    };
    return {
      templates_warmed: manifest.templates_warmed ?? [],
      line_calibration: manifest.line_calibration,
      page_calibration: manifest.page_calibration,
      generated_at: manifest.generated_at,
    };
  } catch {
    return { templates_warmed: [] };
  }
})();
const warmedTemplates = warmedManifest.templates_warmed;

app.get('/healthz', async (_req, res) => {
  let tectonicVersion = 'unknown';
  try {
    const { stdout } = await run('tectonic', ['--version']);
    tectonicVersion = stdout.trim();
  } catch {
    /* not installed */
  }
  const ok = !shuttingDown && warmedTemplates.length > 0 && tectonicVersion !== 'unknown';
  res.status(ok ? 200 : 503).json({
    ok,
    tectonic: tectonicVersion,
    templates_warmed: warmedTemplates,
    line_calibration: warmedManifest.line_calibration ?? {},
    page_calibration: warmedManifest.page_calibration ?? {},
    calibrated_at: warmedManifest.generated_at ?? null,
    active_requests: activeRequests,
  });
});

app.post('/compile', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'invalid signature' } });
  }
  const body = req.body as {
    main_tex?: string;
    source_date_epoch?: number;
    timeout_ms?: number;
    extract_text?: boolean;
  };
  if (!body.main_tex) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'main_tex required' } });
  }

  const workdir = await mkdtemp(join(tmpdir(), 'vitae-tex-'));
  const started = Date.now();
  try {
    const mainTex = Buffer.from(body.main_tex, 'base64').toString('utf8');
    await writeFile(join(workdir, 'main.tex'), mainTex, 'utf8');

    const env = {
      ...process.env,
      SOURCE_DATE_EPOCH: String(body.source_date_epoch ?? Math.floor(Date.now() / 1000)),
    };
    try {
      // --only-cached: the cache is warmed at image build time and the runtime
      // network is sealed, a cache miss must fail fast and honestly, not spend
      // minutes in DNS timeouts.
      await run('tectonic', ['-X', 'compile', 'main.tex', '--untrusted', '--only-cached', '--outdir', workdir], {
        cwd: workdir,
        env,
        timeout: body.timeout_ms ?? 20000,
      });
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string };
      const logTail = (e.stderr ?? e.stdout ?? String(err)).slice(-2048);
      return res.status(400).json({
        error: { code: 'COMPILE_ERROR', message: 'Template failed to compile', section: guessSection(logTail) },
        log_tail: logTail,
      });
    }

    const pdfPath = join(workdir, 'main.pdf');
    const pdf = await readFile(pdfPath);
    const pages = await pdfPages(pdfPath);
    const text = body.extract_text ? await pdfText(pdfPath) : undefined;

    res.json({
      pdf: pdf.toString('base64'),
      pages,
      duration_ms: Date.now() - started,
      log_tail: '',
      text,
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL', message: String(err) } });
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post('/extract', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'invalid signature' } });
  }
  const { pdf } = req.body as { pdf?: string };
  if (!pdf) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'pdf required' } });
  const workdir = await mkdtemp(join(tmpdir(), 'vitae-ext-'));
  try {
    const p = join(workdir, 'in.pdf');
    await writeFile(p, Buffer.from(pdf, 'base64'));
    res.json({ text: await pdfText(p) });
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
});

function guessSection(log: string): string | undefined {
  const m = log.match(/section\s*\{?([A-Za-z ]+)/i);
  return m ? m[1]?.trim().toLowerCase() : undefined;
}

const server = app.listen(PORT, HOST, () => {
  console.log(`vitae buildsvc listening on ${HOST}:${PORT}`);
});

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[buildsvc] ${signal}, draining ${activeRequests} request(s)`);
  // Long enough to outlast the slowest compile a caller may still be waiting
  // on. 65s was sized for a one-page résumé (a 20s Tectonic budget); a
  // multipage document is dispatched with timeout_ms 60000, and text
  // extraction and the base64 response come after that, so the old drain
  // killed in-flight multipage builds on every deploy.
  const force = setTimeout(() => {
    console.error('[buildsvc] drain timed out');
    server.closeAllConnections();
    process.exit(1);
  }, 90_000);
  force.unref();
  server.close((error) => {
    clearTimeout(force);
    if (error) {
      console.error('[buildsvc] shutdown failed:', error);
      process.exit(1);
    }
    console.log('[buildsvc] drained cleanly');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
