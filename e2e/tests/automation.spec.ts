import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const RULE = {
  id: 'review-rule',
  name: 'Prepare research follow-ups',
  statement: 'When a title contains research, make the task next.',
  enabled: true,
  condition: { kind: 'predicate', field: 'title', operator: 'contains', value: 'research' },
  actions: [{ field: 'status', value: 'next' }],
  sort_order: 7,
  rev: 2,
  updated_at: '2026-09-14T00:00:00Z',
};
const COMPLEX = {
  ...RULE,
  id: 'complex-rule',
  name: 'Coordinate the community research partnership — accessibility, participant interviews and shared findings',
  condition: {
    kind: 'all',
    conditions: [
      RULE.condition,
      {
        kind: 'not',
        condition: { kind: 'predicate', field: 'status', operator: 'eq', value: 'done' },
      },
    ],
  },
  actions: [...RULE.actions, { field: 'importance', value: 'important' }],
};

test('Automation distinguishes a failed request from an empty list and retains rules on refresh failure', async ({
  page,
}) => {
  await signIn(page);
  let mode: 'error' | 'empty' | 'ready' = 'error';
  await page.route('**/api/v1/productivity/rules', (route) =>
    route.fulfill(
      mode === 'error'
        ? {
            status: 503,
            json: { error: { code: 'UNAVAILABLE', message: 'Rules temporarily unavailable' } },
          }
        : { json: { rules: mode === 'empty' ? [] : [RULE] } },
    ),
  );
  await page.goto('/today/automation');
  await expect(page.getByText("Couldn't load rules")).toBeVisible();
  await expect(page.getByText('No rules yet')).toBeHidden();
  mode = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No rules yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create a rule', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeVisible();
  await page.keyboard.press('Escape');
  mode = 'ready';
  await page.getByRole('button', { name: 'Refresh rules' }).click();
  await expect(page.getByRole('heading', { name: RULE.name })).toBeVisible();
  mode = 'error';
  await page.getByRole('button', { name: 'Refresh rules' }).click();
  await expect(page.getByText("Couldn't load rules")).toBeVisible();
  await expect(page.getByRole('heading', { name: RULE.name })).toBeVisible();
  mode = 'ready';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText("Couldn't load rules")).toBeHidden();
});

test('Automation list, definition and both editor modes work at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/v1/productivity/rules', (route) =>
    route.fulfill({ json: { rules: [RULE, COMPLEX] } }),
  );
  await page.goto('/today/automation');
  await expect(page.getByRole('heading', { name: RULE.name, exact: true })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`automation-list-${width}.png`),
      animations: 'disabled',
    });
    const row = page.locator('.prod-automation-row').last();
    await row.locator('summary').focus();
    await page.keyboard.press('Enter');
    await row
      .locator('pre')
      .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`automation-definition-${width}.png`),
      animations: 'disabled',
    });
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expectNoA11yViolations(page, '.prod-automation');
    await row.locator('summary').click();
    await page.getByRole('button', { name: 'New rule', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'New rule', exact: true });
    await expect(create.getByLabel('Rule name')).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`automation-create-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    await page.keyboard.press('Escape');
    await expect(create).toBeHidden();
    await expect(page.getByRole('button', { name: 'New rule', exact: true })).toBeFocused();
    const edit = page.getByRole('button', { name: `Edit ${COMPLEX.name}`, exact: true });
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'Edit rule', exact: true });
    await page.screenshot({
      path: info.outputPath(`automation-edit-${width}.png`),
      animations: 'disabled',
    });
    await dialog
      .getByLabel('Enabled for storage only')
      .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`automation-edit-lower-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(edit).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

test('Automation saves a real explicit definition, edits it and persists disabling', async ({
  page,
}) => {
  await signIn(page);
  const name = `Research rule review ${Date.now()}`;
  await page.goto('/today/automation');
  await page.getByRole('button', { name: 'New rule', exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill(name);
  await page.getByLabel('Statement', { exact: true }).fill('Promote tasks with a research title.');
  await page.getByLabel('When the title contains').fill('research');
  await page.getByLabel('Set status to').selectOption('doing');
  await page.getByRole('button', { name: 'Edit advanced definition' }).click();
  await expect(page.getByLabel('Condition JSON')).toHaveValue(/research/);
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeVisible();
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search rules' }).fill(name);
  const savedRow = page.locator('.prod-automation-row').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
  await expect(
    savedRow.getByText('When the title contains “research”, set status to doing.'),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByLabel('Set status to')).toHaveValue('doing');
  await page
    .getByLabel('Statement', { exact: true })
    .fill('Keep the research workflow ready for review.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit rule' })).toBeHidden();
  await page.getByRole('button', { name: `Disable ${name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Enable ${name}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(savedRow.getByText('Keep the research workflow ready for review.')).toBeVisible();
  await expect(page.getByRole('button', { name: `Enable ${name}`, exact: true })).toBeVisible();
});

test('Automation protects advanced drafts and retries the same unconfirmed operation', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/productivity/rules', (route) =>
    route.fulfill({ json: { rules: [COMPLEX] } }),
  );
  const attempts: unknown[] = [];
  await page.route('**/api/v1/productivity/commands', (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill(
      attempts.length === 1
        ? {
            status: 503,
            json: { error: { code: 'OFFLINE', message: 'Save temporarily unavailable' } },
          }
        : { json: { result: { rule: { ...COMPLEX, rev: 3 } } } },
    );
  });
  await page.goto('/today/automation');
  await page.getByRole('button', { name: `Edit ${COMPLEX.name}`, exact: true }).click();
  await page.getByLabel('Condition JSON').fill('broken JSON');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/definition must be valid JSON/)).toBeVisible();
  expect(attempts).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Condition JSON')).toHaveValue('broken JSON');
  await page.getByLabel('Condition JSON').fill(JSON.stringify(COMPLEX.condition));
  await page.getByLabel('Statement', { exact: true }).fill('Revised statement.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Rule was not saved')).toBeVisible();
  await expect(page.getByLabel('Statement', { exact: true })).toHaveValue('Revised statement.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit rule' })).toBeHidden();
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({
    expected_revision: 2,
    payload: { condition: COMPLEX.condition, actions: COMPLEX.actions, sort_order: 7 },
  });
});

test('Automation keeps filters after reload and conflict drafts after a rejected save', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/productivity/rules', (route) =>
    route.fulfill({ json: { rules: [RULE] } }),
  );
  await page.route('**/api/v1/productivity/commands', (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: 'REVISION_CONFLICT', message: 'This rule was changed elsewhere.' } },
    }),
  );
  await page.goto('/today/automation?source=review');
  await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  await expect(page.getByText('No matching rules')).toBeVisible();
  await page.getByRole('button', { name: 'Enabled', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search rules' }).fill('research');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Enabled', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(new URL(page.url()).searchParams.get('source')).toBe('review');
  await page.getByRole('button', { name: `Edit ${RULE.name}`, exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('My preserved rule draft');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('This rule changed elsewhere')).toBeVisible();
  await expect(page.getByLabel('Rule name', { exact: true })).toHaveValue(
    'My preserved rule draft',
  );
});
