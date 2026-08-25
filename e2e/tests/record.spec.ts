import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { API_BASE } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

/**
 * Screen 6: record detail. The register rule here is the brand book's own
 * worked example (one tick per revision, active = the version being viewed),
 * so it gets a real check rather than a "there is a rule" check.
 */

const NODE = '**/api/v1/nodes/*';
const REVISIONS = '**/api/v1/nodes/*/revisions';

/** Open a seeded record with properties, connections and a history. */
async function openRecord(page: Page, title: string, type: string) {
  await page.keyboard.press('Meta+p');
  await page.getByLabel('Command or record search').fill(title);
  // The seed holds both a role and an application called "Senior ML Engineer",
  // and an application opens its own dossier, not the record screen. Every hit
  // names its type, so the type is what tells the two apart.
  await page
    .getByRole('option')
    .filter({ hasText: new RegExp(title, 'i') })
    .filter({ has: page.getByText(type, { exact: true }) })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  // Landing anywhere else turns every assertion below into a search for chrome
  // that screen never had, which reads as six broken features rather than one
  // ambiguous title.
  await expect(page).toHaveURL(/\/n\//);
  return page.url();
}

/**
 * What the rule's accessible name has to say about the window it drew. Below
 * the cap it names the active revision and that is the whole history; above it,
 * the rule must admit it is showing a window rather than silently truncating.
 */
function windowClause(total: number, max: number, latest: number): RegExp {
  return total > max
    ? new RegExp(`the most recent ${max} of ${total}`)
    : new RegExp(`revision ${latest}: `);
}

test('the register rule carries one tick per revision, with the latest active', async ({ page }) => {
  await signIn(page);
  await openRecord(page, 'Senior ML Engineer', 'role');

  const rule = page.getByRole('img', { name: /^Revisions of this record/ });
  await expect(rule).toBeVisible();

  const revisions = await page.evaluate(async (apiBase) => {
    const id = location.pathname.split('/n/')[1];
    const r = await fetch(`${apiBase}/nodes/${id}/revisions`, { credentials: 'include' });
    return ((await r.json()) as { revisions: Array<{ rev: number }> }).revisions;
  }, API_BASE);

  // The tick count is the record's actual revision count, not a decorative
  // number, up to the point where a rule this wide can no longer draw them
  // legibly, after which it shows the most recent and says that it has.
  const MAX_TICKS = 24;
  const drawn = Math.min(revisions.length, MAX_TICKS);
  await expect(page.locator('.vt-register__tick')).toHaveCount(drawn);
  await expect(page.locator('.vt-register__tick--on')).toHaveCount(1);
  const highest = Math.max(...revisions.map((r) => r.rev));
  await expect(rule).toHaveAccessibleName(new RegExp(`revision ${highest}: `));

  // This assertion is the one that matters: the rule must never draw fewer
  // ticks than there are revisions without saying so.
  await expect(rule).toHaveAccessibleName(windowClause(revisions.length, MAX_TICKS, highest));
});

test('property labels read as labels, and the count matches the rows', async ({ page }) => {
  await signIn(page);
  await openRecord(page, 'Senior ML Engineer', 'role');

  const properties = page.getByRole('region', { name: /^Properties/ });
  const labels = await properties.locator('dt').allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);

  // Storage keys were rendered raw, `tech_stack`, `employment_type`. Assert
  // the shape rather than specific keys: which record the switcher opens is
  // seed-dependent, but no label may ever be a snake_case identifier.
  for (const label of labels) {
    expect(label, `"${label}" looks like a storage key, not a label`).not.toMatch(/_|^[a-z]/);
  }

  const heading = await page.getByRole('heading', { name: /^Properties/ }).innerText();
  expect(Number(heading.replace(/\D/g, ''))).toBe(labels.length);
});

test('a section heading keeps a space between its title and its count', async ({ page }) => {
  await signIn(page);
  await openRecord(page, 'Senior ML Engineer', 'role');

  // The heading is a flex container, which drops a whitespace-only text node
  // between children, this rendered "Connections5".
  const heading = page.getByRole('heading', { name: /^Connections/ });
  const gap = await heading.evaluate((el) => getComputedStyle(el).columnGap);
  expect(gap).not.toBe('normal');
  expect(parseFloat(gap)).toBeGreaterThan(0);
});

test('pinning confirms with the verb and rolls back when it fails', async ({ page }) => {
  await signIn(page);
  await openRecord(page, 'Senior ML Engineer', 'role');

  const pin = page.getByRole('button', { name: /^(Pin|Unpin)$/ });
  const wasPinned = (await pin.innerText()).trim() === 'Unpin';

  await pin.click();
  await expect(toast(page, wasPinned ? /^Unpinned/ : /^Pinned/)).toBeVisible();
  await expect(pin).toHaveText(wasPinned ? 'Pin' : 'Unpin');

  // Put it back, then prove a rejected toggle reverts rather than sticking.
  await pin.click();
  await expect(pin).toHaveText(wasPinned ? 'Unpin' : 'Pin');

  await page.route(NODE, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":{"code":"unavailable","message":"read-only"}}',
        })
      : route.continue(),
  );
  await pin.click();
  await expect(toast(page, 'read-only')).toBeVisible();
  await expect(pin).toHaveText(wasPinned ? 'Unpin' : 'Pin');
});

test('a record with no notes and no connections says so, in its own words', async ({ page }) => {
  await signIn(page);
  // The seed has no bare record, so an emptied one is served instead.
  await page.route(NODE, async (route) => {
    if (route.request().url().endsWith('/revisions')) return route.continue();
    const real = await route.fetch();
    const body = (await real.json()) as { node: Record<string, unknown> };
    await route.fulfill({
      response: real,
      json: { ...body, node: { ...body.node, notes_md: '', props: {} }, edges: [], neighbors: {} },
    });
  });
  await openRecord(page, 'Senior ML Engineer', 'role');

  // Three different absences, three different sentences.
  await expect(page.getByText('Nothing connected yet')).toBeVisible();
  await expect(page.getByText(/No notes\./)).toBeVisible();
  await expect(page.getByText(/Nothing recorded yet\./)).toBeVisible();
});

test('a failed load names the record, and a failed history does not take the page down', async ({ page }) => {
  await signIn(page);
  const url = await openRecord(page, 'Senior ML Engineer', 'role');

  // History is a separate query: it must degrade on its own.
  await page.route(REVISIONS, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await page.goto(url);
  await expect(page.getByRole('alert')).toContainText('Couldn’t load the history.');
  await expect(page.getByRole('region', { name: /^Properties/ })).toBeVisible();
  // Nothing true to encode without revisions, so the rule carries no ticks.
  await expect(page.locator('.vt-register__tick')).toHaveCount(0);

  await page.route(NODE, (route) =>
    route.request().url().endsWith('/revisions')
      ? route.continue()
      : route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":{"code":"boom","message":"the graph is unreachable"}}',
        }),
  );
  await page.goto(url);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this record');
  await expect(alert).toContainText('the graph is unreachable');
});

test('the record page has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await openRecord(page, 'Senior ML Engineer', 'role');
  await expectNoA11yViolations(page);
});
