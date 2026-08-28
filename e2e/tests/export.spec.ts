import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 26: Export & backups.
 *
 * Backup status and saved-view failures must surface as errors, not a spinner
 * or blank card. CSV actions need distinct accessible names. This is the
 * export half of journey J6; the restore half is the documented drill, which
 * is why the register keeps J6 partial.
 */

const STATUS = '**/api/v1/export/status';
const VIEWS = '**/api/v1/views';

async function serveStatus(page: Page, body: unknown) {
  await page.route(STATUS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function serveViews(page: Page, views: unknown[]) {
  await page.route(VIEWS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ views }),
    });
  });
}

test('a failed backup status says so instead of spinning forever into nothing', async ({ page }) => {
  await signIn(page);
  await page.route(STATUS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"export ledger unreachable"}}',
    });
  });
  await serveViews(page, []);
  await page.goto('/export');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load backup status");
  await expect(alert).toContainText('export ledger unreachable');
});

test('a failed saved-views load reports itself', async ({ page }) => {
  await signIn(page);
  await serveStatus(page, { last_export_at: null, counts: null });
  await page.route(VIEWS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"views store unreachable"}}',
    });
  });
  await page.goto('/export');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load saved views");
  await expect(alert).toContainText('views store unreachable');
});

test('having no saved views is not a load failure', async ({ page }) => {
  await signIn(page);
  await serveStatus(page, { last_export_at: null, counts: null });
  await serveViews(page, []);
  await page.goto('/export');

  await expect(page.getByText('No saved views yet')).toBeVisible();
  await expect(page.getByText('never')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the sensitive-records toggle and export action are labelled', async ({ page }) => {
  await signIn(page);
  await serveStatus(page, {
    last_export_at: '2026-08-01T10:15:00.000Z',
    counts: { nodes: 12, edges: 40 },
  });
  await serveViews(page, [{ id: 'v1', name: 'Berlin ML', query: 'type:person city:Berlin' }]);
  await page.goto('/export');

  await expect(page.getByLabel('Include sensitive records')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export everything excluding sensitive records' }),
  ).toBeVisible();
  await page.getByLabel('Include sensitive records').check();
  await expect(
    page.getByRole('button', { name: 'Export full backup including sensitive records' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export Berlin ML as CSV' })).toBeVisible();
  await expect(page.getByText('2026-08-01 10:15')).toBeVisible();
});

test('the export page has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await serveStatus(page, { last_export_at: '2026-08-01T10:15:00.000Z', counts: { nodes: 3 } });
  await serveViews(page, []);
  await page.goto('/export');
  await expect(page.getByRole('heading', { name: 'Export & backups' })).toBeVisible();
  await expectNoA11yViolations(page);
});
