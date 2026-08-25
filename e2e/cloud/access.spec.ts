import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../tests/helpers/a11y';
import { API_BASE, devToken } from '../tests/helpers/api';
import { accessState, deliverSubscriptionStatus, signInToCloud } from './helpers/cloud';

/**
 * Cloud mode: what a workspace that can no longer be written to does.
 *
 * `entitlementGate` refuses every non-GET from a `read_only` or
 * `deletion_pending` workspace with 402 PAYMENT_REQUIRED, and 70 endpoints are
 * marked blocked-when-read-only. The API side of that is covered by
 * `apps/api/src/routes/v1/cloud.integration.test.ts`. What no test could reach
 * until this file existed is what a person sees, which for a long time was
 * nothing at all: every write control enabled, no explanation, and no route to
 * billing or an export.
 *
 * These run against a real API started with VITAE_CLOUD_ENABLED=true and move
 * the access state by delivering signed provider events, not by writing to the
 * database. See helpers/cloud.ts for why that distinction matters.
 */

// Each test puts the workspace back so the next one starts from a known state,
// and the file runs alone in its own Playwright invocation.
test.afterEach(async ({ page }) => {
  await deliverSubscriptionStatus(page, 'active');
});

test('the owner claims the pre-Cloud workspace and can still write', async ({ page }) => {
  await signInToCloud(page);
  expect(await accessState(page)).toBe('active');

  const created = await page.request.post(`${API_BASE}/nodes`, {
    headers: {
      authorization: `Bearer ${await devToken(page)}`,
      'content-type': 'application/json',
    },
    data: { type: 'person', title: `Cloud writer ${Date.now()}`, props: {} },
  });
  expect(created.status(), await created.text()).toBe(201);
});

test('a locked workspace says so, and offers the two ways out', async ({ page }) => {
  await signInToCloud(page);
  await deliverSubscriptionStatus(page, 'canceled');
  await page.reload();

  const banner = page.getByRole('status', { name: 'Workspace access' });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText(/read-only/i);
  // Naming the state is half of it. The other half is that both doors the API
  // leaves open are on the banner: export still works, billing can undo this.
  await expect(banner.getByRole('link', { name: 'Export your record' })).toHaveAttribute(
    'href',
    '/data/exports',
  );
  await expect(banner.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
    'href',
    '/settings/billing',
  );
});

test('a locked workspace refuses the write the banner warns about', async ({ page }) => {
  await signInToCloud(page);
  await deliverSubscriptionStatus(page, 'canceled');
  expect(await accessState(page)).toBe('read_only');

  const refused = await page.request.post(`${API_BASE}/nodes`, {
    headers: {
      authorization: `Bearer ${await devToken(page)}`,
      'content-type': 'application/json',
    },
    data: { type: 'person', title: `Refused ${Date.now()}`, props: {} },
  });
  expect(refused.status()).toBe(402);
  const body = (await refused.json()) as {
    error?: { code?: string; details?: { access_state?: string; billing_action?: string } };
  };
  expect(body.error?.code).toBe('PAYMENT_REQUIRED');
  expect(body.error?.details?.access_state).toBe('read_only');
  expect(body.error?.details?.billing_action).toBe('manage_billing');
});

test('reading is untouched while writing is paused', async ({ page }) => {
  await signInToCloud(page);
  await deliverSubscriptionStatus(page, 'canceled');

  const read = await page.request.get(`${API_BASE}/nodes?type=person`, {
    headers: { authorization: `Bearer ${await devToken(page)}` },
  });
  expect(read.status(), await read.text()).toBe(200);
});

test('the locked shell has no automated a11y violations', async ({ page }) => {
  await signInToCloud(page);
  await deliverSubscriptionStatus(page, 'canceled');
  await page.reload();
  await expect(page.getByRole('status', { name: 'Workspace access' })).toBeVisible({
    timeout: 15_000,
  });
  // The banner paints above the queue and arrives first, so waiting on it alone
  // starts the scan while the rows below are still fading in.
  await expect(page.getByRole('region', { name: /^Needs you/ })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('an active workspace raises no banner at all', async ({ page }) => {
  await signInToCloud(page);
  expect(await accessState(page)).toBe('active');
  await expect(page.getByRole('status', { name: 'Workspace access' })).toHaveCount(0);
});
