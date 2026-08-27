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
  /**
   * Null when the build service compiled the document but could not count its
   * pages. It used to answer 1 in that case, and 1 is the number every page
   * gate reads as a pass, so callers must be able to tell a measurement from a
   * missing one.
   */
  pages?: number | null;
  durationMs?: number;
  logTail?: string;
  text?: string;
  error?: { code: string; message: string; section?: string };
}

function sign(timestamp: string, body: string): string {
  return createHmac('sha256', env.BUILDSVC_HMAC_SECRET).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * How long to wait beyond the compile budget itself. The build service still
 * has to count the pages, extract the text and ship a base64 PDF back after
 * Tectonic returns, and on a multipage document all three take real time. A
 * flat five seconds was sized for a one-page résumé and would abort a long
 * compile that had already succeeded; a quarter of the budget leaves the
 * 20-second default exactly where it was and grows with the rest.
 */
function abortAfter(timeoutMs: number): number {
  return timeoutMs + Math.max(5000, Math.round(timeoutMs * 0.25));
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
      signal: AbortSignal.timeout(abortAfter(req.timeoutMs ?? 20000)),
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
      pages: (json.pages as number | null | undefined) ?? null,
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
