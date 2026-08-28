import { test, expect, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { ensureQueue } from './helpers/fixtures';
import { toast } from './helpers/toast';

/**
 * Screen 2: Today. The four states, the two mutations, and the register rule.
 * Loading and error are driven by intercepting the dashboard aggregate, because
 * a seeded stack never produces either on its own; the queue's empty state is
 * unreachable from the seed for the same reason.
 */

const DASHBOARD = '**/api/v1/dashboard';

/** The queue region, the Getting-started checklist is a list of <li> too. */
function queue(page: Page) {
  return page.getByRole('region', { name: /^Needs you/ });
}

test('the queue leads the page and counts itself in the summary', async ({ page }) => {
  await signIn(page);
  // A fresh seed has no reminders and no open tasks, which is correct, the
  // queue's content is this test's precondition, so it makes it.
  const count = await ensureQueue(page, 2);
  expect(count).toBeGreaterThan(0);

  await expect(page.getByText(new RegExp(`${count} things? needs? you`))).toBeVisible();
  await expect(queue(page).getByRole('listitem')).toHaveCount(count);

  // Every row states its status in words, never by colour alone.
  await expect(queue(page).getByRole('listitem').first()).toContainText(/overdue|due today|no date|in \d+d/);
});

test('a reminder can be completed from the queue and undone from the toast', async ({ page }) => {
  await signIn(page);
  await ensureQueue(page, 1);

  const rows = queue(page).getByRole('listitem');
  const before = await rows.count();
  // Row titles repeat across seeded reminders, so identity is the count, not
  // the text, a title filter would match the siblings that stayed.
  await rows.filter({ has: page.getByRole('button', { name: 'Done' }) }).first()
    .getByRole('button', { name: 'Done' }).click();

  // The button says Done; so does the confirmation.
  const done = toast(page, 'Done');
  await expect(done).toBeVisible();
  await expect(rows).toHaveCount(before - 1);

  await done.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(before);
});

/**
 * Put the habit back to unchecked before the test acts on it. The seed leaves
 * today unchecked, but the suite shares one data space and a previous run may
 * have left it the other way.
 */
async function resetHabitToUnchecked(check: Locator, uncheck: Locator): Promise<void> {
  if (!(await uncheck.isVisible())) return;
  await uncheck.click();
  await expect(check).toBeVisible();
}

test('checking a habit flips at once, confirms, and survives a reload', async ({ page }) => {
  await signIn(page);

  const check = page.getByRole('button', { name: /^Check Deep work 2h/ });
  const uncheck = page.getByRole('button', { name: /^Uncheck Deep work 2h/ });
  await resetHabitToUnchecked(check, uncheck);

  await check.click();
  await expect(uncheck).toHaveAttribute('aria-pressed', 'true');
  // Anchored: resetting a habit this run leaves an Unchecked toast beside it.
  await expect(toast(page, /^Checked/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Uncheck Deep work 2h/ })).toBeVisible();

  // Leave the seed as we found it, other specs read the same habit.
  await page.getByRole('button', { name: /^Uncheck Deep work 2h/ }).click();
  await expect(page.getByRole('status')).toContainText('Unchecked');
  await expect(page.getByRole('button', { name: /^Check Deep work 2h/ })).toBeVisible();
});

test('the register rule encodes the real weekday, not decoration', async ({ page }) => {
  await signIn(page);
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  await expect(page.getByRole('img', { name: `Days of this week: ${day}` })).toBeVisible();
  // Exactly one tick is active; the rest are the scale.
  await expect(page.locator('.vt-register__tick')).toHaveCount(7);
  await expect(page.locator('.vt-register__tick--on')).toHaveCount(1);
});

test('a row link highlights by ground, never by underlining the whole row', async ({ page }) => {
  await signIn(page);
  await ensureQueue(page, 1);
  // The global `a:hover { text-decoration: underline }` lives in @layer base so
  // Tailwind's utilities can beat it. Unlayered, it silently won and struck a
  // line through the title, the date and the chip together.
  const row = queue(page).getByRole('listitem').first().getByRole('link').first();
  await row.hover();
  await expect(row).toHaveCSS('text-decoration-line', 'none');
  await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('row controls keep a 32px target and a visible focus ring', async ({ page }) => {
  await signIn(page);
  await ensureQueue(page, 1);
  const done = queue(page).getByRole('button', { name: 'Done' }).first();
  const box = (await done.boundingBox())!;

  // The ink is 26px by design; the target is grown to the identity's 32x32
  // minimum with a pseudo-element so no existing screen relaid out.
  expect(box.height).toBeLessThan(32);
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null,
    { x: box.x + box.width / 2, y: box.y - 2 },
  );
  expect(hit).toBe('Done');

  // A ghost button's `box-shadow: none` used to cancel the global
  // :focus-visible ring, which axe cannot detect. Reached by Tab, not
  // .focus(), :focus-visible only matches keyboard focus.
  await queue(page).getByRole('listitem').first().getByRole('link').first().focus();
  await page.keyboard.press('Tab');
  await expect(done).toBeFocused();
  await expect(done).not.toHaveCSS('box-shadow', 'none');
});

test('error state names the failure, shows the detail, and retries', async ({ page }) => {
  await signIn(page);
  await page.route(DASHBOARD, (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      // The API's envelope, a flat {code,message} falls through to statusText.
      body: '{"error":{"code":"upstream","message":"upstream is down"}}',
    }),
  );
  await page.reload();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load today");
  await expect(alert).toContainText('upstream is down');
  // Nothing true to encode while the load failed, so the rule carries no ticks.
  await expect(page.locator('.vt-register__tick')).toHaveCount(0);

  await page.unroute(DASHBOARD);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: /^Needs you/ })).toBeVisible();
});

test('loading state is skeleton rows in the shape of the queue', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(DASHBOARD, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/signin');
  await page.evaluate(() => localStorage.setItem('vitae.v1.welcomed', '1'));
  await page.getByRole('button', { name: /developer sign-in/i }).click();

  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: /^Needs you/ })).toBeVisible();
});

test('empty state distinguishes an empty queue from no habits and nobody drifting', async ({ page }) => {
  await signIn(page);
  await page.route(DASHBOARD, async (route) => {
    const real = await route.fetch();
    const body = (await real.json()) as Record<string, unknown>;
    await route.fulfill({
      response: real,
      json: { ...body, reminders: [], habits: [], reconnect: [], focus: { tasks: [], goals: [] }, upcoming: [] },
    });
  });
  await page.reload();

  await expect(page.getByText('Nothing needs you today')).toBeVisible();
  await expect(page.getByText('No habits tracked')).toBeVisible();
  await expect(page.getByText('No one is drifting')).toBeVisible();
  // The header summary agrees with the queue rather than reporting a stale count.
  await expect(page.getByText('Nothing needs you', { exact: false }).first()).toBeVisible();

  // Empty states swap in different markup than the populated scan covers.
  await expectNoA11yViolations(page);
});
