import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiPost, expectOkJson } from './helpers/api';

const TASK = {
  id: 'waiting-review',
  title: 'Confirm the community research partnership',
  status: 'waiting',
  rev: 1,
  follow_up: '2020-01-01',
};
const PERSON = { id: 'waiting-person', type: 'person', title: 'Sam Rivera' };
const RELATION = {
  edges: [{ type: 'WAITING_ON', src: TASK.id, dst: PERSON.id }],
  neighbors: { [PERSON.id]: PERSON },
};

test('Waiting keeps long tasks, contacts and follow-up controls readable at three sizes', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const title =
    'Confirm the community research partnership — interview accessibility, recruitment, shared findings and follow-up commitments';
  await page.route('**/api/v1/productivity/waiting', (route) =>
    route.fulfill({
      json: {
        tasks: [
          { ...TASK, title },
          { ...TASK, id: 'no-contact', title: 'Agree the next milestone', follow_up: undefined },
        ],
      },
    }),
  );
  await page.route('**/api/v1/nodes/waiting-review', (route) => route.fulfill({ json: RELATION }));
  await page.route('**/api/v1/nodes/no-contact', (route) =>
    route.fulfill({ json: { edges: [], neighbors: {} } }),
  );
  await page.goto('/today/waiting');
  await expect(page.getByRole('link', { name: 'Sam Rivera' })).toHaveAttribute(
    'href',
    '/network/people/waiting-person',
  );
  await expect(page.getByRole('link', { name: title })).toHaveAttribute(
    'href',
    '/n/waiting-review',
  );
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('heading', { name: 'Waiting', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`waiting-${width}.png`),
      animations: 'disabled',
    });
    await page
      .getByRole('button', { name: 'Set follow-up', exact: true })
      .last()
      .evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(
      page.getByRole('button', { name: 'Set follow-up', exact: true }).last(),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`waiting-lower-${width}.png`),
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('.prod-waiting-row')
        .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)),
    ).toBe(true);
    await expectNoA11yViolations(page, '.prod-waiting');
  }
  expect(errors).toEqual([]);
});

test('Waiting preserves drafts across filters and guards leaving, with URL persistence', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/productivity/waiting', (route) =>
    route.fulfill({ json: { tasks: [TASK] } }),
  );
  await page.route('**/api/v1/nodes/waiting-review', (route) => route.fulfill({ json: RELATION }));
  await page.goto('/today/waiting?source=review');
  const input = page.getByLabel(`Follow-up date for ${TASK.title}`);
  await input.fill('2030-01-01');
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(page.getByText('No matching waiting tasks')).toBeVisible();
  await page.getByRole('button', { name: 'All waiting', exact: true }).click();
  await expect(input).toHaveValue('2030-01-01');
  await page.getByRole('link', { name: 'Find a task' }).click();
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(input).toHaveValue('2030-01-01');
  await input.fill('2020-01-01');
  await page.getByRole('button', { name: 'Follow up now' }).click();
  await page.getByRole('searchbox', { name: 'Search waiting tasks' }).fill('partnership');
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search waiting tasks' })).toHaveValue(
    'partnership',
  );
  await expect(page.getByRole('button', { name: 'Follow up now' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Waiting distinguishes failed lookups and retains dates after an unconfirmed write', async ({
  page,
}) => {
  await signIn(page);
  let lookupFailed = true;
  let attempts = 0;
  const commands: unknown[] = [];
  await page.route('**/api/v1/productivity/waiting', (route) =>
    route.fulfill({ json: { tasks: [TASK] } }),
  );
  await page.route('**/api/v1/nodes/waiting-review', (route) =>
    route.fulfill(
      lookupFailed
        ? { status: 503, json: { error: { code: 'OFFLINE', message: 'Lookup offline' } } }
        : { json: RELATION },
    ),
  );
  await page.route('**/api/v1/productivity/commands', (route) => {
    commands.push(route.request().postDataJSON());
    attempts++;
    return route.fulfill(
      attempts === 1
        ? { status: 503, json: { error: { code: 'OFFLINE', message: 'Connection lost' } } }
        : {
            json: {
              replayed: true,
              result: {
                task: {
                  id: TASK.id,
                  type: 'task',
                  title: TASK.title,
                  rev: 2,
                  props: { status: 'waiting', follow_up: '2030-01-01' },
                },
              },
            },
          },
    );
  });
  await page.goto('/today/waiting?followup=due');
  await expect(page.getByText(/Couldn't load who you're waiting on/)).toBeVisible();
  await expect(page.getByText(/No person or organization linked/)).toBeHidden();
  lookupFailed = false;
  await page.getByRole('button', { name: 'Retry contact' }).click();
  await expect(page.getByRole('link', { name: 'Sam Rivera' })).toBeVisible();
  const input = page.getByLabel(`Follow-up date for ${TASK.title}`);
  await input.fill('2030-01-01');
  await page.getByRole('button', { name: 'Set follow-up' }).click();
  await expect(page.getByText('Follow-up was not confirmed')).toBeVisible();
  await expect(input).toHaveValue('2030-01-01');
  await page.getByRole('button', { name: 'Set follow-up' }).click();
  await expect(page.getByText(/Follow-up saved for 2030-01-01/)).toBeVisible();
  await expect(page.getByText('No matching waiting tasks')).toBeVisible();
  expect(commands[0]).toEqual(commands[1]);
});

test('Waiting saves a real follow-up and keeps it after reload', async ({ page }) => {
  await signIn(page);
  const title = `Follow-up review ${Date.now()}`;
  await expectOkJson(
    await apiPost(page, '/nodes', { type: 'task', title, props: { status: 'waiting' } }),
    'Create waiting task',
  );
  await page.goto(`/today/waiting?q=${encodeURIComponent(title)}`);
  const input = page.getByLabel(`Follow-up date for ${title}`);
  await input.fill('2030-10-02');
  await page.getByRole('button', { name: 'Set follow-up' }).click();
  await expect(page.getByText(/Follow-up saved for 2030-10-02/)).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue('2030-10-02');
  await expect(page.getByRole('button', { name: 'Set follow-up' })).toBeDisabled();
});
