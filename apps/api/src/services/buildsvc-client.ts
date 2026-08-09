/**
 * Client for the Tectonic LaTeX build service (SRS §8.4, T4).
 *
 * Requests are signed with HMAC-SHA256 over `timestamp + "." + rawBody`, so the
 * build service (which owns TeX compilation with no egress) only accepts calls
 * from this server. If the service is unreachable, `compile` returns a
 * graceful "offline" result and callers fall back to a `.tex` download
 * (FR-RES-013, REL-005) rather than failing the whole flow.
 */
import { createHmac } from 'node:crypto';
import { env } from '../env.js';

export interface CompileRequest {
  template: string; // e.g. "onyx@1.0.0"
  mainTex: string;
  assets?: Array<{ path: string; b64: string }>;
  sourceDateEpoch?: number;
  timeoutMs?: number;
  extractText?: boolean;
}

export interface CompileResult {
  ok: boolean;
  offline?: boolean;
  pdfBase64?: string;
  pages?: number;
  durationMs?: number;
  logTail?: string;
  text?: string;
  error?: { code: string; message: string; section?: string };
}

function sign(timestamp: string, body: string): string {
  return createHmac('sha256', env.BUILDSVC_HMAC_SECRET).update(`${timestamp}.${body}`).digest('hex');
}

export async function compile(req: CompileRequest): Promise<CompileResult> {
  const body = JSON.stringify({
    engine: 'tectonic',
    template: req.template,
    main_tex: Buffer.from(req.mainTex, 'utf8').toString('base64'),
    assets: req.assets ?? [],
    source_date_epoch: req.sourceDateEpoch ?? Math.floor(Date.now() / 1000),
    timeout_ms: req.timeoutMs ?? 20000,
    extract_text: req.extractText ?? true,
  });
  const ts = Date.now().toString();

  try {
    const res = await fetch(`${env.BUILDSVC_URL}/compile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-timestamp': ts,
        'x-signature': sign(ts, body),
      },
      body,
      signal: AbortSignal.timeout((req.timeoutMs ?? 20000) + 5000),
    });

    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: (json.error as Record<string, unknown>)?.code as string ?? 'COMPILE_ERROR',
          message: ((json.error as Record<string, unknown>)?.message as string) ?? 'compilation failed',
          section: (json.error as Record<string, unknown>)?.section as string | undefined,
        },
        logTail: json.log_tail as string | undefined,
      };
    }
    return {
      ok: true,
      pdfBase64: json.pdf as string,
      pages: json.pages as number,
      durationMs: json.duration_ms as number,
      logTail: json.log_tail as string | undefined,
      text: json.text as string | undefined,
    };
  } catch {
    return {
      ok: false,
      offline: true,
      error: {
        code: 'BUILDSVC_OFFLINE',
        message: `Build service unreachable at ${env.BUILDSVC_URL}. Start it with \`docker compose up -d buildsvc\`.`,
      },
    };
  }
}

export async function healthz(): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    const res = await fetch(`${env.BUILDSVC_URL}/healthz`, { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, detail: res.ok ? await res.json() : undefined };
  } catch {
    return { ok: false };
  }
}
