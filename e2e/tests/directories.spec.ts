import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 8: the People and Orgs directories. Their one job is letting you
 * find someone, so this spec is mostly about the filter: whether it says which
 * one is applied, and whether it tells the truth when it matches nothing.
 */

const PEOPLE = '**/api/v1/people';
const ORGS = '**/api/v1/orgs';

async function goPeople(page: Page) {
  await page.goto('/people');
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
}

test('a filter that matches nothing says so, and offers a way back', async ({ page }) => {
  await signIn(page);
  await goPeople(page);

  const total = Number((await page.getByText(/\d+ people ·/).innerText()).replace(/\D/g, '').slice(0, 3));
  expect(total).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Family' }).click();

  // The empty check used the *filtered* list, so this showed "No one here yet
  //, add people you know" and a New-person button on a graph of 118 people.
  await expect(page.getByText(/No one matches family/i)).toBeVisible();
  await expect(page.getByText(/none of them fit this filter/i)).toBeVisible();
  await expect(page.getByText('No one here yet')).toHaveCount(0);

  // And the action is the one that helps: clear the filter, not add a person.
  await page.getByRole('button', { name: 'Show everyone' }).click();
  // Scoped and exact: "Select all visible" also contains "all".
  await expect(
    page.getByRole('group', { name: 'Filter people' }).getByRole('button', { name: 'All', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem').or(page.locator('.people__link')).first()).toBeVisible();
});

test('the header count distinguishes how many there are from how many are shown', async ({ page }) => {
  await signIn(page);
  await goPeople(page);

  const sub = page.getByText(/sorted by tie strength/);
  await expect(sub).not.toContainText('shown');

  await page.getByRole('button', { name: 'Closest' }).click();
  await expect(sub).toContainText('shown');

  const shownInHeader = Number((await sub.innerText()).match(/·\s*(\d+)\s*shown/)![1]);
  const inSection = Number((await page.getByRole('heading', { name: /^Closest/ }).innerText()).replace(/\D/g, ''));
  expect(shownInHeader).toBe(inSection);
});

test('the applied filter is announced, not just coloured', async ({ page }) => {
  await signIn(page);
  await goPeople(page);

  const group = page.getByRole('group', { name: 'Filter people' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await group.getByRole('button', { name: 'Decaying' }).click();
  await expect(group.getByRole('button', { name: 'Decaying' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // Exactly one at a time, these are mutually exclusive.
  expect(await group.locator('[aria-pressed="true"]').count()).toBe(1);
});

test('strength is one hue at varying weight, with the number always present', async ({ page }) => {
  await signIn(page);
  await goPeople(page);

  // `evaluateAll` does not auto-wait, and the heading `goPeople` waits for
  // renders before the query resolves, so without this the assertion could
  // read the skeletons and see zero rows. It did, once, under a full-suite run.
  await page.locator('.vt-strength').first().waitFor();

  // Read each row's printed value alongside its fill, so the assertion does
  // not depend on which people happen to be in the list, earlier specs in the
  // suite create and delete people, and a fixed expectation about how many
  // distinct strengths are on screen is order-dependent.
  const rows = await page.locator('.vt-strength').evaluateAll((els) =>
    els.map((el) => {
      const fill = el.querySelector('.vt-strength__fill') as HTMLElement;
      return {
        value: Number((el.querySelector('.vt-strength__value') as HTMLElement).textContent),
        bg: getComputedStyle(fill).backgroundColor,
        opacity: Number(getComputedStyle(fill).opacity),
      };
    }),
  );
  expect(rows.length).toBeGreaterThan(3);

  // One hue: a three-way colour band reads as three categories, but magnitude
  // is a sequential scale.
  expect(new Set(rows.map((r) => r.bg)).size).toBe(1);

  // And weight tracks the value, for every pair that differs.
  for (const a of rows) {
    for (const b of rows) {
      if (a.value > b.value) expect(a.opacity).toBeGreaterThan(b.opacity);
    }
  }

  await expect(page.locator('.vt-strength__value').first()).toHaveText(/^\d\.\d{2}$/);
});

test('an empty graph invites a first person, with no duplicate control name', async ({ page }) => {
  await page.route(PEOPLE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"people":[]}' }),
  );
  await signIn(page);
  await goPeople(page);

  await expect(page.getByText('No one here yet')).toBeVisible();
  // The header button and the empty-state button are both on screen; sharing
  // one accessible name makes them ambiguous by name and by voice.
  await expect(page.getByRole('button', { name: 'Add your first person' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New person' })).toHaveCount(1);
});

test('organizations get the same treatment', async ({ page }) => {
  await signIn(page);
  await page.goto('/orgs');
  await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /^All organizations/ })).toBeVisible();
  await expect(page.locator('.vt-strength__value').first()).toHaveText(/^\d\.\d{2}$/);
});

test('a failed load names the directory and offers a retry', async ({ page }) => {
  await signIn(page);
  await page.route(ORGS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the graph is unreachable"}}',
    }),
  );
  await page.goto('/orgs');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load your organizations');
  await expect(alert).toContainText('the graph is unreachable');
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('both directories have no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goPeople(page);
  await expectNoA11yViolations(page);

  await page.goto('/orgs');
  await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});
