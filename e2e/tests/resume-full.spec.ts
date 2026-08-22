import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';

/**
 * Full résumé journey in the DEMO space (rich seeded data): manual atom
 * selection with checkboxes, compile to a real PDF, finalize, and see the
 * output in the library. Requires `pnpm seed:demo` + the buildsvc container.
 */

test('manual selection → compile → finalize → appears in Outputs', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/tailor');

  // Open the seeded Aurora Dynamics target and wait for it to hydrate
  // (keyword chips render in the same commit as the draft hydration).
  await page.getByText('Machine Learning Engineer').first().click();
  await expect(page).toHaveURL(/target=/);
  await expect(page.getByRole('heading', { name: /^Weighted keywords/ })).toBeVisible({
    timeout: 10_000,
  });

  // Switch to manual mode and hand-pick three atoms.
  await page.getByRole('button', { name: 'manual', exact: true }).click();
  await expect(page.getByText(/all atoms/i)).toBeVisible({ timeout: 10_000 });
  const atomChecks = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  await atomChecks.nth(0).check();
  await atomChecks.nth(1).check();
  await atomChecks.nth(2).check();

  // The included list + page meter reflect the manual picks.
  await expect(page.getByText(/included, drag/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.vt-meter').first()).toBeVisible({ timeout: 10_000 });

  // Compile → PDF preview.
  await page.getByRole('button', { name: /compile pdf/i }).click();
  await expect(page.locator('iframe[title="résumé preview"]')).toBeVisible({ timeout: 30_000 });

  // Finalize → status card with the gates, then the output shows up in Outputs.
  await page.getByRole('button', { name: /^finalize$/i }).click();
  await expect(page.getByText(/finalized|saved as draft/i)).toBeVisible({ timeout: 30_000 });

  await page.goto('/resume/outputs');
  await expect(page.getByText(/aurora dynamics/i).first()).toBeVisible({ timeout: 10_000 });
});
