/**
 * Negative journeys: auth default-deny, invalid filter grammar, and
 * demo/real space isolation. These exist so a green suite cannot mean
 * "happy paths only".
 */
import { expect, test } from '@playwright/test';
import { API_BASE, apiDelete, apiGet, apiPost, expectOkJson } from './helpers/api.js';
import { signIn } from './helpers/auth.js';

test('API rejects an unauthenticated graph write with 401', async ({ request }) => {
  const res = await request.post(`${API_BASE}/nodes`, {
    data: { type: 'person', title: 'Should Not Persist', props: {} },
    headers: { 'content-type': 'application/json', 'x-vitae-space': 'real' },
  });
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { error?: { code?: string; request_id?: string } };
  expect(body.error?.code).toBeTruthy();
  expect(body.error?.request_id).toBeTruthy();
});

test('API rejects a malformed Bearer token with 401', async ({ request }) => {
  const res = await request.get(`${API_BASE}/nodes?limit=1`, {
    headers: {
      authorization: 'Bearer not-a-real-token',
      'x-vitae-space': 'real',
    },
  });
  expect(res.status()).toBe(401);
});

test('an invalid filter clause surfaces as a warning chip, not a crash', async ({ page }) => {
  await signIn(page);
  await page.goto('/search?q=is:wombat');
  // Chip text is `${raw}: ${reason}`, and reason lists the allowed is: enums.
  await expect(page.getByText(/is:wombat:.*archived/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
});

test('a node created in real space does not appear in demo space search', async ({ page }) => {
  await signIn(page);
  const title = `ZqxSpace${Date.now()}`;
  const created = await apiPost(page, '/nodes', { type: 'person', title, props: {} });
  const { node } = await expectOkJson<{ node: { id: string } }>(created, 'create in real');

  // Still in real: findable via search API.
  const realSearch = await apiGet(page, `/search?q=${encodeURIComponent(title)}`);
  const realHits = await expectOkJson<{ results: Array<{ id: string }> }>(realSearch, 'search real');
  expect(realHits.results.some((h) => h.id === node.id)).toBe(true);

  // Toggle spaces in-session: a second /signin visit redirects past the button.
  await page.getByRole('button', { name: /view demo/i }).click();
  await expect(page.getByText(/demo space/i)).toBeVisible({ timeout: 10_000 });

  const demoSearch = await apiGet(page, `/search?q=${encodeURIComponent(title)}`);
  const demoHits = await expectOkJson<{ results: Array<{ id: string }> }>(demoSearch, 'search demo');
  expect(demoHits.results.some((h) => h.id === node.id)).toBe(false);

  // Clean up in the space that owns the row.
  await page.getByRole('button', { name: /back to my data/i }).click();
  await expect(page.getByText(/demo space/i)).toBeHidden({ timeout: 10_000 });
  const del = await apiDelete(page, `/nodes/${node.id}`);
  // Soft-delete returns 2xx; tolerate already-gone.
  expect([200, 204, 404]).toContain(del.status());
});
