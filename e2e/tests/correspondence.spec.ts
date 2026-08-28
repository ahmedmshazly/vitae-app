import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiGet, apiPost, expectOkJson } from './helpers/api.js';

/**
 * Correspondence (FR-COMM-002, FR-COMM-001): the rollup screen exists under Network,
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
  await expect(page.getByText("Couldn't load correspondence")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('No dormant ties')).toHaveCount(0);
});

test('correspondence has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await page.goto('/network/correspondence');
  await expect(page.getByRole('heading', { name: 'Correspondence' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('J7: the correspondence truth — imbalance, a recorded broker, and the step into the person', async ({
  page,
}) => {
  await signIn(page);
  const stamp = Date.now();
  const person = async (title: string) => {
    const res = await apiPost(page, '/nodes', { type: 'person', title, props: {} });
    const { node } = await expectOkJson<{ node: { id: string } }>(res, title);
    return node.id;
  };
  const subjectId = await person(`J7 One-sided ${stamp}`);
  const brokerId = await person(`J7 Broker ${stamp}`);
  // The KNOWS edge scopes the tie to self; the interactions carry direction.
  const selfRes = await apiGet(page, '/auth/me');
  const { self } = await expectOkJson<{ self: { id: string } | null }>(selfRes, 'self');
  expect(self, 'the seeded graph has a self person').not.toBeNull();
  await expectOkJson(
    await apiPost(page, '/edges', {
      type: 'KNOWS',
      src: self!.id,
      dst: subjectId,
      props: { closeness: 3 },
    }),
    'knows edge',
  );
  for (let i = 0; i < 4; i += 1) {
    await expectOkJson(
      await apiPost(page, '/interactions', {
        personId: subjectId,
        kind: 'email',
        note: `J7 nudge ${stamp}-${i}`,
        occurredAt: new Date(Date.now() - (20 - i) * 86_400_000).toISOString(),
        initiatedBy: 'me',
        idempotencyKey: `j7-${stamp}-${i}`,
      }),
      'directional interaction',
    );
  }
  await expectOkJson(
    await apiPost(page, '/edges', {
      type: 'INTRODUCED',
      src: self!.id,
      dst: subjectId,
      props: { via: brokerId, occurred_on: '2026-04-02' },
    }),
    'introduced edge',
  );

  await page.goto('/network/correspondence');
  // The imbalance register names the one-sided tie with its split.
  const row = page
    .locator('li')
    .filter({ has: page.getByRole('link', { name: `J7 One-sided ${stamp}` }) })
    .first();
  await expect(row).toContainText('100% yours');
  // The recorded broker is its own labeled group, linked as a person.
  await expect(
    page.getByRole('list', { name: 'Brokers by recorded introduction' }).getByRole('link', {
      name: `J7 Broker ${stamp}`,
    }),
  ).toBeVisible();

  // Step into the person: the profile carries the same figures and the
  // introduction, computed from the same function (two screens, one truth).
  await row.getByRole('link', { name: `J7 One-sided ${stamp}` }).click();
  const panel = page.getByRole('region', { name: 'Correspondence' });
  await expect(panel.getByText('you 4 · them 0')).toBeVisible();
  await panel.getByText('Introductions').click();
  await expect(panel.getByText(new RegExp(`via J7 Broker ${stamp}`))).toBeVisible();
});
