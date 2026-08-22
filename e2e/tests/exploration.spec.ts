import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';

/**
 * E2E journeys for the reference-parity build (Phases 5-8):
 *   Today dashboard · log interaction · ask → composer → send ·
 *   graph navigation · import commit/rollback · duplicate merge/undo.
 * Requires the running stack (emulators + api + web) and a fresh `pnpm seed`.
 */

test('Today: queue, habits, reconnect, and the reference tier', async ({ page }) => {
  await signIn(page);
  // The agenda leads; everything that is merely a number sits below it.
  await expect(page.getByRole('heading', { name: /^Needs you/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Habits/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Reconnect/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How things stand' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
  // Either verb. The toggle is named after the habit it toggles, and which
  // verb it carries depends on whether today is already ticked — `seed.ts`
  // checks "Deep work 2h" on `daysAgo(0)`, so on a freshly seeded database it
  // reads "Uncheck". This line asserted "Check" and so failed on exactly the
  // fresh seed CI runs, while passing locally against a database whose habit
  // an earlier `today.spec.ts` run had toggled off. Whether the toggle flips
  // is today.spec.ts:54's job; this journey only needs the habit to be there
  // and to be addressable by name.
  await expect(page.getByRole('button', { name: /^(Check|Uncheck) Deep work 2h/ })).toBeVisible();
});

test('Log an interaction from a person page: strength recomputes', async ({ page }) => {
  await signIn(page);
  await page.goto('/people');
  // A row's checkbox carries a visually-hidden "Select <name>" label, so the
  // name alone is ambiguous; the row's own link is what opens the record.
  await page.getByRole('link', { name: 'Sarah Chen' }).first().click();
  await page.getByRole('button', { name: 'Log interaction' }).click();
  // Unique note per run, reruns against the same data must not accumulate
  // strict-mode duplicates.
  const note = `E2E quick sync ${Date.now()}`;
  await page.getByPlaceholder('One line: what happened?').fill(note);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('strength recomputed', { exact: false })).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
});

test('Ask → why-panel → composer → send & log', async ({ page }) => {
  await signIn(page);
  await page.goto('/ask/people');
  await page.getByLabel('Topics').fill('reinforcement learning');
  await page.getByRole('button', { name: /^Ask$/ }).click();
  // Every result carries its factor decomposition, named and numbered.
  await expect(page.getByRole('img', { name: /^Score \d/ }).first()).toBeVisible();
  // The card has to be opened now: expanding the top result automatically was
  // the screen making a choice on your behalf before you had read anything.
  await page.getByRole('button', { name: /rank 1$/ }).click();
  await page.getByRole('button', { name: 'Draft the ask' }).first().click();
  await expect(page.getByText('Send & log')).toBeVisible();
  await page.getByRole('button', { name: 'Send & log' }).click();
  await expect(page.getByText('logged as outreach', { exact: false })).toBeVisible({ timeout: 10_000 });
});

test('Graph explorer: renders the canvas, filters, expands', async ({ page }) => {
  await signIn(page);
  await page.goto('/graph');
  await expect(page.getByRole('heading', { name: 'Life map' })).toBeVisible();
  // react-force-graph renders into a canvas inside the panel.
  const canvas = page.locator('.graph__panel canvas');
  await expect(canvas.first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'expand more +' }).click();
  await expect(canvas.first()).toBeVisible();
  await page.getByRole('button', { name: 'fit' }).click();
});

const VCF = `BEGIN:VCARD
VERSION:4.0
FN:Playwright Import
EMAIL:playwright.import@e2e.test
ORG:E2E Test Org
END:VCARD`;

test('Import: stage a vCard, commit, then roll the batch back', async ({ page }) => {
  await signIn(page);
  await page.goto('/import');

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('vCard (.vcf) or CSV address book').click(),
  ]);
  await chooser.setFiles({ name: 'contacts.vcf', mimeType: 'text/vcard', buffer: Buffer.from(VCF) });

  // Staged review: the row appears with a "new" badge, nothing committed yet.
  await expect(page.getByText('review before commit')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Playwright Import', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Commit 1 row$/ }).click();
  await expect(page.getByText('Committed 1 records', { exact: false })).toBeVisible({ timeout: 10_000 });

  // The person is now live.
  await page.goto('/people');
  await expect(page.getByRole('link', { name: 'Playwright Import' })).toBeVisible();

  // Roll the batch back from history, the person disappears.
  await page.goto('/import');
  await page.getByRole('button', { name: /Roll back/ }).first().click();
  await expect(page.getByText('records removed', { exact: false })).toBeVisible({ timeout: 10_000 });
  await page.goto('/people');
  await expect(page.getByRole('link', { name: 'Playwright Import' })).toHaveCount(0);
});

const DUP_VCF = `BEGIN:VCARD
VERSION:4.0
FN:Sarah Chen
EMAIL:sarah@nile-robotics.com
END:VCARD`;

async function rollbackCommittedImports(page: Page, filename: string) {
  for (;;) {
    await page.goto('/import');
    // Batch history is a query, and `count()` is the one locator call that does
    // not wait for it. Probing straight after the navigation therefore read an
    // empty list off a loading skeleton and reported a clean slate, so the
    // committed Sarah survived this cleanup and every later spec then found two
    // of her: no favors on the one the People list happened to open first, and
    // a one hop path where warm intros expected a chain. Wait for the history
    // to say what it holds before believing it holds nothing.
    const history = page.getByRole('region', { name: /^Batch history/ });
    await expect(
      history
        .getByRole('list', { name: 'Import batches' })
        .or(history.getByText('No imports yet')),
    ).toBeVisible({ timeout: 15_000 });

    const row = history.locator('.imp__row', { hasText: filename }).filter({
      has: page.getByRole('button', { name: /Roll back/ }),
    }).first();
    if (await row.count() === 0) return;
    await row.getByRole('button', { name: /Roll back/ }).click();
    await expect(page.getByText('records removed', { exact: false })).toBeVisible({ timeout: 10_000 });
  }
}

test('Duplicates: import a duplicate, merge it, undo the merge', async ({ page }) => {
  await signIn(page);
  // A failed assertion must not poison later runs with another Sarah import.
  await rollbackCommittedImports(page, 'dup.vcf');

  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('vCard (.vcf) or CSV address book').click(),
    ]);
    await chooser.setFiles({ name: 'dup.vcf', mimeType: 'text/vcard', buffer: Buffer.from(DUP_VCF) });

    // The row is flagged as a probable duplicate and defaults to skip, accept it.
    await expect(page.getByText('probable dup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.imp__toggle').first().click();
    await page.getByRole('button', { name: /^Commit 1 row$/ }).click();
    await expect(page.getByText('Committed 1 records', { exact: false })).toBeVisible({ timeout: 10_000 });

    // The scanner now surfaces the cluster, with the signals that matched it
    // named rather than scored, the audit is meant to be explainable.
    await page.goto('/import/duplicates');
    const sarah = page.getByRole('article').filter({ hasText: 'Sarah Chen' }).first();
    await expect(sarah.getByText('Same email')).toBeVisible({ timeout: 20_000 });

    // Identity audit is a five-step wizard: Identity → Survivor → Fields →
    // Relations → Confirm. Each step defaults to a sane choice, so walking it
    // with Continue exercises the whole path without asserting on the defaults.
    await sarah.getByRole('button', { name: /Audit cluster:.*Sarah Chen/ }).click();
    for (const step of ['Identity', 'Survivor', 'Fields', 'Relations']) {
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Continue' }).click();
      void step;
    }
    await page.getByRole('button', { name: /^Merge \d+ records?$/ }).click();
    await expect(page.getByText('Identity consolidated', { exact: false })).toBeVisible({ timeout: 15_000 });

    // Undo from merge history restores the records.
    await page.getByRole('button', { name: /Undo merge of.*Sarah Chen/ }).first().click();
    await expect(page.getByText('Merge undone', { exact: false })).toBeVisible({ timeout: 15_000 });
  } finally {
    await rollbackCommittedImports(page, 'dup.vcf');
  }
});
