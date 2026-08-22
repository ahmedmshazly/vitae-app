import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

/**
 * Screen 25: Repositories.
 *
 * While Settings loads, the hub must not claim "not connected". A Settings
 * failure must not fold into a repositories ErrorState that only retries the
 * nodes query. The token field needs an accessible name, and Sync needs a
 * named disabled reason when no token is present.
 */

const SETTINGS = '**/api/v1/settings';
const REPOS = '**/api/v1/nodes?type=repository*';
const TOKEN = '**/api/v1/settings/github-token';
const SYNC = '**/api/v1/imports/github/sync';

function repo(id: string, fullName: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: fullName.split('/')[1] ?? fullName,
    source: 'github',
    props: {
      full_name: fullName,
      primary_language: 'TypeScript',
      stars: 12,
      is_private: false,
      description: `${fullName} description`,
      ...over,
    },
  };
}

async function serveSettings(
  page: Page,
  github: { configured: boolean; lastSyncAt: string | null },
) {
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ github, profile: {}, resumeDefaults: {} }),
    });
  });
}

async function serveRepos(page: Page, nodes: unknown[]) {
  await page.route(REPOS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nodes }),
    });
  });
}

test('GitHub does not claim a missing token while Settings is still loading', async ({ page }) => {
  await signIn(page);
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await new Promise((r) => setTimeout(r, 5_000));
    return route.continue();
  });
  await page.goto('/repositories');

  await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
  await expect(page.getByText('checking')).toBeVisible();
  await expect(page.getByText('not connected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sync GitHub: connect a token first/ })).toBeDisabled();
});

test('a Settings failure does not pretend the repository list failed', async ({ page }) => {
  await signIn(page);
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"settings store unreachable"}}',
    });
  });
  await serveRepos(page, []);
  await page.goto('/repositories');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load GitHub settings');
  await expect(alert).toContainText('settings store unreachable');
  await expect(page.getByText('Couldn’t load repositories')).toHaveCount(0);
});

test('a failed repository list says so instead of claiming you have none', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' });
  await page.route(REPOS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"repository index unreachable"}}',
    });
  });
  await page.goto('/repositories');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load repositories');
  await expect(alert).toContainText('repository index unreachable');
  await expect(page.getByText('No repositories yet')).toHaveCount(0);
});

test('an empty connected account offers Sync now, not a load failure', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, { configured: true, lastSyncAt: null });
  await serveRepos(page, []);
  await page.goto('/repositories');

  await expect(page.getByText('No repositories yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync GitHub now/ })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the token field is labelled and Replace becomes Disconnect when connected', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' });
  await serveRepos(page, [repo('r1', 'jordan/vitae')]);
  await page.goto('/repositories');

  await expect(page.getByLabel('Personal access token')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect GitHub token' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open jordan/vitae' })).toBeVisible();
  await expect(page.getByText('12 stars')).toBeVisible();
});

test('saving a token refreshes the connection chip', async ({ page }) => {
  await signIn(page);
  let configured = false;
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        github: { configured, lastSyncAt: null },
        profile: {},
        resumeDefaults: {},
      }),
    });
  });
  await serveRepos(page, []);
  await page.route(TOKEN, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    configured = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true,"configured":true}',
    });
  });
  await page.goto('/repositories');

  await expect(page.getByText('not connected')).toBeVisible();
  await page.getByLabel('Personal access token').fill('ghp_test_token_for_e2e');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(toast(page, 'GitHub token saved.')).toBeVisible();
  await expect(page.getByText('connected', { exact: true })).toBeVisible();
});

test('Sync now reports success without leaving the page blank', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, { configured: true, lastSyncAt: null });
  let nodes = [repo('r1', 'jordan/vitae')];
  await page.route(REPOS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nodes }),
    });
  });
  await page.route(SYNC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    nodes = [repo('r1', 'jordan/vitae'), repo('r2', 'jordan/atlas', { stars: 3 })];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"status":"synced","created":1,"updated":0}',
    });
  });
  await page.goto('/repositories');

  await page.getByRole('button', { name: /Sync GitHub now/ }).click();
  await expect(toast(page, 'Synced: 1 new · 0 updated.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open jordan/atlas' })).toBeVisible();
});

test('the repositories hub has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' });
  await serveRepos(page, [repo('r1', 'jordan/vitae')]);
  await page.goto('/repositories');
  await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});
