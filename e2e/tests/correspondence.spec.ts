import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Correspondence (FR-COMM-002): the rollup screen exists under Network,
 * reachable from the hub, honest in every state. The ranking's substance is
 * proven at the API layer (correspondence.integration.test.ts), where the
 * dormant-but-once-strong fixture is constructable; here the claims are the
 * surface's: reachable, distinct states, accessible.
 */

test('correspondence is reachable from the network hub and states its register', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/network');
  await page.getByRole('link', { name: /^Correspondence/ }).click();
  await expect(page).toHaveURL(/\/network\/correspondence$/);
  await expect(page.getByRole('heading', { name: 'Correspondence' })).toBeVisible();
  // Both registers render whatever the graph holds: a ranked list with its
  // considered count, or an empty state that says which kind of empty.
  await expect(page.getByRole('heading', { name: 'Worth reactivating' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brokers' })).toBeVisible();
});

test('a failed rollup names itself instead of posing as a quiet graph', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/correspondence**', (route) => route.abort());
  await page.goto('/network/correspondence');
  await expect(page.getByText('Couldn’t load correspondence')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('No dormant ties')).toHaveCount(0);
});

test('correspondence has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await page.goto('/network/correspondence');
  await expect(page.getByRole('heading', { name: 'Correspondence' })).toBeVisible();
  await expectNoA11yViolations(page);
});
