import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';

/**
 * Tailor wording emphasis + accent controls. Requires demo seed + buildsvc.
 */
test('tailor exposes wording emphasis and accent controls before compile', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/tailor');

  await page.getByText('Machine Learning Engineer').first().click();
  await expect(page).toHaveURL(/target=/);
  await expect(page.getByText(/Weighted keywords \(/)).toBeVisible({ timeout: 10_000 });

  await expect(page.getByLabel('Wording emphasis')).toBeVisible();
  await page.getByLabel('Wording emphasis').selectOption('leadership');

  const teal = page.getByRole('button', { name: /Use #0f766e accent/i });
  await expect(teal).toBeVisible();
  await teal.click();
  await expect(teal).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'manual', exact: true }).click();
  await expect(page.getByText(/all atoms/i)).toBeVisible({ timeout: 10_000 });
  const atomChecks = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  await atomChecks.nth(0).check();
  await expect(page.getByText(/included, drag/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /compile pdf/i }).click();
  await expect(page.locator('iframe[title="résumé preview"]')).toBeVisible({ timeout: 30_000 });
});
