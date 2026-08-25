/**
 * API calls from E2E fixtures must carry the same data-space header as the
 * SPA. The local-only developer session is minted directly for the fixture
 * request context, because Playwright does not share a page's httpOnly cookie
 * with a sibling API origin. Helpers that omit the data-space header would
 * silently write to the real graph while the browser is on demo.
 */
import { expect, type APIResponse, type Page } from '@playwright/test';

export const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export type E2ESpace = 'real' | 'demo';

export async function spaceFromPage(page: Page): Promise<E2ESpace> {
  const space = await page.evaluate(() => localStorage.getItem('vitae.space'));
  return space === 'demo' ? 'demo' : 'real';
}

/**
 * One developer session per page, not one per call.
 *
 * Every apiGet/apiPost/apiPatch/apiDelete goes through `apiHeaders`, which used
 * to post `/auth/dev-login` each time. A fixture creating a person, an
 * organisation and an edge therefore paid three sign-ins, and the token it
 * minted was identical every time. The token is a 24 hour JWT and the page it
 * belongs to lives for one test, so it is cached against the page and goes away
 * with it. A failed mint is evicted so the next call retries rather than
 * replaying the rejection.
 */
const sessions = new WeakMap<Page, Promise<string>>();

export function devToken(page: Page): Promise<string> {
  const existing = sessions.get(page);
  if (existing) return existing;
  const minting = (async () => {
    const login = await page.request.post(`${API_BASE}/auth/dev-login`);
    if (!login.ok()) {
      throw new Error(`E2E developer sign-in failed: ${login.status()} ${await login.text()}`);
    }
    const { token } = (await login.json()) as { token?: string };
    if (!token) throw new Error('E2E developer sign-in did not return a token.');
    return token;
  })().catch((error: unknown) => {
    sessions.delete(page);
    throw error;
  });
  sessions.set(page, minting);
  return minting;
}

export async function apiHeaders(page: Page, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  // Read live rather than cached: demo-mode and negative both toggle the space
  // mid-test, and a stale header would write to the graph they just left.
  const space = await spaceFromPage(page);
  return {
    'x-vitae-space': space,
    'x-vitae-tz': 'UTC',
    authorization: `Bearer ${await devToken(page)}`,
    ...extra,
  };
}

export async function apiGet(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(`${API_BASE}${path}`, { headers: await apiHeaders(page) });
}

export async function apiPost(page: Page, path: string, data?: unknown): Promise<APIResponse> {
  return page.request.post(`${API_BASE}${path}`, {
    headers: await apiHeaders(page, data !== undefined ? { 'content-type': 'application/json' } : {}),
    data,
  });
}

export async function apiPatch(page: Page, path: string, data?: unknown): Promise<APIResponse> {
  return page.request.patch(`${API_BASE}${path}`, {
    headers: await apiHeaders(page, data !== undefined ? { 'content-type': 'application/json' } : {}),
    data,
  });
}

export async function apiDelete(page: Page, path: string): Promise<APIResponse> {
  return page.request.delete(`${API_BASE}${path}`, { headers: await apiHeaders(page) });
}

/** Assert ok and return JSON; include status/body in the failure message. */
export async function expectOkJson<T>(res: APIResponse, label: string): Promise<T> {
  expect(res.ok(), `${label} failed: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}
