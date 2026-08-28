import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 26: Trash.
 *
 * A failed trash load must not look like an empty trash. Restore buttons need
 * distinct accessible names, and the purge countdown must name urgency.
 */

const TRASH = '**/api/v1/nodes?includeDeleted=*';
const PREVIEW = '**/api/v1/retention/preview';

function deleted(id: string, title: string, deletedAt: string) {
  return { id, type: 'project', title, deleted_at: deletedAt };
}

async function serveTrash(page: Page, nodes: unknown[], preview = { nodes: 0, edges: 0, revisions: 0, dependents: 0, retentionDays: 30, cutoff: '2026-07-10' }) {
  await page.route(TRASH, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nodes }),
    });
  });
  await page.route(PREVIEW, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(preview),
    });
  });
}

test('a failed trash load says so instead of claiming the bin is empty', async ({ page }) => {
  await signIn(page);
  await page.route(TRASH, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"trash index unreachable"}}',
    });
  });
  await page.route(PREVIEW, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"nodes":0,"edges":0,"revisions":0,"dependents":0,"retentionDays":30,"cutoff":"2026-07-10"}',
    }),
  );
  await page.goto('/trash');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load trash");
  await expect(alert).toContainText('trash index unreachable');
  await expect(page.getByText('Trash is empty')).toHaveCount(0);
});

test('an empty trash is not a load failure', async ({ page }) => {
  await signIn(page);
  await serveTrash(page, []);
  await page.goto('/trash');
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('restore controls name the record they revive', async ({ page }) => {
  await signIn(page);
  // Deleted yesterday → still well inside the 30-day window.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  await serveTrash(page, [deleted('t1', 'Recoverable Project', yesterday)]);
  await page.goto('/trash');

  await expect(page.getByRole('button', { name: 'Restore Recoverable Project' })).toBeVisible();
  await expect(page.getByText(/purges in \d+d/)).toBeVisible();
});

test('records inside the final week are named as nearing purge', async ({ page }) => {
  await signIn(page);
  const almostGone = new Date(Date.now() - 25 * 86_400_000).toISOString();
  await serveTrash(page, [deleted('t2', 'Almost Gone', almostGone)]);
  await page.goto('/trash');

  await expect(page.getByText('1 nearing purge')).toBeVisible();
  await expect(page.getByText(/purges in [1-6]d/)).toBeVisible();
});

test('expired purge actions name the count they remove', async ({ page }) => {
  await signIn(page);
  const stale = new Date(Date.now() - 40 * 86_400_000).toISOString();
  await serveTrash(
    page,
    [deleted('t3', 'Long Gone', stale)],
    { nodes: 2, edges: 1, revisions: 0, dependents: 0, retentionDays: 30, cutoff: '2026-07-10' },
  );
  await page.goto('/trash');

  await expect(page.getByRole('button', { name: 'Purge 2 expired records now' })).toBeVisible();
  await expect(page.getByText('purge due')).toBeVisible();
});

test('the trash has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  await serveTrash(page, [deleted('t1', 'Recoverable Project', yesterday)]);
  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});
