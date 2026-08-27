import { test, expect, type Page } from '@playwright/test';
import { signIn, signInDemo } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiPost, expectOkJson } from './helpers/api.js';

/**
 * Screen 21: Cover letters.
 *
 * The demo space has no letters, so the states that need some are driven from
 * the API rather than by creating and deleting real ones: a spec that only
 * passes once it has littered the database is not testing anything.
 */

const LETTERS = '**/api/v1/letters*';

function letter(id: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id,
    target_id: 't1',
    blocks: [{ kind: 'hook', text: `Hook for ${id}` }],
    status,
    rev: 1,
    deleted_at: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

async function serveLetters(page: Page, letters: unknown[]) {
  await page.route(LETTERS, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ letters }),
    });
  });
}

test('the status filter is actually labelled, not just labelled in the source', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/letters');
  await expect(page.getByRole('heading', { name: 'Cover letters' })).toBeVisible({ timeout: 10_000 });

  // The call site has always passed `aria-label="Status filter"`. Select
  // destructured its props explicitly and dropped everything else, so the
  // control read as labelled in the source and had no accessible name at all
  // in the browser, while Input and Textarea beside it spread their rest.
  await expect(page.getByRole('combobox', { name: 'Status filter' })).toBeVisible();
});

test('a failed load says so instead of claiming you have written none', async ({ page }) => {
  await signInDemo(page);
  await page.route(LETTERS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the letter store is unreachable"}}',
    }),
  );
  await page.goto('/resume/letters');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load your cover letters');
  await expect(alert).toContainText('the letter store is unreachable');
  await expect(page.getByText('No cover letters yet')).toHaveCount(0);
});

test('having none and hiding them all are different screens', async ({ page }) => {
  await signInDemo(page);
  await serveLetters(page, []);
  await page.goto('/resume/letters');
  await expect(page.getByText('No cover letters yet')).toBeVisible();

  // One branch served both, so filtering your letters out of sight claimed you
  // had never written one.
  await serveLetters(page, [letter('l1', 'draft'), letter('l2', 'final')]);
  await page.reload();
  await expect(page.getByText('No cover letters yet')).toHaveCount(0);

  await page.getByPlaceholder(/Search by company or role/i).fill('zzzznothingmatchesthis');
  await expect(page.getByText('No letters match these filters')).toBeVisible();
  await expect(page.getByText(/All 2 of your letters are hidden/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(page.getByText('No letters match these filters')).toHaveCount(0);
});

test('the count says how many are shown of how many there are', async ({ page }) => {
  await signInDemo(page);
  await serveLetters(page, [letter('l1', 'draft'), letter('l2', 'final')]);
  await page.goto('/resume/letters');

  const shown = page.getByRole('status', { name: 'Letters shown' });
  await expect(shown).toHaveText(/^\s*2\s+letters/);

  await page.getByPlaceholder(/Search by company or role/i).fill('zzzznothing');
  await expect(shown).toHaveText(/0 of 2\s+letters/);
});

test('cover letters has no automated a11y violations', async ({ page }) => {
  await signInDemo(page);
  await serveLetters(page, [letter('l1', 'draft')]);
  await page.goto('/resume/letters');
  await expect(page.getByRole('heading', { name: 'Cover letters' })).toBeVisible({ timeout: 10_000 });
  await expectNoA11yViolations(page);
});

test.describe('letter compile', () => {
  test.describe.configure({ timeout: 90_000 });

  test('compile preview is a PDF or an honest offline (FR-RES-021)', async ({ page }) => {
    await signIn(page);
    const stamp = Date.now();
    const role = `Letter compile ${stamp}`;
    const target = await expectOkJson<{ target: { id: string } }>(
      await apiPost(page, '/targets', { role_title: role, jd_raw: 'Requirements\n- Writing' }),
      'target',
    );
    await expectOkJson(
      await apiPost(page, '/letters', {
        target_id: target.target.id,
        blocks: [
          { kind: 'hook', text: 'I am writing about the role.' },
          { kind: 'body', text: 'I have shipped measurable systems.' },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      }),
      'letter',
    );

    await page.goto('/career/resume/letters');
    await expect(page.getByRole('heading', { name: 'Cover letters' })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Search letters').fill(role);
    const list = page.getByRole('list', { name: 'Cover letters' });
    await expect(list.getByText(role)).toBeVisible({ timeout: 15_000 });
    await list.getByRole('button', { name: `Details of the letter to ${role}` }).click();

    const compile = page.waitForResponse(
      (res) => res.url().includes('/letters/') && res.url().endsWith('/compile') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Compile preview' }).click();
    const response = await compile;
    expect(response.ok(), await response.text()).toBe(true);
    const body = (await response.json()) as { pdfBase64: string | null; offline: boolean };
    const prefix = Buffer.from(body.pdfBase64 ?? '', 'base64').subarray(0, 5).toString('utf8');
    // Dual-path: a real PDF, or an honest offline — never a shape-only success.
    expect(body.offline || prefix === '%PDF-').toBe(true);
    expect(Boolean(body.pdfBase64) && body.offline).toBe(false);
    await expect(
      page.locator('iframe[title="cover letter preview"]').or(page.getByText('Build service offline')),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('link', { name: 'Download PDF' }).or(page.getByRole('link', { name: 'Download .tex' })),
    ).toBeVisible();
  });
});
