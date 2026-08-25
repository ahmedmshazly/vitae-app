import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 29: Tour (`/tour`).
 *
 * Quiet walkthrough: stop rail + one product frame. No glow on the active
 * stop, no brand-gradient progress fill, and Today copy that matches the
 * rebuilt momentum score (not a ring).
 *
 * The rail carries seven stops, keyed `01 · CAPTURE` through `07 · KEEP`.
 * Their titles are the accessible names; the keys are decoration.
 */

test('the first stop shows capture with a quiet progress bar', async ({ page }) => {
  await page.goto('/tour');

  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Seven stops from a fresh detail to a career move.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: /Capture the detail before it goes vague/i }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /command capture/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Previous/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Next stop/ })).toBeVisible();

  const progress = page.getByRole('progressbar', { name: /Stop 1 of 7/i });
  await expect(progress).toBeVisible();
  const fill = page.locator('.mk-tour__progressfill');
  const fillImage = await fill.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(fillImage, 'progress fill must be a solid colour, not a gradient').toBe('none');

  const active = page.locator('.mk-tour__stop--on');
  const markerGlow = await active.evaluate((el) => getComputedStyle(el, '::before').boxShadow);
  expect(
    markerGlow === 'none' || markerGlow === '',
    'active stop marker must not glow',
  ).toBeTruthy();
});

test('rail, next, and arrow keys advance stops; sign-in stays reachable', async ({ page }) => {
  await page.goto('/tour');

  await page.getByRole('tab', { name: /Return to the next useful action/i }).click();
  await expect(page.getByRole('img', { name: /momentum score/i })).toBeVisible();
  // The score is named in the frame's own label now, not in the body prose.
  await expect(page.getByText(/the daily operating view/i).first()).toBeVisible();
  await expect(page.getByText(/momentum ring/i)).toHaveCount(0);
  await expect(page.getByText(/flame/i)).toHaveCount(0);

  await page.getByRole('button', { name: /Next stop/ }).click();
  await expect(
    page.getByRole('tab', { name: /Keep the output and the exit path/i }),
  ).toHaveAttribute('aria-selected', 'true');

  const connectTab = page.getByRole('tab', { name: /See the record through its relationships/i });
  await connectTab.click();
  await connectTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: /Read a warm route before you make an ask/i }),
  ).toHaveAttribute('aria-selected', 'true');

  // The last stop closes on the tour CTA; the way into the product is the
  // primary nav, which the walkthrough never takes away.
  await page.getByRole('tab', { name: /Keep the output and the exit path/i }).click();
  await expect(page.getByRole('link', { name: 'Take the product tour' }).first()).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL(/\/signin/);
});

test('the tour page has no automated a11y violations', async ({ page }) => {
  await page.goto('/tour');
  await expect(
    page.getByRole('heading', { name: 'Seven stops from a fresh detail to a career move.' }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
