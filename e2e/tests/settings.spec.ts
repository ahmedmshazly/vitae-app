import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

/**
 * Screen 27: Settings.
 *
 * System status must name a failed check instead of spinning forever on empty
 * data. The GitHub token field and ranking sliders need accessible names.
 */

const SETTINGS = '**/api/v1/settings';
const STATUS = '**/api/v1/status';

function settingsBody(over: Record<string, unknown> = {}) {
  return {
    profile: { name: 'Ada', headline: 'Engineer', email: 'ada@example.test', links: [] },
    askWeights: {
      affiliation: 2,
      topic: 1.6,
      strength: 1.2,
      geo: 0.6,
      reciprocity: 0.4,
      graph: 0.8,
      pinned: 0.3,
    },
    skillAliases: [{ alias: 'k8s', canonical: 'Kubernetes' }],
    resumeDefaults: { templateKey: 'cobalt', accent: '#2563eb', emphasis: 'technical' },
    github: { configured: false, lastSyncAt: null },
    ...over,
  };
}

async function serveSettings(page: Page, body: unknown = settingsBody()) {
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

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

test('a failed settings load says so with a titled error', async ({ page }) => {
  await signIn(page);
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"settings store unreachable"}}',
    });
  });
  // /settings is the index of the four panels now; the controls, and the query
  // behind them, live one level down.
  await page.goto('/settings/profile');

  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load settings");
  await expect(alert).toContainText('settings store unreachable');
});

test('a failed system status reports itself instead of spinning forever', async ({ page }) => {
  await signIn(page);
  await serveSettings(page);
  await page.route(STATUS, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"health endpoint unreachable"}}',
    });
  });
  await page.goto('/settings/system');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load system status");
  await expect(alert).toContainText('health endpoint unreachable');
});

test('system checks name ok/down in text, not only as a coloured dot', async ({ page }) => {
  await signIn(page);
  await serveSettings(page);
  await serveStatus(page, {
    ok: false,
    checks: {
      database: { ok: true, detail: '3ms' },
      buildsvc: { ok: false, detail: 'connection refused' },
    },
    counts: { nodes: 10, edges: 20 },
    env: { node: 'v22', emulators: true, devLogin: true },
  });
  await page.goto('/settings/system');

  await expect(page.getByText('1 down')).toBeVisible();
  await expect(page.getByText('connection refused')).toBeVisible();
  await expect(page.getByText('3ms')).toBeVisible();
});

test('GitHub token and ranking weights are labelled controls', async ({ page }) => {
  await signIn(page);
  await serveSettings(page, settingsBody({ github: { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' } }));
  await serveStatus(page, {
    ok: true,
    checks: { database: { ok: true } },
    counts: { nodes: 1, edges: 1 },
    env: { node: 'v22', emulators: true, devLogin: true },
  });
  // The credential sits with System, the ranking constants with Preferences:
  // two panels, so this walks both rather than one long page.
  await page.goto('/settings/system');
  await expect(page.getByLabel('Personal access token')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect GitHub token' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Repositories' })).toBeVisible();

  await page.goto('/settings/preferences');
  await expect(page.getByLabel('Affiliation (org match)')).toBeVisible();
  await expect(page.getByLabel('Topic overlap')).toBeVisible();
});

test('saving the profile reports success', async ({ page }) => {
  await signIn(page);
  let savedName = 'Ada';
  await page.route(SETTINGS, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settingsBody({ profile: { name: savedName, headline: 'Engineer', email: 'ada@example.test', links: [] } })),
      });
    }
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { profile?: { name: string } };
      savedName = body.profile?.name ?? savedName;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settingsBody({ profile: { name: savedName, headline: 'Engineer', email: 'ada@example.test', links: [] } })),
      });
    }
    return route.continue();
  });
  await serveStatus(page, {
    ok: true,
    checks: { database: { ok: true } },
    counts: { nodes: 1, edges: 1 },
    env: { node: 'v22', emulators: true, devLogin: true },
  });
  await page.goto('/settings/profile');

  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(toast(page, 'Profile saved.')).toBeVisible();
});

test('the settings page has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await serveSettings(page);
  await serveStatus(page, {
    ok: true,
    checks: { database: { ok: true, detail: 'ok' } },
    counts: { nodes: 2, edges: 3 },
    env: { node: 'v22', emulators: true, devLogin: true },
  });
  for (const [path, heading] of [
    ['/settings', 'Settings'],
    ['/settings/profile', 'Profile'],
    ['/settings/preferences', 'Preferences'],
    ['/settings/system', 'System'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
  }
});
