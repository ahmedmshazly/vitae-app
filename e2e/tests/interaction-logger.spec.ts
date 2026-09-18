import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('the interaction logger protects multiline notes and fits every viewport', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.getByRole('button', { name: /^Log interaction with/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Log interaction ·/ });
  const note = dialog.getByLabel('What happened?', { exact: false });
  await expect(note).toBeFocused();
  await note.fill('We reviewed the research plan.\nNext step: share the interview schedule.');
  await dialog.getByRole('button', { name: 'call', exact: true }).click();
  await dialog.getByRole('button', { name: 'I did', exact: true }).click();
  await dialog.getByLabel('Follow-up reminder', { exact: false }).fill('2026-09-21');
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expectNoA11yViolations(page, '.vt-modal');
    await page.screenshot({ path: testInfo.outputPath(`logger-${width}.png`), animations: 'disabled' });
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Discard changes?', exact: true });
  await expect(prompt.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await prompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(note).toHaveValue('We reviewed the research plan.\nNext step: share the interview schedule.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await prompt.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('retrying a lost interaction response confirms the original record without duplicating it', async ({ page }, testInfo) => {
  await signIn(page);
  const submissions: unknown[] = [];
  let savedId = '';
  await page.route('**/api/v1/interactions', async (route) => {
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) {
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      savedId = (await saved.json()).interaction.id;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"UNAVAILABLE","message":"The response was interrupted."}}' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: /^Log interaction with/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Log interaction ·/ });
  const tag = `Logger recovery ${Date.now()}`;
  await dialog.getByLabel('What happened?', { exact: false }).fill(tag);
  await dialog.getByLabel('Follow-up reminder', { exact: false }).fill('2030-12-01');
  await expect(dialog.getByText(/Undoing the interaction keeps this reminder/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Save not confirmed');
  await expect(dialog.getByLabel('What happened?', { exact: false })).toBeDisabled();
  await expectNoA11yViolations(page, '.vt-modal');
  await page.screenshot({ path: testInfo.outputPath('logger-unconfirmed.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Retry save' }).click();
  await expect(dialog).toBeHidden();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toEqual(submissions[0]);
  const records = await apiGet(page, '/nodes?type=interaction&limit=1000');
  const matches = (await records.json()).nodes.filter((node: { title: string }) => node.title === tag);
  expect(matches).toHaveLength(1);
  expect(matches[0].id).toBe(savedId);
  const notification = page.locator('.vt-toast').filter({ hasText: /^Logged coffee/ });
  await expect(notification).toContainText('Undo removes only the interaction.');
  await notification.getByRole('button', { name: 'Undo' }).click();
  await expect(notification).toBeHidden();
  const removed = await apiGet(page, `/nodes/${savedId}`);
  expect(removed.ok()).toBe(true);
  expect((await removed.json()).node.deleted_at).toBeTruthy();
  const reminders = (await (await apiGet(page, '/reminders?due=all')).json()).reminders
    .filter((reminder: { related_interaction: string }) => reminder.related_interaction === savedId);
  expect(reminders).toHaveLength(1);
  // The existing backend keeps follow-ups after interaction Undo. Clear only
  // this test's reminder after verifying the documented behavior.
  expect((await apiPost(page, `/reminders/${reminders[0].id}/done`)).ok()).toBe(true);
});
