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

export async function apiHeaders(page: Page, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const space = await spaceFromPage(page);
  const login = await page.request.post(`${API_BASE}/auth/dev-login`);
  if (!login.ok()) throw new Error(`E2E developer sign-in failed: ${login.status()} ${await login.text()}`);
  const { token } = (await login.json()) as { token?: string };
  if (!token) throw new Error('E2E developer sign-in did not return a token.');
  return {
    'x-vitae-space': space,
    'x-vitae-tz': 'UTC',
    authorization: `Bearer ${token}`,
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
