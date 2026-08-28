import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { chooseOption } from './helpers/controls';

/**
 * Tailor target lifecycle: edit status/fields/keywords, archive + restore.
 * Requires demo seed (for auth/space); creates a uniquely named target so
 * prior runs do not pollute assertions.
 */
// Create, parse, restatus, rename, re-keyword, archive, restore: seven round
// trips to the API, which is more than the 30s single-screen default covers.
test.describe.configure({ timeout: 90_000 });

test('tailor target rail supports status, keyword edit, and archive/restore', async ({ page }) => {
  const stamp = Date.now();
  const role = `Lifecycle Target ${stamp}`;
  const edited = `${role} (edited)`;

  await signInDemo(page);
  await page.goto('/resume/tailor');

  // The rail's button says what it makes, so it needs no scoping by class.
  await page.getByRole('button', { name: 'New target' }).click();
  await page.getByPlaceholder('Role title').fill(role);
  await page.getByPlaceholder('Company').fill('Lifecycle Co');
  await page
    .getByPlaceholder('Paste the job description here...')
    .fill('Requirements\n- Python\n- Kubernetes\n- SQL');
  await page.getByRole('button', { name: /parse keywords/i }).click();
  await expect(page.getByRole('button', { name: new RegExp(role) })).toBeVisible({ timeout: 15_000 });
  const status = page.getByRole('combobox', { name: 'Target status' });
  await expect(status).toBeVisible({ timeout: 10_000 });

  await chooseOption(page, 'Target status', 'Active');

  // Both Edit buttons on the rail now say which panel they open, so neither
  // needs to be found by position inside a class.
  await page.getByRole('button', { name: 'Edit: role and company' }).click();
  // By role, not by label alone: the button that closes this panel is named
  // "Cancel: role and company", and getByLabel matches that substring too.
  await page.getByRole('textbox', { name: 'Role title' }).fill(edited);
  await page.getByRole('textbox', { name: 'Company' }).fill('Edited Co');
  await page.getByRole('button', { name: /save details/i }).click();
  await expect(page.getByRole('button', { name: new RegExp(edited.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Edit: weighted keywords' }).click();
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
