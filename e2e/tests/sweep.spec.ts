import { test, expect } from '@playwright/test';

/**
 * Screen 32: Sweep.
 *
 * Confirms Aurora leftovers stay gone after the Quiet programme: no hero sky,
 * no constellation, and marketing shots resolve from the regenerated set.
 */

test('landing no longer ships constellation or aurora hero chrome', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.locator('.mk-constellation')).toHaveCount(0);
  await expect(page.locator('.mk-hero__sky')).toHaveCount(0);
  await expect(page.locator('.mk-grad')).toHaveCount(0);

  const today = page.getByRole('img', { name: /Today dashboard/i });
  await expect(today).toBeVisible();
  const natural = await today.evaluate((img: HTMLImageElement) => ({
    w: img.naturalWidth,
    h: img.naturalHeight,
  }));
  expect(natural.w).toBeGreaterThan(100);
  expect(natural.h).toBeGreaterThan(100);
});
