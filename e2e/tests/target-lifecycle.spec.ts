import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { chooseOption } from './helpers/controls';

/**
 * Tailor target lifecycle: edit status/fields/keywords, archive + restore.
 * Requires demo seed (for auth/space); creates a uniquely named target so
 * prior runs do not pollute assertions.
 */
test('tailor target rail supports status, keyword edit, and archive/restore', async ({ page }) => {
  const stamp = Date.now();
  const role = `Lifecycle Target ${stamp}`;
  const edited = `${role} (edited)`;

  await signInDemo(page);
  await page.goto('/resume/tailor');

  await page.locator('.card').filter({ hasText: 'Job targets' }).getByRole('button', { name: '+ New' }).click();
  await page.getByPlaceholder('Role title').fill(role);
  await page.getByPlaceholder('Company').fill('Lifecycle Co');
  await page
    .getByPlaceholder('Paste the job description here…')
    .fill('Requirements\n- Python\n- Kubernetes\n- SQL');
  await page.getByRole('button', { name: /parse keywords/i }).click();
  await expect(page.getByRole('button', { name: new RegExp(role) })).toBeVisible({ timeout: 15_000 });
  const status = page.getByRole('combobox', { name: 'Target status' });
  await expect(status).toBeVisible({ timeout: 10_000 });

  await chooseOption(page, 'Target status', 'Active');

  await page
    .locator('.card')
    .filter({ hasText: 'Job targets' })
    .getByRole('button', { name: 'Edit', exact: true })
    .first()
    .click();
  await page.getByLabel('Role title').fill(edited);
  await page.getByLabel('Company').fill('Edited Co');
  await page.getByRole('button', { name: /save details/i }).click();
  await expect(page.getByRole('button', { name: new RegExp(edited.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible({
    timeout: 10_000,
  });

  await page
    .locator('.spread', { hasText: 'Weighted keywords' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await page.getByPlaceholder('Add keyword').fill('lifecycle-kw');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /save keywords/i }).click();
  await expect(page.getByText('lifecycle-kw', { exact: false })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const editedButton = page.getByRole('button', {
    name: new RegExp(edited.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  });
  await expect(editedButton).toHaveCount(0, { timeout: 10_000 });

  await page.getByLabel('Show archived').check();
  await editedButton.click();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByLabel('Show archived').uncheck();
  await expect(editedButton).toBeVisible({ timeout: 10_000 });
});
