import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 23: Import hub.
 *
 * The page's job is to make bulk seeding feel reversible: every source stages,
 * review accepts or skips, commit writes, rollback undoes the batch. The old
 * screen hid a failed history load as "No imports yet", painted GitHub as
 * "needs token" while Settings was still loading, and left a failed batch
 * detail as a blank page.
 */

const IMPORTS = '**/api/v1/imports';
const SETTINGS = '**/api/v1/settings';

function batch(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    kind: 'contacts',
    detail: null,
    filename: 'contacts.vcf',
    status: 'staged',
    created_at: '2026-08-01T10:00:00.000Z',
    stats: { rows: 1, accepted: 1, dupCandidates: 0 },
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    index: 0,
    entity: 'person',
    title: 'Ada Lovelace',
    subtitle: 'ada@example.test',
    payload: {},
    confidence: 0.91,
    dup: null,
    decision: 'accept',
    status: 'staged',
    ...over,
  };
}

async function serveImports(page: Page, batches: unknown[]) {
  await page.route(IMPORTS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    // Exact /imports list, not /imports/:id.
    if (/\/imports\/[^/?]+/.test(route.request().url())) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ batches }),
    });
  });
}

test('a failed history load says so instead of claiming you have imported nothing', async ({ page }) => {
  await signIn(page);
  await page.route(IMPORTS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (/\/imports\/[^/?]+/.test(route.request().url())) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the import store is unreachable"}}',
    });
  });
  await page.goto('/import');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load import history');
  await expect(alert).toContainText('the import store is unreachable');
  await expect(page.getByText('No imports yet')).toHaveCount(0);
  // Sources stay usable, the catalogue of importers is not the history query.
  await expect(page.getByRole('button', { name: /Import Contacts/ })).toBeVisible();
});

test('an empty history is not a load failure', async ({ page }) => {
  await signIn(page);
  await serveImports(page, []);
  await page.goto('/import');
  await expect(page.getByText('No imports yet')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('GitHub does not claim a missing token while Settings is still loading', async ({ page }) => {
  await signIn(page);
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await new Promise((r) => setTimeout(r, 5_000));
    return route.continue();
  });
  await page.goto('/import');

  const github = page.getByRole('button', { name: /Sync GitHub/ });
  await expect(github).toBeVisible();
  await expect(github).toContainText('checking');
  await expect(github).not.toContainText('needs token');
});

test('opening a batch that fails to load reports the failure', async ({ page }) => {
  await signIn(page);
  await serveImports(page, [batch({ id: 'b-fail', status: 'staged' })]);
  await page.route('**/api/v1/imports/b-fail', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"batch rows are unreachable"}}',
    });
  });
  await page.goto('/import');

  await page.getByRole('button', { name: /Open contacts import from 2026-08-01/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this import batch');
  await expect(alert).toContainText('batch rows are unreachable');
});

test('row accept/skip controls name the person they act on', async ({ page }) => {
  await signIn(page);
  await serveImports(page, [batch()]);
  await page.route('**/api/v1/imports/b1', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ batch: batch(), rows: [row()] }),
    });
  });
  await page.goto('/import');
  await page.getByRole('button', { name: /Open contacts import from 2026-08-01/ }).click();

  await expect(page.getByText('review before commit')).toBeVisible();
  await expect(page.getByRole('button', { name: /Skip Ada Lovelace/ })).toBeVisible();
});

test('committed history rollbacks name the batch they undo', async ({ page }) => {
  await signIn(page);
  await serveImports(page, [
    batch({
      id: 'b2',
      status: 'committed',
      stats: { rows: 4, accepted: 4, dupCandidates: 0, created: 4 },
    }),
  ]);
  await page.goto('/import');
  await expect(
    page.getByRole('button', { name: 'Roll back contacts import from 2026-08-01: 4 records' }),
  ).toBeVisible();
});

test('the import hub has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await serveImports(page, [
    batch({ status: 'committed', stats: { rows: 2, accepted: 2, dupCandidates: 0, created: 2 } }),
  ]);
  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible();
  await expectNoA11yViolations(page);
});
