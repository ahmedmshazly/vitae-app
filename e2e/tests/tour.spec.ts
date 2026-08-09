import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 29: Tour (`/tour`).
 *
 * Quiet walkthrough: stop rail + one product frame. No glow on the active
 * stop, no brand-gradient progress fill, and Today copy that matches the
 * rebuilt momentum score (not a ring).
 */

test('the first stop shows capture with a quiet progress bar', async ({ page }) => {
  await page.goto('/tour');

  await expect(page.getByRole('heading', { name: 'Five stops, two minutes.' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Capture anything in one line/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('img', { name: /capture bar/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous stop' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next stop' })).toBeVisible();

  const progress = page.getByRole('progressbar', { name: /Stop 1 of 5/i });
  await expect(progress).toBeVisible();
  const fill = page.locator('.mk-tour__progressfill');
  const fillImage = await fill.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(fillImage, 'progress fill must be a solid colour, not a gradient').toBe('none');

  const active = page.locator('.mk-tour__stop--on');
  const markerGlow = await active.evaluate((el) => getComputedStyle(el, '::before').boxShadow);
  expect(markerGlow === 'none' || markerGlow === '', 'active stop marker must not glow').toBeTruthy();
});

test('rail, next, and arrow keys advance stops; last stop offers sign-in', async ({ page }) => {
  await page.goto('/tour');

  await page.getByRole('tab', { name: /A day with momentum/i }).click();
  await expect(page.getByRole('img', { name: /momentum score/i })).toBeVisible();
  await expect(page.getByText(/momentum score/i).first()).toBeVisible();
  await expect(page.getByText(/momentum ring/i)).toHaveCount(0);
  await expect(page.getByText(/flame/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Next stop' }).click();
  await expect(page.getByRole('tab', { name: /Relationships with instrumentation/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /The shape of your life/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('tab', { name: /Forms when you want depth/i }).click();
  await expect(page.getByRole('link', { name: /Get started/i })).toBeVisible();
  await page.getByRole('link', { name: /Get started/i }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test('the tour page has no automated a11y violations', async ({ page }) => {
  await page.goto('/tour');
  await expect(page.getByRole('heading', { name: 'Five stops, two minutes.' })).toBeVisible();
  await expectNoA11yViolations(page);
});
