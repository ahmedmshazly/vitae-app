import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { capture } from './helpers/fixtures';
import { apiGet, apiPatch, expectOkJson } from './helpers/api';

const ENTRY = { id: 'r1', at: '2026-08-26T10:00:00.000Z', op: 'update', source: 'manual', subject_kind: 'node', subject_id: 'n1', rev: 3, title: 'Research partnership', type: 'project', changed: ['title', 'notes_md', 'props.next_step', 'props.status', 'props.team', 'props.city'] };

test('Ledger keeps long revisions and full field disclosures readable at every viewport', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const title = 'Research partnership with regional community organizations — interview findings, shared decisions, and follow-up commitments';
  await page.route('**/api/v1/ledger**', (route) => route.fulfill({ json: { entries: [
    { ...ENTRY, title },
    { ...ENTRY, id: 'r2', subject_kind: 'edge', title: null, type: 'KNOWS', changed: [], source: 'system' },
    { ...ENTRY, id: 'r3', at: 'invalid', subject_kind: 'atom', title: null, type: null, source: null, changed: ['props.a_field_with_a_very_long_imported_name_that_still_needs_to_be_read_in_full'] },
  ], next_before: null } }));
  await page.goto('/today/ledger');
  const details = page.locator('.ledger-entry__fields').first();
  const summary = details.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open');
  await expect(details.getByRole('listitem')).toHaveCount(6);
  await expect(details.getByRole('link', { name: 'Open record and history' })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('heading', { name: 'Ledger', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.ledger-entry__body').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth))).toBe(true);
    await expectNoA11yViolations(page, '.page--ledger');
    await page.screenshot({ path: testInfo.outputPath(`ledger-${width}.png`), animations: 'disabled' });
    await page.getByText('Date unavailable', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`ledger-later-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'About this history', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'About this history', exact: true });
  await expect(help).toContainText('Filters search only the entries loaded here.');
  await expectNoA11yViolations(page, '.vt-popover');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'About this history', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('Ledger retries the exact older-page cursor and never discards loaded history', async ({ page }) => {
  await signIn(page);
  const requests: string[] = [];
  let olderAttempts = 0;
  let refreshFails = false;
  await page.route('**/api/v1/ledger**', (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('before');
    if (cursor) {
      requests.push(cursor);
      olderAttempts++;
      return route.fulfill(olderAttempts === 1 ? { status: 503, json: { error: { message: 'Offline', code: 'UNAVAILABLE' } } } : { json: { entries: [{ ...ENTRY, id: 'r0', title: 'Older revision', at: '2026-08-25T10:00:00.000Z' }], next_before: null } });
    }
    return route.fulfill(refreshFails ? { status: 503, json: { error: { message: 'Offline', code: 'UNAVAILABLE' } } } : { json: { entries: [ENTRY], next_before: ENTRY.at } });
  });
  await page.goto('/today/ledger');
  await page.getByRole('button', { name: 'Load older changes' }).click();
  await expect(page.getByText("Couldn't load older changes")).toBeVisible();
  await expect(page.getByRole('link', { name: ENTRY.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Older revision', exact: true })).toBeVisible();
  expect(requests).toEqual([ENTRY.at, ENTRY.at]);
  await expect(page.getByText('2 shown · 2 loaded')).toBeVisible();
  refreshFails = true;
  await page.getByRole('button', { name: 'Refresh changes' }).click();
  await expect(page.getByText("Couldn't refresh the ledger")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Older revision', exact: true })).toBeVisible();
  refreshFails = false;
  await page.getByRole('button', { name: 'Refresh changes' }).click();
  await expect(page.getByText("Couldn't refresh the ledger")).toBeHidden();
  await expect(page.getByText('2 shown · 2 loaded')).toBeVisible();
});

test('Ledger filters survive reload and distinguish no matches from an empty history', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/ledger**', (route) => route.fulfill({ json: { entries: [ENTRY, { ...ENTRY, id: 'r2', title: 'New connection', op: 'create', subject_kind: 'edge' }], next_before: ENTRY.at } }));
  await page.goto('/today/ledger?source=review');
  await page.getByLabel('Action', { exact: true }).selectOption('create');
  await page.getByLabel('Entry type', { exact: true }).selectOption('edge');
  await page.getByRole('searchbox', { name: 'Search loaded changes' }).fill('connection');
  await expect(page.getByText('1 shown · 2 loaded · Older history available')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Action', { exact: true })).toHaveValue('create');
  await expect(page.getByRole('searchbox')).toHaveValue('connection');
  await page.getByRole('searchbox').fill('not-in-loaded-history');
  await expect(page.getByText('No matching loaded changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/ledger\?source=review$/);
  await expect(page.getByText('2 shown · 2 loaded · Older history available')).toBeVisible();
});

test('Ledger presents loading and empty history as different states', async ({ page }) => {
  await signIn(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/ledger**', async (route) => { await pending; await route.fulfill({ json: { entries: [], next_before: null } }); });
  await page.goto('/today/ledger');
  await expect(page.getByRole('status', { name: 'Loading the ledger' })).toBeVisible();
  await expect(page.getByText('No changes yet')).toBeHidden();
  release();
  await expect(page.getByText('No changes yet')).toBeVisible();
  await expectNoA11yViolations(page, '.page--ledger');
});

test.describe('Ledger local time', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('groups midnight UTC writes under the local calendar date', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/ledger**', (route) => route.fulfill({ json: { entries: [{ ...ENTRY, at: '2026-08-26T01:05:00.000Z' }], next_before: null } }));
    await page.goto('/today/ledger');
    await expect(page.getByRole('heading', { name: 'Tuesday, Aug 25, 2026' })).toBeVisible();
    await expect(page.locator('.ledger-entry__time')).toContainText('06:05 PM');
  });
});

/**
 * The Ledger (FR-PROV-002): the revision history every write already keeps,
 * read back as a feed, and the record history that now opens into field
 * diffs (FR-PROV-003). The feed is real data, so these tests make the change
 * they expect to see rather than assuming an empty world.
 */

test('a capture appears in the ledger and links back to its record', async ({ page }) => {
  await signIn(page);
  const title = `Ledger subject ${Date.now()}`;
  await capture(page, `i ${title}`);
  // A create's diff is its snapshot; an update is where "what changed" means
  // something, so make one through the API and assert its disclosure.
  const found = await apiGet(page, `/search?q=${encodeURIComponent(title)}`);
  const body = (await expectOkJson(found, 'search')) as {
    results: Array<{ id: string; title: string }>;
  };
  const matches = body.results.filter((r) => r.title === title);
  expect(matches, 'the captured record is findable').toHaveLength(1);
  const id = matches[0]!.id;
  await expectOkJson(await apiPatch(page, `/nodes/${id}`, { title: `${title} renamed` }), 'rename');

  await page.goto('/today/ledger');
  const entry = page.getByRole('link', { name: `${title} renamed` }).first();
  await expect(entry).toBeVisible();
  // The entry's verb and provenance are words on the row, not colours.
  await expect(page.locator('.ledger-entry__verb').filter({ hasText: 'edited' }).first()).toBeVisible();

  await entry.click();
  await expect(page.getByRole('heading', { name: `${title} renamed` })).toBeVisible();

  // The record's history discloses what the write actually changed: the
  // update revision carries its field diff, and opening it shows the field.
  const disclosure = page.locator('details.record-history__entry > summary').first();
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  await expect(page.getByRole('term').filter({ hasText: 'Title' }).first()).toBeVisible();
});

test('a failed ledger load names itself instead of posing as empty', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/ledger**', (route) => route.abort());
  await page.goto('/today/ledger');
  await expect(page.getByText("Couldn't load the ledger")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('No changes yet')).toHaveCount(0);
});

test('the ledger has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await page.goto('/today/ledger');
  await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible();
  await expectNoA11yViolations(page);
});
