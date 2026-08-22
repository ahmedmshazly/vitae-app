import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';

/**
 * E2E for the structured-entry makeover (P23-P24):
 *   create a person via the form · edit the KNOWS relationship ·
 *   add + remove a typed connection on a record.
 * Requires the running stack (emulators + api + web) and a fresh `pnpm seed`.
 */

test('Create a person through the structured form (+ New)', async ({ page }) => {
  await signIn(page);
  const name = `Form Person ${Date.now()}`;

  await page.getByRole('button', { name: 'New record (n)' }).click();
  await page.getByRole('menuitem', { name: 'person', exact: true }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Headline').fill('E2E: created via the form');
  await page.getByLabel('City').fill('Cairo');
  await page.getByRole('button', { name: 'Create person' }).click();

  // Toast + navigation to the new profile.
  await expect(page.getByText(`Created ${name}`)).toBeVisible({ timeout: 10_000 });
  // The person page uses PageHeader since Screen 7; assert the heading, not
  // the class that used to carry it.
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Appears in the People list. The row's checkbox carries a visually-hidden
  // "Select <name>" label, so the name alone matches twice.
  await page.goto('/people');
  await expect(page.getByRole('link', { name })).toBeVisible();
});

test('Edit the KNOWS relationship, closeness updates cadence', async ({ page }) => {
  await signIn(page);
  await page.goto('/people');
  await page.getByRole('link', { name: 'Sarah Chen' }).first().click();

  await page
    .getByRole('region', { name: /^Relationship strength/ })
    .getByRole('button', { name: 'Edit relationship' })
    .click();
  // Closeness 5 → cadence auto-suggests 30d. Assert the autofill landed before
  // saving, this also absorbs any editor re-render from parallel-test churn.
  await page.getByRole('radio', { name: '5 of 5' }).click();
  const cadenceInput = page.getByLabel('Reconnect cadence (days)');
  await expect(cadenceInput).toHaveValue('30');
  await page.getByRole('button', { name: 'Save relationship' }).click();

  await expect(page.getByText('Relationship updated')).toBeVisible({ timeout: 10_000 });
  // Sections replaced cards on the person page in Screen 7.
  await expect(
    page.getByRole('region', { name: /^Relationship strength/ }).getByText('30d'),
  ).toBeVisible();
});

test('Suggestion-backed fields offer existing values and a stub-create', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: 'New record (n)' }).click();
  await page.getByRole('menuitem', { name: 'role', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Tech stack is a suggest-list (kind: tech → skill). A novel value always
  // offers a "Create skill …, refine later" stub so linking never blocks.
  const techInput = page.getByLabel('Tech stack');
  await techInput.click();
  await techInput.fill(`Zskill${Date.now()}`);
  await expect(page.getByRole('option', { name: /Create skill .* refine later/i })).toBeVisible({ timeout: 10_000 });
});

test('Add and remove a typed connection on a record', async ({ page }) => {
  await signIn(page);
  await page.goto('/browse/idea');
  await page.getByRole('link', { name: 'Résumé atoms as a graph' }).first().click();

  // Add: idea ABOUT→ Sarah Chen.
  // Renamed in Screen 6: "+ add" named neither the action nor its object.
  await page.getByRole('button', { name: 'Add connection' }).click();
  await expect(page.getByRole('dialog', { name: 'Add connection' })).toBeVisible();
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Content · About', exact: true }).click();
  await page.getByRole('combobox', { name: /search/i }).or(page.getByPlaceholder(/Search/)).first().fill('Sarah');
  await page.getByRole('option', { name: /Sarah Chen/ }).first().click();
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Linked Sarah Chen')).toBeVisible({ timeout: 10_000 });

  // The edge row exists; unlink it.
  const row = page.locator('.edge-row', { hasText: 'Sarah Chen' }).first();
  await row.hover();
  await row.getByRole('button', { name: /Unlink Sarah Chen/ }).click();
  await page.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(page.getByText('Unlinked Sarah Chen')).toBeVisible({ timeout: 10_000 });
});
