import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

/**
 * Screen 5: the entity form system. The behaviours here are only observable
 * in a real browser: whether the submit control is reachable inside a modal
 * whose body scrolls, whether the dialog's focus dance fires validation before
 * the user arrives, and whether a rejected save says anything at all.
 */

const NODES = '**/api/v1/nodes';

test('recurring costs leave room to enter an amount on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openNew(page, 'subscription');
  const amount = page.getByRole('spinbutton', { name: 'Cost amount' });
  await amount.fill('149.99');
  expect((await amount.boundingBox())!.width).toBeGreaterThan(150);
  await expect(page.getByRole('textbox', { name: 'Cost currency' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Cost period' }).click();
  await page.getByRole('option', { name: 'Monthly', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('subscription-cost-mobile.png'), animations: 'disabled' });
  await expectNoA11yViolations(page, '.vt-modal');
});

test('every structured record form is reachable and fits mobile and desktop', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: /^New record/ }).click();
  const types = await page.getByRole('menuitem').allTextContents();
  expect(types).toHaveLength(36);
  await page.keyboard.press('Escape');
  for (const raw of types) {
    const type = raw.trim();
    await test.step(type, async () => {
      await openNew(page, type);
      const dialog = page.getByRole('dialog', { name: `New ${type}` });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(
          await page.locator('.vt-modal__body').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await expect(dialog.getByRole('button', { name: /^Create/ })).toBeInViewport();
        await page.screenshot({
          path: testInfo.outputPath(`${type.replaceAll(' ', '-')}-${width}.png`),
          animations: 'disabled',
        });
      }
      await expectNoA11yViolations(page, '.vt-modal');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
  expect(errors).toEqual([]);
});

async function openNew(page: Page, type: string) {
  await page.getByRole('button', { name: /^New record/ }).click();
  await page.getByRole('menuitem', { name: type.toLowerCase(), exact: true }).click();
  await expect(page.getByRole('dialog', { name: `New ${type.toLowerCase()}` })).toBeVisible();
}

test('the submit control is reachable without scrolling the form', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'Person');

  const geometry = await page.evaluate(() => {
    const modal = document.querySelector('.vt-modal')!;
    const body = document.querySelector('.vt-modal__body')!;
    const submit = [...document.querySelectorAll<HTMLElement>('.vt-modal button')].find((b) =>
      /^Create/.test(b.textContent ?? ''),
    )!;
    const s = submit.getBoundingClientRect();
    const m = modal.getBoundingClientRect();
    return {
      // A person form is taller than the body it sits in, so this only holds
      // if the actions are outside the scroll container.
      formOverflows: body.scrollHeight > body.clientHeight,
      submitInsideModal: s.top >= m.top && s.bottom <= m.bottom,
      submitInsideScroller: submit.closest('.vt-modal__body') !== null,
    };
  });
  expect(geometry.formOverflows).toBe(true);
  expect(geometry.submitInsideModal).toBe(true);
  expect(geometry.submitInsideScroller).toBe(false);

  // And it still submits the form it is no longer inside.
  await page.getByLabel('Full name').fill(`Form Person ${Date.now()}`);
  await page.getByRole('button', { name: /^Create person/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
});

test('an untouched form opens clean, then complains on submit', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'Person');

  // Radix focuses the panel, then the Modal focuses the first input; that pair
  // blurred the title field before the user reached it, so the form opened
  // already showing "Required" under an empty, untouched field.
  await expect(page.getByLabel('Full name')).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.vt-fld--error')).toHaveCount(0);

  await page.getByRole('button', { name: /^Create person/ }).click();
  await expect(page.getByRole('alert')).toContainText('Required');
  await expect(page.getByRole('dialog')).toBeVisible();

  // The requirement corrects itself as the user types, not on the next submit.
  await page.getByLabel('Full name').fill('Lina Farouk');
  await expect(page.locator('.vt-fld--error')).toHaveCount(0);
});

test('a rejected save explains itself and keeps everything typed', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'Person');

  const name = `Rejected Person ${Date.now()}`;
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('One-liner').fill('should survive the failure');

  await page.route(NODES, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"unavailable","message":"The graph is read-only right now."}}',
    }),
  );
  await page.getByRole('button', { name: /^Create person/ }).click();

  // There was no catch at all: the rejection escaped as an unhandled error,
  // the dialog sat there looking idle, and nothing said why.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't save.");
  await expect(alert).toContainText('The graph is read-only right now.');
  await expect(page.getByLabel('Full name')).toHaveValue(name);
  await expect(page.getByLabel('One-liner')).toHaveValue('should survive the failure');

  // And the same button works once the cause clears.
  await page.unroute(NODES);
  await page.getByRole('button', { name: /^Create person/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  await expect(toast(page, `Created ${name}`)).toBeVisible();
});

test('a list field adds one row at a time, in the imperative', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'Person');

  // "+ emails" named the field, not the action.
  const add = page.getByRole('button', { name: 'Add email' });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByPlaceholder('name@example.com')).toHaveCount(1);
  await add.click();
  await expect(page.getByPlaceholder('name@example.com')).toHaveCount(2);

  await page.getByRole('button', { name: /^Remove email 1$/i }).click();
  await expect(page.getByPlaceholder('name@example.com')).toHaveCount(1);
});

test('mobile forms keep a draft on Escape and return focus after confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openNew(page, 'Person');
  await page.getByLabel('Full name').fill('Unsaved mobile person');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(confirmation).toBeVisible();
  await expectNoA11yViolations(page, '.vt-modal--sm');
  await confirmation.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Unsaved mobile person');
  await expect(page.getByLabel('Full name')).toBeFocused();
  const form = page.getByRole('dialog', { name: 'New person' });
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('button', { name: 'New record (n)' })).toBeFocused();
});

test('retrying a failed connection finishes the same new record', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'idea');
  const name = `Connection retry ${Date.now()}`;
  const dialog = page.getByRole('dialog', { name: 'New idea' });
  await dialog.locator('#ef-title').fill(name);
  await dialog.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Spark', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Link about...' }).fill('Sarah');
  await page.getByRole('option', { name: /Sarah Chen/ }).click();
  let nodeCreates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/nodes')) nodeCreates += 1;
  });
  await page.route('**/api/v1/edges', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'unavailable', message: 'Connection service unavailable.' },
      }),
    }),
  );
  await dialog.getByRole('button', { name: 'Create idea' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Retry to finish this same record');
  await expect(dialog.locator('#ef-title')).toHaveValue(name);
  await page.unroute('**/api/v1/edges');
  await dialog.getByRole('button', { name: 'Create idea' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  expect(nodeCreates).toBe(1);
  await expect(page.locator('.edge-row', { hasText: 'Sarah Chen' })).toHaveCount(1);
});

test('the form dialog has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await openNew(page, 'Person');
  await expectNoA11yViolations(page, '.vt-modal');

  // Including once it is showing errors, the error text and the field it
  // belongs to have to survive the scan too.
  await page.getByRole('button', { name: /^Create person/ }).click();
  await expect(page.getByRole('alert')).toContainText('Required');
  await expectNoA11yViolations(page, '.vt-modal');
});
