import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 5: the entity form system. The behaviours here are only observable
 * in a real browser: whether the submit control is reachable inside a modal
 * whose body scrolls, whether the dialog's focus dance fires validation before
 * the user arrives, and whether a rejected save says anything at all.
 */

const NODES = '**/api/v1/nodes';

async function openNew(page: Page, type: string) {
  await page.getByRole('button', { name: /^New record/ }).click();
  await page.getByRole('menuitem', { name: type }).click();
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
  await expect(alert).toContainText('Couldn’t save.');
  await expect(alert).toContainText('The graph is read-only right now.');
  await expect(page.getByLabel('Full name')).toHaveValue(name);
  await expect(page.getByLabel('One-liner')).toHaveValue('should survive the failure');

  // And the same button works once the cause clears.
  await page.unroute(NODES);
  await page.getByRole('button', { name: /^Create person/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.toast')).toContainText(`Created ${name}`);
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

  await page.getByRole('button', { name: 'Remove row' }).first().click();
  await expect(page.getByPlaceholder('name@example.com')).toHaveCount(1);
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
