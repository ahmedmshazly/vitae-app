import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';

/**
 * End-to-end journeys against the running stack (SRS §9). These exercise the
 * real SPA → API → Postgres path for the highest-value flows:
 *   J1: capture in ≤60 s
 *   J4: JD → tailored résumé
 *   J8: recover a deleted record from Trash
 */

test('J1: capture a person with the ⌘K grammar', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Meta+k');

  // By accessible label rather than class: the palettes moved onto the shared
  // vt-* surface in Screen 4, and the label is the stable contract anyway.
  const input = page.getByLabel('Capture line');
  await expect(input).toBeVisible();
  const name = `Playwright Person ${Date.now()}`;
  await input.fill(`p ${name} @@TestOrg #e2e ^fri > met at an e2e test`);

  // Live preview chips reflect the parse.
  await expect(page.locator('.vt-palette .vt-chip').first()).toBeVisible();

  await input.press('Enter');
  await expect(input).toBeHidden({ timeout: 10_000 });

  // The captured person is findable via the quick-switcher.
  await page.keyboard.press('Meta+p');
  const switcher = page.getByLabel('Command or record search');
  // Use the full unique title: the shared test data space accumulates journey data,
  // and a broad prefix can push the new record outside the quick-switch limit.
  await switcher.fill(name);
  await expect(page.getByRole('listbox', { name: 'Results' }).getByText(name, { exact: false })).toBeVisible({
    timeout: 15_000,
  });
});

test('J4: paste a JD, auto-tailor, and compile a PDF', async ({ page }) => {
  await signIn(page);
  await page.goto('/resume/tailor');

  // New target session (the rail's own button, not the topbar's New-record
  // menu). It says what it makes now, and says Cancel while the form is open.
  await page.getByRole('button', { name: 'New target' }).click();
  await page.getByPlaceholder('Role title').fill('Playwright ML Engineer');
  await page.getByPlaceholder('Paste the job description here…').fill(
    'Requirements\n- Strong Python\n- Kubernetes\n- Reinforcement learning and gRPC',
  );
  await page.getByRole('button', { name: /parse keywords/i }).click();

  // Keyword chips appear (BM25F parse) and the session lands in the URL.
  await expect(page.getByRole('heading', { name: /^Weighted keywords/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page).toHaveURL(/target=/);

  // Auto-selection fills the page meter.
  await page.getByRole('button', { name: /auto-select atoms/i }).click();
  await expect(page.locator('.vt-meter').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/coverage/i).first()).toBeVisible();

  // Compile → live PDF preview (buildsvc must be running), never a raw .tex dump.
  await page.getByRole('button', { name: /compile pdf/i }).click();
  await expect(page.locator('iframe[title="résumé preview"]')).toBeVisible({ timeout: 30_000 });
});

test('J8: delete a record and restore it from Trash', async ({ page }) => {
  await signIn(page);

  // Create a project via ⌘K, open it, delete it.
  await page.keyboard.press('Meta+k');
  const input = page.getByLabel('Capture line');
  // A collision-proof title so the fuzzy switcher opens exactly this record
  // (the test data space persists across runs within a session).
  const title = `Zqx${Math.random().toString(36).slice(2, 9)}proj`;
  await input.fill(`i ${title}`);
  await input.press('Enter');
  await expect(input).toBeHidden();

  // Find it via the quick-switcher and open THIS run's record, the search
  // index refreshes asynchronously, so the top fuzzy hit can briefly be a
  // stale Zqx… record left by an earlier run.
  await page.keyboard.press('Meta+p');
  const sw = page.getByLabel('Command or record search');
  await sw.fill(title.slice(0, 12));
  const hit = page.getByRole('option', { name: new RegExp(title) });
  await expect(hit.first()).toBeVisible({ timeout: 10_000 });
  await hit.first().click();

  await page.getByRole('button', { name: /delete/i }).click();
  // Deletion now asks for confirmation (makeover: ConfirmDialog before destructive acts).
  await page.getByRole('button', { name: 'Move to trash' }).click();

  // In Trash, restore it.
  await page.goto('/trash');
  const trashRow = page.locator('.row', { hasText: title });
  await expect(trashRow).toBeVisible({ timeout: 10_000 });
  await trashRow.getByRole('button', { name: /restore/i }).click();
  await expect(trashRow).toBeHidden({ timeout: 10_000 });
});
