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

interface ApiHop {
  title: string;
  viaEdgeType?: string;
  viaStrength?: number;
}

interface IntroPathsPayload {
  paths: Array<{ hops: ApiHop[] }>;
}

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
  const pathsResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/intros/paths?') && response.status() === 200,
  );
  await goIntros(page);
  const { paths } = (await (await pathsResponse).json()) as IntroPathsPayload;

  // Named hops, not “the first article that says chains into”: a richer seed
  // can insert other multi-hop paths ahead of this one without changing the
  // Lina → Karim sentence this spec is actually about.
  const multi = reach(page)
    .locator('article')
    .filter({ hasText: 'Lina Farouk' })
    .filter({ hasText: 'Karim Nabil' });
  await expect(multi).toBeVisible();
  await expect(multi).toContainText('chains into');
  await expect(multi.getByText('works there', { exact: true })).toBeVisible();

  const lines = await multi.locator('.network-path__line').evaluateAll((els) =>
    els.map((e) => ({
      bg: getComputedStyle(e).backgroundColor,
      opacity: Number(getComputedStyle(e).opacity),
    })),
  );
  expect(lines).toHaveLength(3);

  expect(new Set(lines.map((l) => l.bg)).size).toBe(1);

  // Earlier journeys can record a real interaction with Lina. The API then
  // recomputes that tie at full precision, while the label stays rounded for
  // people. Bind each visual line to the response that supplied it.
  const apiPath = paths.find((path) =>
    path.hops.some((hop) => hop.title === 'Lina Farouk') &&
    path.hops.some((hop) => hop.title === 'Karim Nabil'),
  );
  expect(apiPath).toBeDefined();
  const apiTies =
    apiPath?.hops.filter((hop) => hop.viaEdgeType === 'knows' && hop.viaStrength != null) ?? [];
  expect(apiTies).toHaveLength(2);

  const ties = await multi.locator('.network-path__connector').evaluateAll((els) =>
    els
      .map((connector) => {
        const line = connector.querySelector<HTMLElement>('.network-path__line');
        return {
          label: connector.textContent?.trim() ?? '',
          opacity: Number(line ? getComputedStyle(line).opacity : Number.NaN),
        };
      })
      .filter((tie) => /^knows · \d\.\d\d$/.test(tie.label)),
  );
  expect(ties).toHaveLength(apiTies.length);

  expect(ties.map((tie) => tie.label)).toEqual(
    apiTies.map((tie) => `knows · ${tie.viaStrength!.toFixed(2)}`),
  );
  expect(apiTies[1]?.viaStrength).toBeCloseTo(0.3, 2);
  expect(apiTies[0]?.viaStrength).not.toBeCloseTo(apiTies[1]?.viaStrength ?? Number.NaN, 2);
  for (const [index, tie] of ties.entries()) {
    expect(tie.opacity).toBeCloseTo(0.2 + 0.8 * apiTies[index]!.viaStrength!, 3);
  }
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
  await expect(cards.first()).toContainText('Path 1');

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

test('a chained path shows every server evidence factor', async ({ page }) => {
  await signIn(page);
  await goIntros(page);

  const evidence = reach(page)
    .locator('article')
    .filter({ hasText: 'Lina Farouk' })
    .filter({ hasText: 'Karim Nabil' })
    .filter({ hasText: 'chains into' })
    .locator('[aria-label="Path evidence"]');
  await expect(evidence.locator('.vt-chip')).toHaveCount(4);
  await expect(evidence).toContainText('2 hops');
  await expect(evidence).toContainText('Works there');
  await expect(evidence).toContainText('Weak tie');
  await expect(evidence).toContainText('Weak path');
});

test('path evidence keeps every supplied factor', async ({ page }) => {
  const target = {
    id: 'evidence-org',
    title: 'Evidence Organization',
    kind: 'company',
    city: null,
    stage: null,
    reach: '2 hops',
    reachable: true,
    affinity: 0.5,
    peopleCount: 2,
    openRoles: 0,
  };
  const factors = ['2 hops', 'Works there', 'Medium tie', 'Medium path', 'Recent introduction'];
  await page.route(TARGETS, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ targets: [target] }),
    }),
  );
  await page.route(PATHS, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        org: { id: target.id, title: target.title },
        paths: [
          {
            hops: [
              { nodeId: 'evidence-self', title: 'You', type: 'person' },
              {
                nodeId: 'evidence-ari',
                title: 'Ari Rivera',
                type: 'person',
                viaEdgeType: 'knows',
                viaStrength: 0.5,
              },
              {
                nodeId: 'evidence-bea',
                title: 'Bea Gomez',
                type: 'person',
                viaEdgeType: 'knows',
                viaStrength: 0.3,
              },
              {
                nodeId: target.id,
                title: target.title,
                type: 'organization',
                viaEdgeType: 'works_at',
                viaStrength: 0.9,
              },
            ],
            score: 0.135,
            strengthLabel: 'medium',
            askerId: 'evidence-ari',
            askerName: 'Ari Rivera',
            why: 'Ari Rivera → Bea Gomez chains into Evidence Organization; every factor is visible.',
            factors,
          },
        ],
      }),
    }),
  );

  await signIn(page);
  await goIntros(page);

  const evidence = reach(page).locator('[aria-label="Path evidence"]');
  await expect(evidence.locator('.vt-chip')).toHaveCount(factors.length);
  for (const factor of factors)
    await expect(evidence.getByText(factor, { exact: true })).toBeVisible();
});

test('warm intros has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goIntros(page);
  await expect(reach(page).locator('article').first()).toBeVisible();
  await expectNoA11yViolations(page);
});
