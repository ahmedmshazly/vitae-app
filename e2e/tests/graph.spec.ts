import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 14: Life map.
 *
 * Node palette uses --ae-viz-1..8 from tokens at runtime (fixed slots, every
 * node labelled). This spec guards the canvas ground (standing bans) and a
 * failed load that must stop spinning and say so.
 */

const GRAPH = '**/api/v1/graph?*';
const PATH = '**/api/v1/graph/path*';

function panel(page: Page) {
  return page.getByRole('region', { name: /^Life map/ });
}

async function goGraph(page: Page) {
  await page.goto('/graph');
  await expect(page.getByRole('heading', { name: 'Life map', exact: true })).toBeVisible();
}

test('a failed load says so instead of spinning for ever', async ({ page }) => {
  await signIn(page);
  await page.route(GRAPH, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the graph service is down"}}',
    }),
  );
  await goGraph(page);

  // `isError` was never destructured, so `data` stayed undefined, `!view` held,
  // and the spinner ran until you gave up.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't draw the map");
  await expect(alert).toContainText('the graph service is down');
  await expect(page.locator('.vt-spinner')).toHaveCount(0);
});

test('an empty graph invites a first record rather than drawing nothing', async ({ page }) => {
  await signIn(page);
  await page.route(GRAPH, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"nodes":[],"edges":[]}' }),
  );
  await goGraph(page);

  await expect(page.getByText('Nothing to explore yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open People' })).toBeVisible();
});

test('the canvas ground is flat, no wash, no texture, no tint', async ({ page }) => {
  await signIn(page);
  await goGraph(page);
  await expect(panel(page).locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  const ground = await panel(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    const grounds = ['--ae-bg', '--ae-surface-sunken', '--ae-surface'].map((t) =>
      root.getPropertyValue(t).trim(),
    );
    return { image: cs.backgroundImage, color: cs.backgroundColor, grounds };
  });

  // Was `background-color: #080b11` under two radial aurora washes and a 26px
  // dot grid: gradients on chrome, ambient washes and background texture are
  // three separate standing bans, all in one rule.
  expect(ground.image).toBe('none');

  // ...and the ground is one of the page's own greys, not a blue-black of its
  // own invention. The instrument sits on the sunken surface, one step below
  // the page, which is a token like any other.
  const rgb = (hex: string) =>
    `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  expect(ground.grounds.map(rgb)).toContain(ground.color);
});

test('the canvas is reachable without sight', async ({ page }) => {
  await signIn(page);
  await goGraph(page);
  await expect(panel(page).locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  // A <canvas> is opaque to assistive tech. It had no name at all, so the
  // keyboard locomotion that already existed was undiscoverable.
  await expect(panel(page)).toHaveAccessibleName(/\d+ records and \d+ connections/);
  await expect(panel(page)).toHaveAccessibleName(/arrow keys/);

  // The shortcuts are written down somewhere a person can find them.
  await page.getByRole('button', { name: /How this works/ }).click();
  const help = page.getByRole('dialog');
  await expect(help).toContainText('⌘F');
  await expect(help).toContainText('Walk the connections');
});

test('selecting a node announces it, because the canvas only repaints', async ({ page }) => {
  await signIn(page);
  await goGraph(page);
  await expect(panel(page).locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  const live = panel(page).locator('[aria-live="polite"]');
  await expect(live).toHaveText('');

  // Reach a node the way someone without a mouse would.
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByPlaceholder(/Find in map/).fill('Sarah');
  // Enter commits the highlighted row, so wait for the row rather than for a
  // count of milliseconds. On a loaded machine the clock runs out first.
  await expect(page.getByRole('option', { name: /Sarah/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(live).toContainText(/connections?\./, { timeout: 10_000 });
});

test('a failed path lookup reports itself instead of rendering nothing', async ({ page }) => {
  await signIn(page);
  await goGraph(page);
  await expect(panel(page).locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  await page.route(PATH, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"pathfinder unavailable"}}',
    }),
  );
  await page.getByRole('button', { name: 'Path', exact: true }).click();
  await page.getByPlaceholder(/Search a destination record/).fill('Sarah');
  // The destination search is debounced, and the picker keeps a create row
  // under the same highlight as the results. Pressing Enter before the lookup
  // answered therefore minted a new record instead of choosing Sarah, and no
  // path was ever asked for. Click the person once she is on screen.
  await page
    .getByRole('option', { name: /Sarah/ })
    .filter({ hasNotText: 'Create' })
    .first()
    .click();

  // PathStory returned null when the query failed, so asking for a path looked
  // exactly like never having asked.
  await expect(page.getByRole('alert')).toContainText("Couldn't work out a path", { timeout: 10_000 });
});

test('the life map has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goGraph(page);
  await expect(panel(page).locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await expectNoA11yViolations(page);
});
