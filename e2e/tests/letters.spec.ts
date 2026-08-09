import { test, expect, type Page } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

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
