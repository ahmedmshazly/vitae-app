import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiPost } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('Undo waits, reports failure, and can retry the same reminder on a phone', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const name = `Notification review ${Date.now()}`;
  expect((await apiPost(page, '/capture', { raw: `i ${name} ^tomorrow` })).ok()).toBe(true);
  await page.reload();
  const bell = page.getByRole('button', { name: /^Reminders/ });
  await bell.click();
  const row = page.getByRole('dialog', { name: 'Reminders', exact: true }).getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: 'Done', exact: true }).click();
  const notification = page.locator('.vt-toast').filter({ hasText: 'Reminder marked done.' });
  await expect(notification).toBeVisible();
  let attempts = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/reminders/*/reopen', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await held;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporarily unavailable"}' });
    } else await route.continue();
  });
  await notification.getByRole('button', { name: 'Undo', exact: true }).click();
  const pending = notification.getByRole('button', { name: 'Undoing…' });
  await expect(pending).toHaveAttribute('aria-disabled', 'true');
  await pending.evaluate((button: HTMLButtonElement) => button.click());
  await expect(notification.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('undo-pending-mobile.png'), animations: 'disabled' });
  release();
  await expect(notification.getByRole('alert')).toContainText("Couldn't undo that change. Try again.");
  expect(attempts).toBe(1);
  await expectNoA11yViolations(page, '.vt-toast-viewport');
  const dock = await page.locator('.mobile-dock').boundingBox();
  const box = await notification.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(dock!.y);
  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect(await notification.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`undo-error-${width}.png`), animations: 'disabled' });
  }
  await notification.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(notification).toBeHidden();
  expect(attempts).toBe(2);
  await bell.click();
  await expect(row).toBeVisible();
});
