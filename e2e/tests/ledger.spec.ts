import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { capture } from './helpers/fixtures';
import { apiGet, apiPatch, expectOkJson } from './helpers/api';

/**
 * The Ledger (FR-PROV-002): the revision history every write already keeps,
 * read back as a feed — and the record history that now opens into field
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
  await expect(page.getByText('edited').first()).toBeVisible();

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
