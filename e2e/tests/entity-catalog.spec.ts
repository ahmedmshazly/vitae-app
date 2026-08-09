import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 31: Entity catalogue / observatory (`/reference/entities`).
 *
 * Quiet: flat chrome (no aurora wash/grid), achromatic active markers, and
 * group chroma only via viz slots. Behaviour of lenses/workspaces stays intact.
 */

test('the observatory chrome is flat Quiet, not an aurora wash', async ({ page }) => {
  await page.goto('/reference/entities');

  await expect(
    page.getByRole('heading', { name: 'Relation intelligence, without the hairball.' }),
  ).toBeVisible();

  const header = page.locator('.ec-observatory-header');
  await expect(header).toBeVisible();
  const headerImage = await header.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(headerImage, 'header must not carry a gradient or grid texture').toBe('none');

  const viewport = page.locator('.ec-observatory-viewport');
  const viewportImage = await viewport.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(viewportImage, 'viewport must be a flat surface').toBe('none');

  const activeLens = page.locator('.ec-lens-switcher button.is-active');
  const glow = await activeLens.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(glow === 'none' || !/rgb\(\s*(72|80|101)\s*,/.test(glow), 'active lens must not cyan-glow').toBeTruthy();
});

test('orbit, focus, and matrix lenses stay operable', async ({ page }) => {
  await page.goto('/reference/entities');

  const lenses = page.getByRole('group', { name: 'Observatory lens' });
  await expect(lenses.getByRole('button', { name: /Orbit/ })).toHaveAttribute('aria-pressed', 'true');

  await lenses.getByRole('button', { name: /Matrix/ }).click();
  await expect(page.getByText(/A line-free audit surface/)).toBeVisible();

  await lenses.getByRole('button', { name: /Focus/ }).click();
  await expect(page.getByRole('heading', { name: /Focus needs a center/i })).toBeVisible();
});

test('the observatory page has no automated a11y violations', async ({ page }) => {
  await page.goto('/reference/entities');
  await expect(
    page.getByRole('heading', { name: 'Relation intelligence, without the hairball.' }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
