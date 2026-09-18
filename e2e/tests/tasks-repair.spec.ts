import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiPost, expectOkJson } from './helpers/api';

const TASK = {
  id: 'review-task',
  title: 'Prepare the community research brief',
  status: 'next',
  rev: 1,
  due: '2026-09-18',
  project_id: 'review-project',
  placement: { quadrant: 'do', reason: 'due_within_window', params: { due: '2026-09-18' } },
};
async function fixture(page: Page, title = TASK.title) {
  await page.route('**/api/v1/productivity/tasks', (route) =>
    route.fulfill({ json: { tasks: [{ ...TASK, title }] } }),
  );
  await page.route('**/api/v1/productivity/time-entries**', (route) =>
    route.fulfill({ json: { time_entries: [] } }),
  );
  await page.route('**/api/v1/nodes/review-task', (route) =>
    route.fulfill({
      json: {
        node: {
          id: TASK.id,
          props: {
            recurrence: {
              rrule: 'FREQ=WEEKLY;BYDAY=MO',
              mode: 'fixed',
              exceptions: ['2026-09-21'],
            },
          },
        },
        edges: [],
        neighbors: {},
      },
    }),
  );
  await page.route('**/api/v1/nodes?type=project*', (route) =>
    route.fulfill({
      json: { nodes: [{ id: 'review-project', title: 'Community research and shared findings' }] },
    }),
  );
  await page.route('**/api/v1/views', (route) =>
    route.fulfill({
      json: {
        views: [
          { id: 'next', name: 'Next actions', query: 'type:task status:next' },
          { id: 'unsupported', name: 'Repeat tasks', query: 'type:task has:recurrence' },
        ],
      },
    }),
  );
  await page.route('**/api/v1/search/switch**', (route) =>
    route.fulfill({
      json: { results: [{ id: 'review-person', type: 'person', title: 'Sam Rivera' }] },
    }),
  );
}

test('Tasks list, matrix, inspector and waiting picker remain usable at three sizes', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const title =
    'Prepare the community research brief — consolidate interview findings, accessibility recommendations and follow-up commitments with regional partners';
  await fixture(page, title);
  await page.goto('/today/tasks');
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByRole('heading', { name: 'Tasks', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`tasks-${width}.png`),
      animations: 'disabled',
    });
    const opener = page.getByRole('button', { name: title, exact: true });
    await opener.scrollIntoViewIfNeeded();
    expect(await opener.evaluate((node) => node.getBoundingClientRect().width > 100)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expectNoA11yViolations(page, '.prod-tasks');
    await page.screenshot({
      path: testInfo.outputPath(`tasks-list-${width}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Matrix', exact: true }).click();
    await page.getByRole('region', { name: 'Do', exact: true }).scrollIntoViewIfNeeded();
    expect(
      await page
        .locator('.prod-card')
        .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)),
    ).toBe(true);
    await expectNoA11yViolations(page, '.prod-tasks');
    await page.screenshot({
      path: testInfo.outputPath(`tasks-matrix-${width}.png`),
      animations: 'disabled',
    });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: title, exact: true });
    await expect(sheet.getByLabel('Recurrence (rrule)')).toHaveValue('FREQ=WEEKLY;BYDAY=MO');
    await sheet.getByLabel('Title', { exact: true }).scrollIntoViewIfNeeded();
    await expectNoA11yViolations(page, '.vt-sheet');
    await page.screenshot({
      path: testInfo.outputPath(`tasks-detail-${width}.png`),
      animations: 'disabled',
    });
    await sheet.getByRole('button', { name: 'Start timer' }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`tasks-detail-lower-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await page.getByRole('button', { name: 'Wait', exact: true }).click();
    const wait = page.getByRole('dialog', { name: 'Wait on someone' });
    await wait.getByRole('combobox').fill('Sam');
    await expect(page.getByRole('option', { name: /Sam Rivera person/ })).toBeVisible();
    await expectNoA11yViolations(page, '.vt-modal');
    await page.screenshot({
      path: testInfo.outputPath(`tasks-wait-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(wait).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('Tasks filters persist and unsupported views never silently return wrong matches', async ({
  page,
}) => {
  await signIn(page);
  await fixture(page);
  await page.goto('/today/tasks?source=review');
  await page.getByLabel('Saved view', { exact: true }).selectOption('next');
  await page.getByLabel('Project', { exact: true }).selectOption('review-project');
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('brief');
  await page.getByRole('button', { name: 'Matrix', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Saved view', { exact: true })).toHaveValue('next');
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('brief');
  await expect(page.getByRole('region', { name: 'Do', exact: true })).toBeVisible();
  await page.getByLabel('Saved view', { exact: true }).selectOption('unsupported');
  await expect(page.getByRole('alert')).toContainText('has:recurrence');
  await expect(page.getByText('No matching tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/source=review&layout=matrix/);
  await expect(page.getByRole('button', { name: TASK.title })).toBeVisible();
});

test('Tasks preserve loaded rows after refresh failure and offer recovery', async ({ page }) => {
  await signIn(page);
  await fixture(page);
  await page.goto('/today/tasks');
  await expect(page.getByRole('button', { name: TASK.title })).toBeVisible();
  await page.route('**/api/v1/productivity/tasks', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Offline', code: 'OFFLINE' } } }),
  );
  await page.getByRole('button', { name: 'Refresh tasks' }).click();
  await expect(page.getByText("Couldn't load tasks")).toBeVisible();
  await expect(page.getByRole('button', { name: TASK.title })).toBeVisible();
  await page.unroute('**/api/v1/productivity/tasks');
  await page.route('**/api/v1/productivity/tasks', (route) =>
    route.fulfill({ json: { tasks: [] } }),
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No tasks yet')).toBeVisible();
  await page.getByRole('button', { name: 'Capture a task' }).click();
  await expect(page.getByLabel('Capture a task')).toBeFocused();
});

test('Tasks inspector protects drafts, validates clearing, and preserves a failed save', async ({
  page,
}) => {
  await signIn(page);
  await fixture(page);
  await page.route('**/api/v1/productivity/commands', (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: 'CONFLICT', message: 'This revision changed.' } },
    }),
  );
  await page.goto('/today/tasks');
  await page.getByRole('button', { name: TASK.title }).click();
  const sheet = page.getByRole('dialog', { name: TASK.title });
  await sheet.getByLabel('Due', { exact: true }).fill('');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('cannot clear stored dates');
  await sheet.getByLabel('Due', { exact: true }).fill('2026-09-20');
  await sheet.getByLabel('Title', { exact: true }).fill('My draft is still here');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('This revision changed.');
  await expect(sheet.getByLabel('Title', { exact: true })).toHaveValue('My draft is still here');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(sheet.getByLabel('Title', { exact: true })).toHaveValue('My draft is still here');
});

test('Tasks real capture, recurrence, dependency, timer, waiting and undo survive reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const stamp = Date.now();
  const title = `Task review ${stamp}`;
  const blockingTitle = `Review prerequisite ${stamp}`;
  const personTitle = `Review collaborator ${stamp}`;
  await expectOkJson(
    await apiPost(page, '/nodes', {
      type: 'task',
      title: blockingTitle,
      props: { status: 'inbox' },
    }),
    'Create prerequisite',
  );
  await expectOkJson(
    await apiPost(page, '/nodes', { type: 'person', title: personTitle, props: {} }),
    'Create collaborator',
  );
  await page.goto('/today/tasks');
  await page.getByLabel('Capture a task').fill(title);
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByLabel('Capture a task')).toHaveValue('');
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill(title);
  await page.getByRole('button', { name: title, exact: true }).click();
  let sheet = page.getByRole('dialog', { name: title, exact: true });
  await expect(sheet.getByLabel('Recurrence (rrule)')).toBeEnabled();
  await sheet.getByLabel('Recurrence (rrule)').fill('FREQ=WEEKLY');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet.getByText('Task saved.')).toBeVisible();
  await sheet.getByRole('combobox', { name: 'Search task...' }).fill(blockingTitle);
  await page.getByRole('option', { name: new RegExp(`${blockingTitle} task`) }).click();
  await sheet.getByRole('button', { name: 'Add dependency' }).click();
  await expect(sheet.getByRole('link', { name: blockingTitle })).toBeVisible();
  await sheet.getByRole('button', { name: 'Start timer' }).click();
  await expect(sheet.getByRole('button', { name: 'Stop timer' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Stop timer' }).click();
  await expect(sheet.getByText('Focus session saved.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: title, exact: true }).click();
  sheet = page.getByRole('dialog', { name: title, exact: true });
  await expect(sheet.getByLabel('Recurrence (rrule)')).toHaveValue('FREQ=WEEKLY');
  await expect(sheet.getByRole('link', { name: blockingTitle })).toBeVisible();
  await expect(sheet.getByText('Timer stopped.')).toBeVisible();
  await sheet.getByRole('button', { name: `Remove dependency on ${blockingTitle}` }).click();
  await expect(sheet.getByRole('link', { name: blockingTitle })).toBeHidden();
  await sheet.getByLabel('Recurrence (rrule)').fill('');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet.getByText('Task saved.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Wait', exact: true }).click();
  const wait = page.getByRole('dialog', { name: 'Wait on someone' });
  await wait.getByRole('combobox').fill(personTitle);
  await page.getByRole('option', { name: new RegExp(`${personTitle} person`) }).click();
  await wait.getByRole('button', { name: 'Confirm wait' }).click();
  await expect(wait).toBeHidden();
  await expect(page.locator('.prod-list')).toContainText('Waiting');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.prod-list')).toContainText('Inbox');
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.locator('.prod-list')).toContainText('Done');
  await page.reload();
  await expect(page.locator('.prod-list')).toContainText('Done');
});
