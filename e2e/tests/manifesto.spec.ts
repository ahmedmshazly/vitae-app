import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 30: Manifesto (`/manifesto`).
 *
 * Quiet reading surface: one column of prose, flat hairline rules, solid
 * principle markers. No fade-gradient rules and no brand-gradient bullets.
 */

test('the manifesto leads with the quiet instrument claim and holdings', async ({ page }) => {
  await page.goto('/manifesto');

  await expect(
    page.getByRole('heading', { name: 'A quiet instrument for a loud life.' }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'What we hold ourselves to' })).toBeVisible();
  await expect(page.getByText('The data is yours.')).toBeVisible();
  await expect(page.getByText(/no ads and never will be/i)).toBeVisible();
  await expect(page.getByText('Vitae · built in Cairo · 2026')).toBeVisible();
});

test('rules and principle markers stay flat: no gradients', async ({ page }) => {
  await page.goto('/manifesto');

  const rule = page.locator('.mk-manifesto__rule').first();
  await expect(rule).toBeVisible();
  const ruleImage = await rule.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(ruleImage, 'section rules must be a solid hairline').toBe('none');

  const marker = page.locator('.mk-manifesto__list li').first();
  const markerImage = await marker.evaluate((el) => getComputedStyle(el, '::before').backgroundImage);
  expect(markerImage, 'principle markers must be solid, not a brand gradient').toBe('none');
});

test('sign-in and tour are reachable from the closing CTAs', async ({ page }) => {
  await page.goto('/manifesto');

  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/signin/);

  await page.goto('/manifesto');
  await page.getByRole('link', { name: 'Take the tour' }).click();
  await expect(page).toHaveURL(/\/tour/);
});

test('the manifesto page has no automated a11y violations', async ({ page }) => {
  await page.goto('/manifesto');
  await expect(
    page.getByRole('heading', { name: 'A quiet instrument for a loud life.' }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
