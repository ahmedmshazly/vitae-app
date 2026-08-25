/**
 * Typed relationships with list-valued props.
 *
 * KNOWS carries `topics: z.array(z.string())`. Its editor widget is
 * `suggest-list`, which InlinePropInput did not branch on, so it fell through to
 * the plain text input and posted `"Business"` instead of `["Business"]`, the
 * API rejected the whole edge with a 422 that named a field the form never
 * showed as wrong. forms.spec covers ABOUT, which has no array prop and so
 * cannot catch this class.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth.js';

test('add a typed KNOWS relationship carrying a topic', async ({ page }) => {
  const edgeFailures: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/edges') && r.status() >= 400) {
      edgeFailures.push(`${r.status()} on ${r.request().method()} ${r.url()}`);
    }
  });

  await signIn(page);
  await page.goto('/people');
  await page.locator('.people__link').first().click();

  // Renamed in Screens 6-7: "+ add" named neither the action nor its object.
  await page.getByRole('button', { name: 'Add connection' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Add connection' })).toBeVisible();

  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Social · Knows', exact: true }).click();

  // The other endpoint.
  await page.getByPlaceholder(/Search/).first().fill('Jordan');
  await page.getByRole('option').first().click();

  // Relation is a scalar select; topics is the list-valued prop under test.
  const relation = page.getByRole('combobox').nth(1);
  await expect(relation).toBeVisible();
  await relation.click();
  await page.getByRole('option', { name: /Friend/ }).first().click();

  const topics = page.getByPlaceholder(/Topics|Add…/).first();
  await expect(topics).toBeVisible();
  await topics.fill('Business');
  await topics.press('Enter');

  await page.getByRole('button', { name: 'Create link' }).click();

  await expect(page.getByText(/Linked/)).toBeVisible({ timeout: 15_000 });
  expect(edgeFailures, `POST /edges was rejected: ${edgeFailures.join(', ')}`).toEqual([]);
});
