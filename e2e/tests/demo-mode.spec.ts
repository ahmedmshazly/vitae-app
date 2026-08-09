import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';

/** Demo/real space toggle: banner, isolated data, and a clean way back. */

test('toggle into the demo space and back', async ({ page }) => {
  await signIn(page);

  // Real space: no banner.
  await expect(page.getByText(/demo space/i)).toBeHidden();

  // Toggle on via the topbar chip.
  await page.getByRole('button', { name: /view demo/i }).click();
  await expect(page.getByText(/demo space/i)).toBeVisible({ timeout: 10_000 });

  // Demo data is present (seeded Jordan graph → targets in the Tailor rail).
  await page.goto('/resume/tailor');
  await expect(page.getByText('Machine Learning Engineer').first()).toBeVisible({ timeout: 10_000 });

  // Back to real data via the banner link.
  await page.getByRole('button', { name: /back to my data/i }).click();
  await expect(page.getByText(/demo space/i)).toBeHidden({ timeout: 10_000 });
});
