import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

const ATOMS = '**/api/v1/atoms?*';

/**
 * Atom library editor. Requires demo seed (owned roles/projects + skills).
 */
test('atom library can create a bullet with linked record evidence', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/atoms');

  await expect(page.getByRole('heading', { name: 'Atom library' })).toBeVisible();
  await page.getByRole('button', { name: 'New atom' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Create atom' })).toBeVisible();

  // Owner select is the first Radix select inside the sheet (class is `vt-sel`).
  await sheet.locator('.vt-sel').first().click();
  const firstOption = page.locator('.vt-sel__item').filter({ hasNotText: /^Clear$/i }).first();
  await expect(firstOption).toBeVisible({ timeout: 10_000 });
  await firstOption.click();

  const marker = `E2E atom ${Date.now()} reduced latency with Python.`;
  await sheet.getByLabel(/technical wording/i).fill(marker);

  const evidenceTitle = `E2E evidence ${Date.now()}`;
  // Prefer a project stub, empty props are valid, unlike repository/link.
  await sheet.getByRole('button', { name: /^project$/i }).click();
  const evidencePicker = sheet.getByPlaceholder(/Link a repository, document, or project/i);
  await evidencePicker.fill(evidenceTitle);
  const createHit = sheet.locator('.entity-picker__opt--create').filter({ hasText: evidenceTitle });
  await expect(createHit).toBeVisible({ timeout: 10_000 });
  await createHit.click();
  await expect(sheet.locator('.atom-evidence__chip').getByText(evidenceTitle)).toBeVisible({
    timeout: 10_000,
  });

  await sheet.getByRole('button', { name: 'Save atom' }).click();
  await expect(sheet.getByRole('heading', { name: 'Create atom' })).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(marker).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(evidenceTitle).first()).toBeVisible({ timeout: 10_000 });
});

test('a failed load says so instead of blaming an empty library', async ({ page }) => {
  await signInDemo(page);
  await page.route(ATOMS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the atom store is unreachable"}}',
    }),
  );
  await page.goto('/resume/atoms');

  // `isError` was unread, so a failure rendered an empty grid reading "No
  // matching atoms, create an atom here, or clear the filters".
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load your atom library");
  await expect(alert).toContainText('the atom store is unreachable');
  await expect(page.getByText('No matching atoms')).toHaveCount(0);
});

test('an empty library and an over-filtered one are different screens', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/atoms');
  await expect(page.getByRole('heading', { name: 'Atom library' })).toBeVisible();

  // Filtered to nothing: the way out is to widen, not to write another atom.
  await page.getByPlaceholder(/Search bullet text/i).fill('zzzznothingmatchesthis');
  await expect(page.getByText('No atoms match these filters')).toBeVisible();
  await expect(page.getByText(/All \d+ of your atoms are hidden/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(page.getByText('No atoms match these filters')).toHaveCount(0);

  // Genuinely empty: the way out is to write one.
  await page.route(ATOMS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"atoms":[],"owners":[]}' }),
  );
  await page.reload();
  await expect(page.getByText('No atoms yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create atom' })).toBeVisible();
});

test('the count says how many are shown of how many there are', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/atoms');
  await expect(page.getByRole('heading', { name: 'Atom library' })).toBeVisible();

  const shown = page.getByText(/shown$/);
  const all = (await shown.innerText()).trim();

  // Unfiltered it is just the total; filtered it has to say both, or "3 shown"
  // over a library of forty is unreadable.
  await page.getByPlaceholder(/Search bullet text/i).fill('Python');
  await expect(shown).toHaveText(/\d+ of \d+ shown/);
  await expect(shown).not.toHaveText(all);
});

test('archiving an atom confirms, reports, and can be undone', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/atoms');
  await expect(page.getByRole('heading', { name: 'Atom library' })).toBeVisible();

  // Count only once the grid has actually rendered, `count()` does not
  // auto-wait, so this read zero and asserted a negative expectation.
  await expect(page.locator('.atom-card').first()).toBeVisible({ timeout: 15_000 });
  const before = await page.locator('.atom-card').count();
  await page.locator('.atom-card').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Archive/i }).click();
  await page.getByRole('button', { name: 'Archive atom' }).click();

  // Completed in silence before, and archiving was a one-way door even though
  // the restore endpoint already existed.
  const archived = toast(page, 'Archived');
  await expect(archived).toBeVisible();
  await expect(page.locator('.atom-card')).toHaveCount(before - 1);

  await archived.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.atom-card')).toHaveCount(before);
});

test('the atom library has no automated a11y violations', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/atoms');
  await expect(page.getByRole('heading', { name: 'Atom library' })).toBeVisible();
  await expectNoA11yViolations(page);
});
