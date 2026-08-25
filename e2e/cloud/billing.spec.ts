import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../tests/helpers/a11y';
import { accessState, deliverSubscriptionStatus, signInToCloud } from './helpers/cloud';

/**
 * Cloud mode: the billing screen, against the real API.
 *
 * `apps/web/src/routes/Billing.test.tsx` covers this component with `api`,
 * `useAuth` and `lib/paddle.js` all mocked, which leaves two things it cannot
 * claim. `docs/testing/source-test-map.json` says so about the second in as
 * many words: the checkout script loader and its readiness probe are unproven,
 * and need a browser-level test. This is that test.
 *
 * The first is simpler and just as easy to get wrong: that the screen is
 * reachable at all when Cloud is on, and that the state it shows is the state
 * the control plane is actually in.
 */

test.afterEach(async ({ page }) => {
  await deliverSubscriptionStatus(page, 'active');
});

test('the billing screen exists when Cloud is on, and names the access state', async ({ page }) => {
  await signInToCloud(page);
  await page.goto('/settings/billing');

  await expect(page.getByRole('heading', { name: 'Billing & access' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Workspace access' })).toBeVisible();
  await expect(page.getByText('Paid access active')).toBeVisible();
});

test('a locked workspace is named here too, with the export that still works', async ({ page }) => {
  await signInToCloud(page);
  await deliverSubscriptionStatus(page, 'canceled');
  expect(await accessState(page)).toBe('read_only');

  await page.goto('/settings/billing');
  await expect(page.getByText('Read-only access')).toBeVisible({ timeout: 15_000 });
  // The same door the shell banner offers, from the screen that can undo it.
  await expect(page.getByRole('link', { name: /Export your record/i })).toHaveAttribute(
    'href',
    '/data/exports',
  );
});

test('a build with no provider token never offers checkout', async ({ page }) => {
  await signInToCloud(page);
  await page.goto('/settings/billing');
  await expect(page.getByRole('heading', { name: 'Billing & access' })).toBeVisible({
    timeout: 15_000,
  });

  // paddleCheckoutReady() reads VITE_PADDLE_CLIENT_TOKEN, which this bundle is
  // built without on purpose: a gate that could reach a payment provider is a
  // gate that will, one day, on someone's card.
  //
  // Which of the aside's three forks renders depends on whether a subscription
  // exists, and the specs above leave one behind. The claim worth holding does
  // not: no fork may offer a way to pay.
  await expect(page.getByRole('button', { name: /secure checkout/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue to/i })).toHaveCount(0);
});

test('billing sits in the settings navigation on a Cloud build', async ({ page }) => {
  await signInToCloud(page);
  await page.goto('/settings');
  // The screen existed in the route table, the breadcrumb, and the Settings
  // tiles, but not in the workspace strip - reachable only by tile or by the
  // access banner. On a Cloud build the strip now lists it like any other
  // settings destination; a self-hosted build still omits it, because there
  // the address redirects away.
  await expect(page.getByRole('link', { name: 'Billing & access' }).first()).toHaveAttribute(
    'href',
    '/settings/billing',
  );
});

test('the billing screen has no automated a11y violations', async ({ page }) => {
  await signInToCloud(page);
  await page.goto('/settings/billing');
  await expect(page.getByRole('heading', { name: 'Billing & access' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoA11yViolations(page);
});
