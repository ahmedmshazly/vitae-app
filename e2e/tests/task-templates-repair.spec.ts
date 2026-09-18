import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const TEMPLATE = {
  id: 'template-review',
  name: 'Community research partnership — interviews, shared findings and accessible follow-ups',
  description:
    'A repeatable starting point for coordinating the research partnership without losing context.',
  kind: 'project',
  body: {
    title: 'Review participant interviews and prepare the next research conversation',
    status: 'next',
    priority: 'p2',
    importance: 'important',
    due: '2026-10-01',
    notes_md: 'These stored notes are not copied by the existing apply contract.',
    extra: { steps: ['Discuss findings', 'Plan follow-ups'] },
  },
  rev: 3,
  created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z',
};

test('Task templates list, stored body, editors and task preview work at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/v1/productivity/templates', (route) =>
    route.fulfill({ json: { templates: [TEMPLATE] } }),
  );
  await page.goto('/today/task-templates');
  await expect(page.getByRole('heading', { name: TEMPLATE.name })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`templates-list-${width}.png`),
      animations: 'disabled',
    });
    const row = page.locator('.prod-template-row');
    await row.locator('summary').focus();
    await page.keyboard.press('Enter');
    await row
      .locator('pre')
      .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`templates-body-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.prod-templates');
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await row.locator('summary').click();
    await page.getByRole('button', { name: 'New template', exact: true }).click();
    await expect(page.getByLabel('Template name')).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`templates-create-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'New template', exact: true })).toBeFocused();
    await page.getByRole('button', { name: `Edit ${TEMPLATE.name}`, exact: true }).click();
    await page.screenshot({
      path: info.outputPath(`templates-edit-${width}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Edit advanced body' }).click();
    await page
      .getByLabel('Task body JSON')
      .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`templates-advanced-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    expect(
      await page
        .getByRole('dialog', { name: 'Edit template' })
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await page.getByRole('button', { name: `Use ${TEMPLATE.name}`, exact: true }).click();
    await page.screenshot({
      path: info.outputPath(`templates-preview-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: `Use ${TEMPLATE.name}`, exact: true }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

test('Task templates real create, edit, apply and created-record journey persists', async ({
  page,
}) => {
  await signIn(page);
  const name = `Interview template ${Date.now()}`;
  const title = `Prepare interview ${Date.now()}`;
  await page.goto('/today/task-templates');
  await page.getByRole('button', { name: 'New template', exact: true }).click();
  await page.getByLabel('Template name').fill(name);
  await page.getByLabel('Task title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New template' })).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search templates' }).fill(name);
  const row = page
    .locator('.prod-template-row')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(row).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await page.getByLabel('Description').fill('Keep interview preparation consistent.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit template' })).toBeHidden();
  await page.reload();
  await expect(row.getByText('Keep interview preparation consistent.')).toBeVisible();
  await row.getByRole('button', { name: `Use ${name}`, exact: true }).click();
  await expect(page.getByRole('dialog').getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.getByRole('link', { name: 'Open created task' }).click();
  await expect(page).toHaveURL(/\/n\//);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('Task template advanced drafts, conflicts and create retries preserve user intent', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/productivity/templates', (route) =>
    route.fulfill({ json: { templates: [TEMPLATE] } }),
  );
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/v1/productivity/commands', (route) => {
    const body = route.request().postDataJSON();
    attempts.push(body);
    return route.fulfill(
      body.type === 'upsert_template'
        ? {
            status: 409,
            json: { error: { code: 'REVISION_CONFLICT', message: 'Changed elsewhere' } },
          }
        : attempts.filter((attempt) => attempt.type === 'create_task').length === 1
          ? {
              status: 503,
              json: { error: { code: 'UNAVAILABLE', message: 'Response unavailable' } },
            }
          : { json: { result: { task: { id: 'created-test-task' } } } },
    );
  });
  await page.goto('/today/task-templates');
  await page.getByRole('button', { name: `Edit ${TEMPLATE.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Edit advanced body' }).click();
  await page.getByLabel('Task body JSON').fill('broken JSON');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/task body must be valid JSON/)).toBeVisible();
  expect(attempts).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Task body JSON')).toHaveValue('broken JSON');
  await page.getByLabel('Task body JSON').fill(JSON.stringify(TEMPLATE.body));
  await page.getByLabel('Description').fill('My retained draft');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('This template changed elsewhere')).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue('My retained draft');
  expect(attempts[0]).toMatchObject({ expected_revision: 3, payload: { body: TEMPLATE.body } });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: `Use ${TEMPLATE.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByText('Task creation was not confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open created task' })).toBeVisible();
  expect(attempts[1]).toEqual(attempts[2]);
});

test('Task template filters, disclosure, empty and refresh errors remain recoverable', async ({
  page,
}) => {
  await signIn(page);
  let fail = true;
  await page.route('**/api/v1/productivity/templates', (route) =>
    route.fulfill(
      fail
        ? {
            status: 503,
            json: { error: { code: 'UNAVAILABLE', message: 'Templates unavailable' } },
          }
        : {
            json: {
              templates: Array.from({ length: 23 }, (_, index) => ({
                ...TEMPLATE,
                id: `template-${index}`,
                name: `Research ${index}`,
              })),
            },
          },
    ),
  );
  await page.goto('/today/task-templates?source=review');
  await expect(page.getByText("Couldn't load templates")).toBeVisible();
  await expect(page.getByText('No templates yet')).toBeHidden();
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.prod-template-row')).toHaveCount(20);
  await page.getByRole('button', { name: 'Show more templates' }).click();
  await expect(page.locator('.prod-template-row')).toHaveCount(23);
  await page.getByRole('button', { name: 'Item', exact: true }).click();
  await expect(page.getByText('No matching templates')).toBeVisible();
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search templates' }).fill('Research 22');
  await expect(page.locator('.prod-template-row')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search templates' })).toHaveValue(
    'Research 22',
  );
  expect(new URL(page.url()).searchParams.get('source')).toBe('review');
  fail = true;
  await page.getByRole('button', { name: 'Refresh templates' }).click();
  await expect(page.getByText("Couldn't load templates")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Research 22' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText("Couldn't load templates")).toBeHidden();
});
