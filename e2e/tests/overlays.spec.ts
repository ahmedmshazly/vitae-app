import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 4: the global overlays: ⌘K capture, ⌘P switcher, the reminders
 * drawer and first-run. All four now share one backdrop, one focus contract
 * and one panel treatment; before this they were a legacy `.overlay`, a bare
 * absolutely-positioned div with hand-rolled Escape, and a Modal.
 */

const SWITCH = '**/api/v1/search/switch*';
const REMINDERS = '**/api/v1/reminders*';
const CAPTURE = '**/api/v1/capture';

function palette(page: Page) {
  return page.locator('.vt-palette');
}

test('⌘K and ⌘P open a real dialog, trap focus, and restore it on Escape', async ({ page }) => {
  await signIn(page);

  const capture = page.getByRole('button', { name: 'Quick capture' });
  await capture.focus();
  await page.keyboard.press('Meta+k');

  const dialog = page.getByRole('dialog', { name: 'Quick add' });
  await expect(dialog).toBeVisible();
  // The palette's own input takes focus, not the first button in it.
  await expect(page.getByLabel('Capture line')).toBeFocused();

  // Tabbing must not escape into the page behind, it used to.
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.vt-palette'))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(capture).toBeFocused();
});

test('the backdrop dims to the identity value, and is never blurred', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Meta+p');
  await expect(palette(page)).toBeVisible();

  const backdrop = page.locator('.vt-overlay');
  // Chapter 07: "Dialog backdrops are a flat rgba(0,0,0,0.66), dimmed, never
  // blurred." The palettes used to carry their own rgba(4,4,3,0.6).
  await expect(backdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.66)');
  await expect(backdrop).toHaveCSS('backdrop-filter', 'none');
  await expect(palette(page)).toHaveCSS('backdrop-filter', 'none');
});

test('the ⌘P active row is visible, and moves with the arrow keys', async ({ page }) => {
  await signIn(page);
  // signIn leaves the pointer on the sign-in button, and the palette opens
  // under it, hovering a row legitimately makes it active, so park the mouse
  // outside before testing the keyboard.
  await page.mouse.move(0, 0);
  await page.keyboard.press('Meta+p');
  const input = page.getByLabel('Command or record search');
  await expect(input).toBeFocused();

  const rows = page.getByRole('option');
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');

  // The highlight used to be --ae-surface-raised painted on a panel that was
  // also --ae-surface-raised: aria-selected moved, nothing on screen did.
  const seen = await page.evaluate(() => {
    const on = document.querySelector('[role="option"][aria-selected="true"]')!;
    const panel = document.querySelector('.vt-palette')!;
    return {
      row: getComputedStyle(on).backgroundColor,
      panel: getComputedStyle(panel).backgroundColor,
      marker: getComputedStyle(on, '::before').backgroundColor,
      markerWidth: getComputedStyle(on, '::before').width,
    };
  });
  expect(seen.row).not.toBe(seen.panel);
  // And never by colour alone: the active row carries a marker bar.
  expect(seen.markerWidth).toBe('2px');
  expect(seen.marker).not.toBe('rgba(0, 0, 0, 0)');

  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  // aria-activedescendant has to follow, or the announcement lags the highlight.
  await expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-1');
});

test('⌘P reports searching, no matches, and a failed search', async ({ page }) => {
  await signIn(page);

  // Searching: hold the response open so the skeleton is observable.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(SWITCH, async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' });
  });

  await page.keyboard.press('Meta+p');
  await page.getByLabel('Command or record search').fill('zzzznothingmatchesthis');
  await expect(page.getByRole('status', { name: 'Searching' })).toBeVisible();

  release();
  await expect(page.getByText('No command or record matches')).toBeVisible();

  // Failure: commands keep working, so it says so rather than blanking.
  await page.unroute(SWITCH);
  await page.route(SWITCH, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await page.getByLabel('Command or record search').fill('sarah');
  await expect(page.getByRole('alert')).toContainText('Search failed.');
});

test('⌘K confirms a capture with the verb, and keeps the line on failure', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Meta+k');
  const input = page.getByLabel('Capture line');

  const line = `i overlay screen test ${Date.now()}`;
  await input.fill(line);
  // Chips prove the grammar parsed before anything is committed.
  await expect(page.getByText('idea', { exact: true })).toBeVisible();

  await page.route(CAPTURE, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"unavailable","message":"The graph is read-only right now."}}',
    }),
  );
  await input.press('Enter');

  // The typed line is the only copy of it: a failure must not close the dialog.
  await expect(page.getByRole('alert')).toContainText('Capture failed.');
  await expect(page.getByRole('alert')).toContainText('The graph is read-only right now.');
  await expect(input).toHaveValue(line);

  await page.unroute(CAPTURE);
  await input.press('Enter');
  await expect(palette(page)).toBeHidden();
  // The control says Capture; the confirmation says Captured.
  await expect(page.getByRole('status')).toContainText('Captured idea');
});

test('the reminders drawer shows the reminder text, not blank rows', async ({ page }) => {
  await signIn(page);
  const bell = page.getByRole('button', { name: /reminders/i });
  await bell.click();

  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Reminders' }) });
  await expect(drawer).toBeVisible();

  // Both writers store `note`; the drawer read `text`, so every row rendered
  // empty while the bell counted them correctly.
  const first = drawer.getByRole('listitem').first();
  await expect(first).toContainText(/\S/);
  const text = (await first.innerText()).replace(/Snooze|Done|overdue|due today|\d{4}-\d{2}-\d{2}/g, '').trim();
  expect(text.length).toBeGreaterThan(0);

  // The due tone always ships with the word, never a bare coloured dot.
  await expect(first).toContainText(/overdue|due today|\d{4}-\d{2}-\d{2}/);
});

test('the reminders drawer restores focus to the bell on Escape', async ({ page }) => {
  await signIn(page);
  const bell = page.getByRole('button', { name: /reminders/i });

  await bell.click();
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await page.keyboard.press('Escape');
  // The hand-rolled listener closed it but never gave focus back.
  await expect(bell).toBeFocused();
});

// Each state gets a fresh page: the drawer's query is cached under
// ['reminders'], so re-opening it in the same session never refetches and a
// late route override would silently do nothing.
test('the reminders drawer reports an empty list', async ({ page }) => {
  await page.route(REMINDERS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"reminders":[]}' }),
  );
  await signIn(page);
  await page.getByRole('button', { name: /reminders/i }).click();
  await expect(page.getByText('Nothing due.')).toBeVisible();
});

test('the reminders drawer reports a failed load and offers a retry', async ({ page }) => {
  await page.route(REMINDERS, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await signIn(page);
  await page.getByRole('button', { name: /reminders/i }).click();
  await expect(page.getByRole('alert')).toContainText("Couldn't load reminders");

  await page.unroute(REMINDERS);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('listitem').first()).toBeVisible();
});

test('first-run is a dialog, is dismissible, and stays dismissed', async ({ page }) => {
  await page.goto('/signin');
  await page.evaluate(() => localStorage.removeItem('vitae.v1.welcomed'));
  await page.getByRole('button', { name: /developer sign-in/i }).click();

  const welcome = page.getByRole('dialog', { name: 'Welcome to Vitae' });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('listitem')).toHaveCount(3);

  await expectNoA11yViolations(page, '.vt-modal');

  // Two ways out, and the dialog names both: straight to Today, or the tour.
  await welcome.getByRole('button', { name: 'Open Today' }).click();
  await expect(welcome).toBeHidden();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Welcome to Vitae' })).toBeHidden();
});

test('an open palette has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Meta+p');
  await page.getByLabel('Command or record search').fill('sarah');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expectNoA11yViolations(page, '.vt-palette');
});
