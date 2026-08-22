import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 13: Warm paths, mounted at /intros.
 *
 * Paths read left to right as a sentence. Failed lookups must not blame the
 * graph, and strength explanations must not rely on colour alone.
 */

const TARGETS = '**/api/v1/intros/targets';
const PATHS = '**/api/v1/intros/paths*';

function reach(page: Page) {
  return page.getByRole('region', { name: /^Reach / });
}

async function goIntros(page: Page) {
  await page.goto('/intros');
  // Titled Warm paths since the six-workspace IA; /intros stays mounted.
  await expect(page.getByRole('heading', { name: 'Warm paths', exact: true })).toBeVisible();
}

test('a failed path lookup says the lookup failed, not that your graph is empty', async ({ page }) => {
  await signIn(page);
  await page.route(PATHS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the path finder is down"}}',
    }),
  );
  await goIntros(page);

  // `paths.isError` was never checked, so a failed fetch fell through to the
  // empty branch and told the user to go capture people who already exist.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t work out how to reach');
  await expect(alert).toContainText('the path finder is down');
  await expect(page.getByText('No warm path')).toHaveCount(0);
});

test('a failed target list says so instead of showing no organizations', async ({ page }) => {
  await signIn(page);
  await page.route(TARGETS, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"down","message":"the org index is rebuilding"}}',
    }),
  );
  await goIntros(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load your organizations');
  await expect(page.getByText('No organizations yet')).toHaveCount(0);
});

test('an empty graph invites a first organization', async ({ page }) => {
  await signIn(page);
  await page.route(TARGETS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"targets":[]}' }),
  );
  await goIntros(page);

  await expect(page.getByText('No organizations yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open organizations' })).toBeVisible();
});

test('each hop is weighted by its own tie, not by the path’s label', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  // A path with hops of different strengths, "knows · 0.18" then "knows · 0.30".
  const multi = reach(page)
    .locator('article')
    .filter({ hasText: 'chains into' })
    .first();
  await expect(multi).toBeVisible();

  const lines = await multi.locator('[aria-label="Introduction path"] span[style*="opacity"]').evaluateAll((els) =>
    els.map((e) => ({
      bg: getComputedStyle(e).backgroundColor,
      opacity: Number(getComputedStyle(e).opacity),
    })),
  );
  expect(lines.length).toBeGreaterThan(1);

  // One ink. The three classes this replaced painted accent, accent-soft and
  // --ae-warning, which tokens.css forbids as a chart series.
  expect(new Set(lines.map((l) => l.bg)).size).toBe(1);

  // …and the weights differ *within one path*. The old markup handed the path's
  // aggregate label to every edge, so a "knows · 1.00" link on a weak path was
  // drawn as weak, the colour named the wrong link as the problem.
  expect(new Set(lines.map((l) => l.opacity)).size).toBeGreaterThan(1);

  // The number is on the label, so the weight is never the only carrier.
  await expect(multi.getByText(/knows · \d\.\d\d/).first()).toBeVisible();
});

test('the rail shows the facts it orders by', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  // `affinity`, `peopleCount` and `openRoles` were all fetched and none shown;
  // the rail sorted by a number the user never saw.
  const pursuing = page.getByRole('region', { name: 'Pursuing' });
  await expect(pursuing.getByRole('button').first()).toContainText(/\d+ known/);
  await expect(pursuing.getByRole('button').first()).toContainText(/open roles?|known/);

  // Which target is selected is an attribute, not a border tint.
  await expect(pursuing.getByRole('button').first()).toHaveAttribute('aria-current', 'true');
});

test('the destination lives in the URL, and the rail switches it', async ({ page }) => {
  await signIn(page);
  await goIntros(page);
  await expect(page).toHaveURL(/[?&]org=/);

  const before = new URL(page.url()).searchParams.get('org');
  const other = page.getByRole('region', { name: 'No path' }).getByRole('button').first();
  const otherName = (await other.innerText()).split('\n')[0]!.trim();
  await other.click();

  expect(new URL(page.url()).searchParams.get('org')).not.toBe(before);
  await expect(reach(page).getByRole('heading').first()).toContainText(otherName);

  // …and it survives a reload rather than snapping back to the first target.
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url);
});

test('an unreachable organization says so without claiming a failure', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  await page.getByRole('region', { name: 'No path' }).getByRole('button').first().click();
  await expect(page.getByText(/^No warm path to /)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('every path is ranked, and same-named askers stay distinguishable', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  const cards = reach(page).locator('article');
  await expect(cards.first()).toContainText('#1');

  // This graph holds three different people called "Jordan", so three cards
  // offered three controls named "Ask Jordan" pointing at three destinations.
  // The rank is real and makes each one addressable.
  const names = await cards.evaluateAll((els) =>
    els
      .map((el) => el.querySelector('a[aria-label^="Open "]')?.getAttribute('aria-label'))
      .filter((n): n is string => Boolean(n)),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
});

test('the whole explanation is shown, not the first four of it', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  // `factors` was sliced to four; the server emits up to five.
  const chips = reach(page).locator('article').filter({ hasText: 'chains into' }).first().locator('.vt-chip');
  await expect(chips).toHaveCount(5);
});

test('warm intros has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goIntros(page);
  await expect(reach(page).locator('article').first()).toBeVisible();
  await expectNoA11yViolations(page);
});
