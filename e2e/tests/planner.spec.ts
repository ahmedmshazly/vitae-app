import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

const DASHBOARD = '**/api/v1/dashboard';
const REMINDERS = '**/api/v1/reminders?due=all';
async function stubPlanner(page: Page, reminders: unknown[], dashboard: unknown = {}) {
  await page.route(DASHBOARD, (route) => route.fulfill({ json: dashboard }));
  await page.route(REMINDERS, (route) => route.fulfill({ json: { reminders } }));
}

test('Planner keeps future reminders, long titles and date context readable at every viewport', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const data = await (await apiGet(page, '/dashboard')).json();
  const person = data.reconnect[0].person;
  await stubPlanner(page, [
    { id: 'past', note: 'Confirm the community research partnership and share the next interview schedule with everyone involved', due_on: '2020-01-01', subject_id: person.id },
    { id: 'future', note: 'Review the long-term research plan', due_on: '2030-12-01' },
  ], { focus: { tasks: [{ id: 'unscheduled', title: 'Decide when to start', due: null }] }, upcoming: [{ id: 'bad-date', type: 'event', title: 'Imported event needing a date review', date: '2026-02-30', label: 'Event' }] });
  await page.goto('/today/planner');
  const planner = page.locator('.page--planner');
  await expect(planner.getByText('4 items', { exact: true })).toBeVisible();
  await expect(planner.getByText('Overdue', { exact: true })).toBeVisible();
  await expect(planner.getByText('Event · Date needs review')).toBeVisible();
  expect(await planner.locator('a[href*="undefined"]').count()).toBe(0);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await planner.getByRole('heading', { name: 'Planner', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await planner.locator('.planner-item__title').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth))).toBe(true);
    await expectNoA11yViolations(page, '.page--planner');
    await page.screenshot({ path: testInfo.outputPath(`planner-${width}.png`), animations: 'disabled' });
    await planner.getByRole('heading', { name: 'Unscheduled' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`planner-later-${width}.png`), animations: 'disabled' });
  }
  await planner.getByRole('link', { name: /Confirm the community/ }).click();
  await expect(page).toHaveURL(new RegExp(`/n/${person.id}$`));
  await expect(page.getByRole('heading', { name: person.title, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Planner filters persist through reload and Back, with keyboard and no-results recovery', async ({ page }) => {
  await signIn(page);
  await stubPlanner(page, [{ id: 'future', note: 'Future reminder', due_on: '2030-12-01' }]);
  await page.goto('/today/planner?source=review');
  const planner = page.locator('.page--planner');
  const tasks = planner.getByRole('button', { name: 'Tasks', exact: true });
  await tasks.focus();
  await page.keyboard.press('Enter');
  await expect(tasks).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/source=review&show=tasks/);
  await expect(planner.getByText('No matching items')).toBeVisible();
  await page.reload();
  await expect(tasks).toHaveAttribute('aria-pressed', 'true');
  await planner.getByRole('button', { name: 'Show all items' }).click();
  await expect(planner.getByText('Future reminder')).toBeVisible();
  await page.goBack();
  await expect(tasks).toHaveAttribute('aria-pressed', 'true');
  await expect(planner.getByText('No matching items')).toBeVisible();
  await planner.getByRole('button', { name: 'Reminders', exact: true }).click();
  await expect(planner.getByText('Future reminder')).toBeVisible();
});

test('Planner distinguishes loading, total failure, partial records and a truly empty result', async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  let state: 'loading' | 'failure' | 'partial' | 'empty' = 'loading';
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const failure = { status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Temporarily offline' } } };
  await page.route(DASHBOARD, async (route) => {
    if (state === 'loading') await pending;
    if (state === 'failure') return route.fulfill(failure);
    return route.fulfill({ json: state === 'partial' ? { focus: { tasks: [{ id: 't1', title: 'Available task', due: null }] } } : {} });
  });
  await page.route(REMINDERS, async (route) => {
    if (state === 'loading') await pending;
    return route.fulfill(state === 'empty' ? { json: { reminders: [] } } : failure);
  });
  await page.goto('/today/planner');
  const planner = page.locator('.page--planner');
  await expect(planner.getByRole('status', { name: 'Loading' })).toBeVisible();
  await expect(planner.getByText('No items in this planner')).toBeHidden();
  state = 'failure'; release();
  await expect(planner.getByText("Couldn't load the planner")).toBeVisible();
  state = 'partial';
  await planner.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(planner.getByText('Available task')).toBeVisible();
  await expect(planner.getByText('This planner may be incomplete')).toBeVisible();
  await expectNoA11yViolations(page, '.page--planner');
  state = 'empty';
  await planner.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(planner.getByText('No items in this planner')).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Open tasks', exact: true })).toBeVisible();
});

test('Planner and the reminder drawer share completion and Undo state', async ({ page }) => {
  await signIn(page);
  await page.goto('/today/planner?show=reminders');
  const rows = page.locator('.planner-day__items > li');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await page.getByRole('button', { name: /^Reminders,/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Reminders', exact: true });
  await drawer.getByRole('button', { name: 'Done', exact: true }).first().click();
  await expect(rows).toHaveCount(before - 1);
  const notification = page.locator('.vt-toast').filter({ hasText: 'Reminder marked done.' });
  await notification.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(before);
});
