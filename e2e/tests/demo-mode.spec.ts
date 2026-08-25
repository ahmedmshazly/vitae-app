import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/** Demo/real space toggle: banner, isolated data, and a clean way back. */

test('toggle into the demo space and back', async ({ page }) => {
  await signIn(page);

  // Real space: no banner.
  await expect(page.getByText(/demo space/i)).toBeHidden();

  // Toggle on via the topbar chip.
  await page.getByRole('button', { name: /view demo/i }).click();
  await expect(page.getByText(/demo space/i)).toBeVisible({ timeout: 10_000 });

  // The banner is chrome that exists in no other state, so nothing else scans
  // it. Every other screen these specs reach is scanned by the spec that owns
  // it; docs/testing/e2e-ratchets.json records that mapping and the gate checks
  // it, which is a stronger claim than counting how many files call the helper.
  await expectNoA11yViolations(page);

  // Demo data is present (seeded Jordan graph → targets in the Tailor rail).
  await page.goto('/resume/tailor');
  await expect(page.getByText('Machine Learning Engineer').first()).toBeVisible({ timeout: 10_000 });

  await page.goto('/intros');
  const aurora = page
    .getByRole('region', { name: 'Pursuing' })
    .getByRole('button', { name: /Aurora Dynamics/ });
  await aurora.click();
  const paths = page.getByRole('region', { name: 'Reach Aurora Dynamics' });
  await expect(paths.locator('article').filter({ hasText: 'chains into' }).first()).toContainText(
    'Jean-Paul Habimana → Marc Uwimana chains into Aurora Dynamics',
  );

  // Back to real data via the banner link.
  await page.getByRole('button', { name: /back to my data/i }).click();
  await expect(page.getByText(/demo space/i)).toBeHidden({ timeout: 10_000 });
});
