/**
 * Typed fetch client for the Vitae API. Uses cookie-based sessions
 * (`credentials: 'include'`), so the httpOnly dev-login/Google session cookie is
 * sent automatically; errors surface as a thrown `ApiError` with the server's
 * `{code,message}` shape.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:4000/api/v1';
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Data space: 'real' (your graph) vs 'demo' (the sample "Jordan" dataset).
 * Persisted locally; every request carries it so the API routes reads/writes
 * to the matching data-space rows. */
export type Space = 'real' | 'demo';
const SPACE_KEY = 'vitae.space';

export function getSpace(): Space {
  return localStorage.getItem(SPACE_KEY) === 'demo' ? 'demo' : 'real';
}

export function setSpace(space: Space): void {
  localStorage.setItem(SPACE_KEY, space);
}

/** Optional bearer-token source (production Google sign-in). Wired by the
 * AuthProvider; when unset (local dev) the cookie session carries auth. */
let authTokenProvider: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null): void {
  authTokenProvider = provider;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = authTokenProvider ? await authTokenProvider() : null;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * The browser's IANA timezone. "Today", "overdue", streaks, and anniversaries
 * are calendar-date questions the server cannot answer without it (FR-025).
 */
function timezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Headers every request carries: auth, data space, timezone. */
async function transportHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeader()), 'x-vitae-space': getSpace(), 'x-vitae-tz': timezone() };
}

interface WriteOptions { idempotencyKey?: string }

async function request<T>(method: string, path: string, body?: unknown, options?: WriteOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await transportHeaders()), ...(options?.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const err = payload?.error ?? { code: 'ERROR', message: res.statusText };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return payload as T;
}

/**
 * Save a Blob to disk under `filename`. Kept here so every download goes
 * through the same authenticated transport (FR-014) instead of a raw `fetch`.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, options?: WriteOptions) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Trigger a file download (e.g. the export ZIP). */
  download: async (path: string, body?: unknown): Promise<Blob> => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(await transportHeaders()) },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'download failed');
    return res.blob();
  },
  /**
   * GET a file with the full transport policy, bearer token, session cookie,
   * and data space (FR-014). The saved-view CSV export used a bare `fetch` with
   * only `credentials: 'include'`, so it failed in bearer-only production and
   * silently exported the REAL graph while the user was viewing demo data.
   */
  downloadGet: async (path: string): Promise<Blob> => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: await transportHeaders(),
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'download failed');
    return res.blob();
  },
  base: BASE,
};
