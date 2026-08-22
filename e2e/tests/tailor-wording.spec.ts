import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { chooseOption } from './helpers/controls';

/**
 * Tailor wording emphasis + accent controls. Requires demo seed + buildsvc.
 */
test('tailor exposes wording emphasis and accent controls before compile', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/tailor');

  await page.getByText('Machine Learning Engineer').first().click();
  await expect(page).toHaveURL(/target=/);
  // The parser version is its own chip beside the heading now, rather than a
  // parenthetical inside it, so the heading is what to wait on.
  await expect(page.getByRole('heading', { name: /^Weighted keywords/ })).toBeVisible({
    timeout: 10_000,
  });

  await chooseOption(page, 'Wording emphasis', 'Leadership');

  // The swatches used to announce their hex, which named nothing a person
  // could repeat. Every shipped accent has a word now.
  const teal = page.getByRole('button', { name: /Use Teal accent/i });
  await expect(teal).toBeVisible();
  await teal.click();
  await expect(teal).toHaveAttribute('aria-pressed', 'true');

  const modes = page.getByRole('group', { name: 'Selection mode' });
  await modes.getByRole('button', { name: 'Manual', exact: true }).click();
  await expect(page.getByText(/all atoms/i)).toBeVisible({ timeout: 10_000 });
  // A Radix checkbox is a button with the role, not an `input`, so ask for the
  // role rather than the tag. Scoped to the atom lists: the target rail has a
  // Show archived checkbox of its own, first in the document, and toggling
  // that selects no bullet at all.
  await page.getByRole('list', { name: /^Atoms from / }).getByRole('checkbox').first().click();
  await expect(page.getByText(/\d+ bullets/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /compile pdf/i }).click();
  await expect(page.locator('iframe[title="résumé preview"]')).toBeVisible({ timeout: 30_000 });
});
