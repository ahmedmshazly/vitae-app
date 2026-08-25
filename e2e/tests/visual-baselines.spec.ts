/**
 * Visual baselines for stable marketing/auth surfaces (Chromium desktop).
 *
 * Stack must be up (`pnpm dev` or CI preview). After intentional UI changes:
 *   pnpm test:visual -- --update-snapshots
 * Review the PNGs under `visual-baselines.spec.ts-snapshots/` before committing.
 */
import { expect, test } from '@playwright/test';

test.describe('visual baselines', () => {
  test.use({
    // Deterministic chrome for screenshot contracts.
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
    // reducedMotion belongs to the browser context, not to the test options.
    // Spelled at the top level it type-checks as an unknown key and is dropped,
    // so until now nothing here asked for reduced motion at all. Under it the
    // token durations in packages/ui/src/styles/tokens.css collapse to 0ms,
    // which is what makes the entrance animations settle before the shot.
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('landing hero (desktop)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page).toHaveScreenshot('landing-hero.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('sign-in splash (desktop)', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page).toHaveScreenshot('signin-splash.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
