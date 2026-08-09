import { test, expect, type Page } from '@playwright/test';
import { apiPost, expectOkJson } from './helpers/api.js';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { addOpenRole } from './helpers/fixtures';

/**
 * Screen 9: the organization profile. It answers "should I care about this
 * company, and who do I know there", so the spec is mostly about whether the
 * facts that make an org actionable actually reach the page.
 */

const ORG = '**/api/v1/orgs/*';

async function openOrg(page: Page, name: string) {
  await page.goto('/orgs');
  await page.locator('.people__link').first().waitFor();
  const href = await page.locator('.people__link').filter({ hasText: name }).first().getAttribute('href');
  if (!href) throw new Error(`seed has no organization named ${name}`);
  await page.goto(href);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return href;
}

test('open roles reach the profile, not just the list', async ({ page }) => {
  await signIn(page);
  const href = await openOrg(page, 'Nile Robotics');
  const orgId = href.split('/orgs/')[1]!;

  /** How many open roles the profile currently claims. */
  const shown = async () => {
    const chip = page.getByText(/^\d+ open roles?$/);
    return (await chip.count()) ? Number((await chip.innerText()).replace(/\D/g, '')) : 0;
  };

  // Relative, not absolute: no seeded org has an opening, but this spec adds
  // one every time it runs, so asserting "zero before" would only pass once.
  const before = await shown();
  await addOpenRole(page, orgId, `E2E Opening ${Date.now()}`);
  await page.goto(href);
  await expect(page.getByRole('heading', { name: 'Nile Robotics' })).toBeVisible();

  // openRoles is computed by the API and declared in the client's own type,
  // and the profile rendered it nowhere, the hiring signal was visible on the
  // Orgs list and vanished the moment you opened the org.
  expect(await shown()).toBe(before + 1);
  await expect(
    page.getByRole('region', { name: /^Roles/ }).getByText('open', { exact: true }).first(),
  ).toBeVisible();
});

test('the header carries the numbers, in mono, without a colour band', async ({ page }) => {
  await signIn(page);
  await openOrg(page, 'Nile Robotics');

  const sub = page.getByText(/known · affinity/);
  await expect(sub).toBeVisible();
  await expect(sub.locator('.u-mono').first()).toHaveText(/^\d+$/);
  await expect(sub.locator('.u-mono').last()).toHaveText(/^\d\.\d{2}$/);
});

test('inroad strength is one hue at varying weight, never two bands', async ({ page }) => {
  await signIn(page);
  await openOrg(page, 'Nile Robotics');

  const inroads = page.getByRole('region', { name: /^Inroads/ });
  const bars = inroads.locator('.vt-strength');
  await expect(bars.first()).toBeVisible();

  // Was accent above 0.6 and muted below: two colours banding a continuous
  // value, which reads as two categories.
  const rows = await bars.evaluateAll((els) =>
    els.map((el) => ({
      value: Number((el.querySelector('.vt-strength__value') as HTMLElement).textContent),
      bg: getComputedStyle(el.querySelector('.vt-strength__fill') as HTMLElement).backgroundColor,
    })),
  );
  expect(new Set(rows.map((r) => r.bg)).size).toBe(1);
  for (const r of rows) expect(r.value).toBeGreaterThanOrEqual(0);
});

test('each empty region says something different, and something useful', async ({ page }) => {
  await signIn(page);
  // A seeded org with no people, no roles and no org links.
  await openOrg(page, 'Helio Health');

  await expect(page.getByText('No inroads yet')).toBeVisible();
  await expect(page.getByText('No linked roles')).toBeVisible();
  await expect(page.getByText('No org links yet')).toBeVisible();
});

test('a related org states which way the relationship points', async ({ page }) => {
  await signIn(page);
  const href = await openOrg(page, 'Nile Robotics');
  const orgId = href.split('/orgs/')[1]!;

  const other = await apiPost(page, '/nodes', {
    type: 'organization',
    title: `E2E Parent ${Date.now()}`,
    props: {},
  });
  const otherId = (await expectOkJson<{ node: { id: string } }>(other, 'parent org')).node.id;
  await expectOkJson(
    await apiPost(page, '/edges', {
      type: 'ORG_RELATED',
      src: otherId,
      dst: orgId,
      props: { kind: 'parent' },
    }),
    'ORG_RELATED',
  );

  await page.goto(href);
  const related = page.getByRole('region', { name: /^Related organizations/ });
  // A bare "←" made the reader work out which way a parent link pointed.
  // .first(): each run adds a parent, so the count is not the claim here.
  await expect(related.getByText(/of this org/).first()).toBeVisible();
  await expect(related.getByText('←')).toHaveCount(0);
});

test('a failed load names the organization and offers a retry', async ({ page }) => {
  await signIn(page);
  const href = await openOrg(page, 'Nile Robotics');

  await page.route(ORG, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the graph is unreachable"}}',
    }),
  );
  await page.goto(href);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this organization');
  await expect(alert).toContainText('the graph is unreachable');
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('a failed delete says so instead of silently doing nothing', async ({ page }) => {
  await signIn(page);
  const href = await openOrg(page, 'Helio Health');

  await page.route('**/api/v1/nodes/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"error":{"code":"conflict","message":"something still links here"}}',
        })
      : route.continue(),
  );

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Move to trash' }).click();

  // Delete was a bare `void del()` outside useMutation: it never reached the
  // global error toast, and the dialog closed before it settled, so a failure
  // left the page looking as though nothing had been asked of it.
  await expect(page.locator('.toast')).toContainText('something still links here');
  await expect(page).toHaveURL(href);
  await expect(page.getByRole('heading', { name: 'Helio Health' })).toBeVisible();
});

test('the organization profile has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await openOrg(page, 'Nile Robotics');
  await expectNoA11yViolations(page);
});
