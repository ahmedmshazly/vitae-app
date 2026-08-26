import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 24: Identity audit / Duplicates.
 *
 * Covers the duplicate-queue states of journey J3 (evidence-named clusters,
 * undoable merges) against a mocked API; the end-to-end J3 walk lives in
 * exploration.spec.ts.
 *
 * Failed loads keep page chrome and an ErrorState. A clean graph is a true
 * empty, not a card-shaped void. Audit / Undo controls need distinct names;
 * merge history and alias failures must surface.
 */

const DUPLICATES = '**/api/v1/duplicates';
const MERGES = '**/api/v1/duplicates/merges';
const ALIASES = '**/api/v1/duplicates/aliases';

function member(id: string, title: string) {
  return { id, type: 'person', title, meta: `${id}@example.test`, rev: 1 };
}

function cluster(over: Record<string, unknown> = {}) {
  const a = member('p1', 'Sarah Chen');
  const b = member('p2', 'Sara Chen');
  return {
    id: 'c1',
    type: 'person',
    verdict: 'probable',
    score: 91,
    members: [a, b],
    pairs: [
      {
        a,
        b,
        weight: 12,
        verdict: 'probable',
        evidence: ['Same email'],
        signals: [],
        contradictions: [],
        fingerprint: 'fp1',
      },
    ],
    ...over,
  };
}

async function serveQueue(page: Page, clusters: unknown[]) {
  await page.route(DUPLICATES, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (/\/duplicates\/(merges|aliases)/.test(route.request().url())) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pairs: [], clusters }),
    });
  });
}

async function serveEmptySidePanels(page: Page) {
  await page.route(MERGES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"merges":[]}' });
  });
  await page.route(ALIASES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"aliases":[]}' });
  });
}

test('a failed queue load says so instead of rendering nothing useful', async ({ page }) => {
  await signIn(page);
  await page.route(DUPLICATES, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (/\/duplicates\/(merges|aliases)/.test(route.request().url())) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the identity scanner is unreachable"}}',
    });
  });
  await page.goto('/import/duplicates');

  await expect(page.getByRole('heading', { name: 'Identity audit' })).toBeVisible();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load the identity queue');
  await expect(alert).toContainText('the identity scanner is unreachable');
  await expect(page.getByText('No duplicates detected')).toHaveCount(0);
});

test('a clean graph is not a load failure', async ({ page }) => {
  await signIn(page);
  await serveQueue(page, []);
  await serveEmptySidePanels(page);
  await page.goto('/import/duplicates');

  await expect(page.getByText('No duplicates detected')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('No merges yet')).toBeVisible();
  await expect(page.getByText('No learned aliases')).toBeVisible();
});

test('cluster actions name the people they act on', async ({ page }) => {
  await signIn(page);
  await serveQueue(page, [cluster()]);
  await serveEmptySidePanels(page);
  await page.goto('/import/duplicates');

  await expect(page.getByRole('heading', { name: 'Sarah Chen · Sara Chen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Audit cluster: Sarah Chen · Sara Chen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark not the same: Sarah Chen · Sara Chen' })).toBeVisible();
  await expect(page.getByText('Same email')).toBeVisible();
});

test('a failed merge history load reports itself', async ({ page }) => {
  await signIn(page);
  await serveQueue(page, []);
  await page.route(MERGES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"merge log unavailable"}}',
    });
  });
  await page.route(ALIASES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"aliases":[]}' });
  });
  await page.goto('/import/duplicates');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load merge history');
  await expect(alert).toContainText('merge log unavailable');
});

test('undo controls name the merge they reverse', async ({ page }) => {
  await signIn(page);
  await serveQueue(page, []);
  await page.route(MERGES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        merges: [
          {
            id: 'm1',
            keep_id: 'p1',
            drop_id: 'p2',
            merged_at: '2026-08-01T10:00:00.000Z',
            undone_at: null,
            keep_title: 'Sarah Chen',
            drop_title: 'Sara Chen',
          },
        ],
      }),
    });
  });
  await page.route(ALIASES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"aliases":[]}' });
  });
  await page.goto('/import/duplicates');

  await expect(page.getByRole('button', { name: 'Undo merge of Sara Chen into Sarah Chen' })).toBeVisible();
});

test('the identity audit has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await serveQueue(page, [cluster()]);
  await serveEmptySidePanels(page);
  await page.goto('/import/duplicates');
  await expect(page.getByRole('heading', { name: 'Identity audit' })).toBeVisible();
  await expectNoA11yViolations(page);
});
