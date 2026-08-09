import { test, expect, type Page } from '@playwright/test';
import { apiPost, expectOkJson } from './helpers/api.js';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 10: Browse and Collections, the two ways into everything you own.
 * Most of this spec is about the two saved-view mutations, which were the last
 * unguarded ones in the app: neither reached the global error toast, and
 * deleting a view asked nothing and reported nothing.
 */

const COUNTS = '**/api/v1/nodes/counts';
const VIEWS = '**/api/v1/views';
const NODES_Q = '**/api/v1/nodes?q=*';

async function goCollections(page: Page) {
  await page.goto('/collections');
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
}

test('a tile never states a count it does not have', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(COUNTS, async (route) => {
    await held;
    await route.continue();
  });

  await signIn(page);
  await goCollections(page);

  // A pending count rendered 0 on every tile, which is indistinguishable from
  // a type that is genuinely empty, the tile asserted a fact it did not have.
  await expect(page.locator('.vt-skel').first()).toBeVisible();
  // The tile's accessible name folds in the glyph's title and the count, so
  // it is addressed by position in its group instead.
  const personTile = page.getByRole('region', { name: 'Career' }).getByRole('button').first();
  await expect(personTile).toBeVisible();
  await expect(personTile).not.toContainText(/\d/);

  release();
  await expect(personTile).toContainText(/\d/);
});

test('a failed count says so instead of reporting zero of everything', async ({ page }) => {
  await page.route(COUNTS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the graph is unreachable"}}',
    }),
  );
  await signIn(page);
  await goCollections(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t count your records');
  await expect(alert).toContainText('the graph is unreachable');
  await expect(page.getByRole('region', { name: 'Career' })).toHaveCount(0);
});

test('a failed query reports a failure, not "No matches"', async ({ page }) => {
  await signIn(page);
  await goCollections(page);

  await page.route(NODES_Q, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"query engine is down"}}',
    }),
  );
  await page.getByPlaceholder('type:person tag:ml city:Berlin…').fill('type:person');
  await page.keyboard.press('Enter');

  // results.isError was never checked, so a failed fetch fell through to the
  // empty branch and told the user their query matched nothing.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t run that query');
  await expect(page.getByText('No matches')).toHaveCount(0);
});

test('saving a view confirms, and reports a failure instead of rejecting into nothing', async ({ page }) => {
  await signIn(page);
  await goCollections(page);

  await page.getByPlaceholder('type:person tag:ml city:Berlin…').fill('type:person');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Save view' }).click();

  const name = `E2E view ${Date.now()}`;
  await page.getByLabel('Name').fill(name);

  await page.route(VIEWS, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":{"code":"unavailable","message":"views are read-only"}}',
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Was a bare `await api.post` outside useMutation: the rejection went
  // nowhere and the dialog sat open saying nothing.
  await expect(page.locator('.toast')).toContainText('views are read-only');
  await expect(page.getByLabel('Name')).toHaveValue(name);

  await page.unroute(VIEWS);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Saved');
  // The saved-view rail only renders once the query has refetched, and the
  // tiles are behind the results view while a query is active.
  await page.goto('/collections');
  await expect(page.getByRole('region', { name: /^Saved views/ })).toContainText(name);
});

test('deleting a saved view asks first, and can be undone', async ({ page }) => {
  await signIn(page);
  await goCollections(page);

  // Make the view this test deletes, so it never eats someone else's.
  const name = `E2E doomed ${Date.now()}`;
  await expectOkJson(await apiPost(page, '/views', { name, query: 'type:skill' }), 'create view');
  await page.reload();

  const views = page.getByRole('region', { name: /^Saved views/ });
  await expect(views).toContainText(name);

  // Was a bare × that deleted on click: no confirmation, no toast, no undo.
  await views.getByRole('button', { name: `Delete view ${name}` }).click();
  await expect(page.getByRole('dialog')).toContainText(`Delete the view “${name}”?`);
  await page.getByRole('button', { name: 'Delete view' }).click();

  await expect(page.getByRole('region', { name: /^Saved views/ })).not.toContainText(name);
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Deleted');

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: /^Saved views/ })).toContainText(name);

  // Leave nothing behind.
  await page.getByRole('button', { name: `Delete view ${name}` }).click();
  await page.getByRole('button', { name: 'Delete view' }).click();
  await expect(page.getByRole('region', { name: /^Saved views/ }).or(page.locator('body'))).not.toContainText(name);
});

test('browse names the type, counts it, and offers a distinct first-record action', async ({ page }) => {
  await signIn(page);
  await page.goto('/browse/skill');
  await expect(page.getByRole('heading', { name: 'skill', exact: true })).toBeVisible();

  const section = page.getByRole('region', { name: /^All skill/ });
  await expect(section.locator('.people__link').first()).toBeVisible();
  const rows = await section.locator('.people__link').count();
  const sub = await page.locator('.vt-pagehead__sub').innerText();
  expect(Number(sub.replace(/\D/g, ''))).toBe(rows);

  await page.goto('/browse/interview');
  // Header button and empty-state button must not share an accessible name.
  await expect(page.getByRole('button', { name: 'Add your first interview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New interview' })).toHaveCount(1);
});

test('browse rejects a type that is not a record type', async ({ page }) => {
  await signIn(page);
  await page.goto('/browse/not-a-real-type');
  await expect(page.getByRole('heading', { name: 'Unknown type' })).toBeVisible();
  await expect(page.getByText('Nothing to browse')).toBeVisible();
});

test('both screens have no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goCollections(page);
  await expectNoA11yViolations(page);

  await page.goto('/browse/skill');
  await expect(page.getByRole('heading', { name: 'skill', exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});
