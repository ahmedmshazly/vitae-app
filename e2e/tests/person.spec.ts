import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { logInteractions } from './helpers/fixtures';
import { apiPost, expectOkJson } from './helpers/api.js';

/**
 * Screen 7: person profile. The interaction log is the reason this page
 * exists, so most of this spec is about whether it can answer "when did I
 * last speak to this person". The correspondence panel (FR-COMM-001) sits
 * beside that log.
 */

const SUMMARY = '**/api/v1/people/*/summary';

async function openPerson(page: Page, name: string) {
  await page.goto('/people');
  await page.locator('.people__link').first().waitFor();
  const rows = page.locator('.people__link').filter({ hasText: name });
  // The seed holds one person per name. Two rows means an earlier spec left a
  // record behind, and `.first()` would then open whichever of them the list
  // sorted highest and fail three assertions later on missing data. Say which
  // spec broke, here, instead.
  await expect(rows).toHaveCount(1);
  const href = await rows.first().getAttribute('href');
  if (!href) throw new Error(`seed has no person named ${name}`);
  await page.goto(href);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return href;
}

/** The person id out of `/people/:id`. */
function personId(href: string): string {
  return href.split('/people/')[1]!;
}

test('the interaction log carries when and what kind, newest first', async ({ page }) => {
  await signIn(page);
  // The seed gives Sarah a handful of interactions; this needs several with
  // distinct dates to prove the ordering, so it logs its own.
  await logInteractions(page, personId(await openPerson(page, 'Sarah Chen')), 4);
  await openPerson(page, 'Sarah Chen');

  const log = page.getByRole('region', { name: /^Interactions/ });
  const rows = log.getByRole('listitem');
  await expect(rows.first()).toBeVisible();

  // Both `props.occurred_at` and `props.kind` were already on the wire and
  // neither was rendered: the log was 46 undated titles in edge order.
  const dates = await rows.locator('.u-mono').allInnerTexts();
  expect(dates.length).toBeGreaterThan(1);
  const dated = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  // Every seeded interaction carries occurred_at, so "undated" anywhere here
  // means the page stopped reading it, allowing it would make this vacuous.
  expect(dated).toHaveLength(dates.length);
  expect([...dated].sort().reverse()).toEqual(dated);

  // And the kind, which was equally available and equally unread.
  await expect(rows.first().locator('.vt-chip')).toBeVisible();
});

test('a long history is capped, and expands on request', async ({ page }) => {
  await signIn(page);
  // The cap only shows itself above ten rows, and a fresh seed has four.
  await logInteractions(page, personId(await openPerson(page, 'Sarah Chen')), 12);
  await openPerson(page, 'Sarah Chen');

  const log = page.getByRole('region', { name: /^Interactions/ });
  const total = Number((await page.getByRole('heading', { name: /^Interactions/ }).innerText()).replace(/\D/g, ''));
  expect(total).toBeGreaterThan(10);
  // One person's history should not push the rest of the profile into a column.
  await expect(log.getByRole('listitem')).toHaveCount(10);

  await log.getByRole('button', { name: `Show all ${total} interactions` }).click();
  await expect(log.getByRole('listitem')).toHaveCount(total);
  await log.getByRole('button', { name: 'Show recent only' }).click();
  await expect(log.getByRole('listitem')).toHaveCount(10);
});

test('the register rule plots interactions by date, not evenly', async ({ page }) => {
  await signIn(page);
  // Spread across days, so there is a real span for the rule to plot.
  await logInteractions(page, personId(await openPerson(page, 'Sarah Chen')), 5);
  await openPerson(page, 'Sarah Chen');

  await expect(page.getByRole('img', { name: /^Interactions over time/ })).toBeVisible();
  const positions = await page.locator('.vt-register__tick').evaluateAll((els) =>
    els.map((e) => parseFloat((e as HTMLElement).style.left)),
  );
  expect(positions.length).toBeGreaterThan(2);
  // Evenly spaced ticks would carry no information beyond the count; real
  // dates cluster, so at least two gaps differ.
  const gaps = positions.slice(1).map((position, i) => {
    const previous = positions[i];
    if (previous === undefined) throw new Error('the tick list shrank between reads');
    return Number((position - previous).toFixed(3));
  });
  expect(new Set(gaps).size).toBeGreaterThan(1);
  await expect(page.locator('.vt-register__tick--on')).toHaveCount(1);
});

test('the favor ledger shows what was promised, and names the direction', async ({ page }) => {
  await signIn(page);
  await openPerson(page, 'Sarah Chen');

  const ledger = page.getByRole('region', { name: /^Favor ledger/ });
  // The client read `note`; the canonical field is `what`, so every favor
  // rendered "(no note)" over the top of real text.
  await expect(ledger).toContainText('intro to her VP');
  await expect(ledger).not.toContainText('(no note)');
  // Never colour alone: an arrow glyph is not a word.
  await expect(ledger.getByText(/They owe you|You owe them/).first()).toBeVisible();
});

test('an empty profile says what to do rather than showing blank regions', async ({ page }) => {
  await signIn(page);
  await page.route(SUMMARY, async (route) => {
    const real = await route.fetch();
    const body = (await real.json()) as Record<string, unknown>;
    await route.fulfill({ response: real, json: { ...body, favors: [] } });
  });
  await openPerson(page, 'Omar Khaled');

  await expect(page.getByRole('region', { name: /^Favor ledger/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Interactions/ })).toBeVisible();
});

test('a failed load names the person page and offers a retry', async ({ page }) => {
  await signIn(page);
  const href = await openPerson(page, 'Sarah Chen');

  await page.route('**/api/v1/nodes/*', (route) =>
    route.request().url().endsWith('/revisions')
      ? route.continue()
      : route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":{"code":"boom","message":"the graph is unreachable"}}',
        }),
  );
  await page.goto(href);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load this person");
  await expect(alert).toContainText('the graph is unreachable');
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('the person page has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await openPerson(page, 'Sarah Chen');
  await expectNoA11yViolations(page);
});

test('the correspondence panel computes from stated directions and shows its evidence (FR-COMM-001)', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const created = await apiPost(page, '/nodes', {
    type: 'person',
    title: `Corr Person ${stamp}`,
    props: {},
  });
  const { node } = await expectOkJson<{ node: { id: string } }>(created, 'correspondence person');
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const log = (body: Record<string, unknown>) => apiPost(page, '/interactions', body);
  await expectOkJson(
    await log({ personId: node.id, kind: 'email', note: `They wrote ${stamp}`, occurredAt: day(6), initiatedBy: 'them', idempotencyKey: `corr-${stamp}-a` }),
    'inbound interaction',
  );
  await expectOkJson(
    await log({ personId: node.id, kind: 'email', note: `I answered ${stamp}`, occurredAt: day(4), initiatedBy: 'me', idempotencyKey: `corr-${stamp}-b` }),
    'outbound interaction',
  );
  await expectOkJson(
    await log({ personId: node.id, kind: 'coffee', note: `Direction unstated ${stamp}`, occurredAt: day(2), idempotencyKey: `corr-${stamp}-c` }),
    'directionless interaction',
  );

  await page.goto(`/people/${node.id}`);
  const panel = page.getByRole('region', { name: 'Correspondence' });
  await expect(panel.getByText('you 1 · them 1')).toBeVisible();
  // The coverage line owns up to the directionless third interaction.
  await expect(
    panel.getByText('2 of 3 interactions state a direction; the rest count as contact only.'),
  ).toBeVisible();
  await panel.getByText('Reply latency').click();
  // One anchored assertion: the reciprocity list cites the same interaction
  // title from a closed disclosure, so an unanchored match resolves twice.
  await expect(
    panel.getByText(new RegExp(`your reply in 2 days: .*They wrote ${stamp}`)),
  ).toBeVisible();
});
