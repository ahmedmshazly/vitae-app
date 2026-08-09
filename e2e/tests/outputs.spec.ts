import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const LIST = '**/api/v1/resumes?*';
const DETAIL = '**/api/v1/resumes/*';

/**
 * Outputs studio: detail sheet, duplicate, archive.
 * Requires demo seed. If no outputs exist yet, asserts the empty state.
 */
test('outputs studio supports detail, duplicate, and archive', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');

  await expect(page.getByRole('heading', { name: 'Outputs' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Search outputs')).toBeVisible();

  if (await page.getByText('No outputs yet').isVisible().catch(() => false)) {
    await expect(page.getByRole('button', { name: /tailor a résumé/i })).toBeVisible();
    return;
  }

  const rows = page.locator('.output-row');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const firstName = (await rows.first().locator('strong').innerText()).trim();

  await rows.first().getByRole('button', { name: /^Details for / }).click();
  await expect(page.getByText('Private artifacts')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(firstName).first()).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.keyboard.press('Escape');

  const copyName = `${firstName}, copy`;
  await page.getByLabel('Search outputs').fill(copyName);
  const copyRow = page.locator('.output-row').filter({ hasText: ', copy' }).first();
  await expect(copyRow).toBeVisible({ timeout: 15_000 });

  await copyRow.getByRole('button', { name: /^Details for / }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  // No `.last()` needed: the confirm is "Archive output", the sheet's is "Archive".
  await page.getByRole('button', { name: 'Archive output' }).click();

  await page.getByLabel('Search outputs').fill(copyName);
  await expect(page.getByText('No outputs match these filters')).toBeVisible({ timeout: 10_000 });
});

test('a failed load says so instead of inviting you to start over', async ({ page }) => {
  await signInDemo(page);
  await page.route(LIST, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the output store is unreachable"}}',
    }),
  );
  await page.goto('/resume/outputs');

  // `isError` was unread, so a failure rendered the empty panel and offered to
  // tailor résumés you may already have.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load your outputs');
  await expect(alert).toContainText('the output store is unreachable');
  await expect(page.getByText('No outputs yet')).toHaveCount(0);
});

test('an empty archive and an over-filtered one are different screens', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');
  await expect(page.getByRole('heading', { name: 'Outputs' })).toBeVisible();
  await expect(page.locator('.output-row, .output-list > *').first()).toBeVisible({ timeout: 15_000 });

  // The old panel's title said "No matching outputs" while its hint described
  // a first run, two different situations sharing one message.
  await page.getByLabel('Search outputs').fill('zzzznothingmatchesthis');
  await expect(page.getByText('No outputs match these filters')).toBeVisible();
  await expect(page.getByText(/All \d+ of your outputs are hidden/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(page.getByText('No outputs match these filters')).toHaveCount(0);
});

test('the count says how many are shown of how many there are', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');
  const shown = page.getByText(/outputs$/);
  await expect(shown).toBeVisible();

  await page.getByLabel('Search outputs').fill('Aurora');
  await expect(shown).toHaveText(/\d+( of \d+)? outputs/);
});

test('every row is individually addressable', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');
  await expect(page.getByRole('button', { name: /^Details for / }).first()).toBeVisible({ timeout: 15_000 });

  // Forty-four rows each offered a button called "PDF" and one called
  // "Details", two names across the whole list.
  const names = await page
    .getByRole('button', { name: /^Details for / })
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
});

test('a failed detail lookup does not spin for ever', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');
  await expect(page.getByRole('button', { name: /^Details for / }).first()).toBeVisible({ timeout: 15_000 });

  await page.route(DETAIL, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"detail unavailable"}}',
    }),
  );
  await page.getByRole('button', { name: /^Details for / }).first().click();

  // `!detail` held forever on failure, so the sheet span a spinner with
  // nothing to read, the same shape the Life map had.
  await expect(page.getByRole('alert')).toContainText('Couldn’t load this output', { timeout: 10_000 });
  await expect(page.locator('.vt-spinner')).toHaveCount(0);
});

test('the outputs archive has no automated a11y violations', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/outputs');
  await expect(page.getByRole('heading', { name: 'Outputs' })).toBeVisible();
  await expectNoA11yViolations(page);
});
