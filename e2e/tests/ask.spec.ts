import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 12: Ask ("who should I call?").
 *
 * Every rank is explained in readable, complete factor breakdowns (numbers and
 * labels, not colour alone). Most of this spec guards that explanation.
 */

const ASK = '**/api/v1/ask/people';
const RANKED = /^Ranked/;

/** Run an ask through the URL, which is the same path a recall chip takes. */
async function askFor(page: Page, query: string) {
  await page.goto(`/ask/people?${query}`);
}

function ranked(page: Page) {
  return page.getByRole('region', { name: RANKED });
}

test('nothing asked yet is a different screen from nobody found', async ({ page }) => {
  await signIn(page);
  await page.goto('/ask/people');

  await expect(page.getByText('Nothing asked yet')).toBeVisible();
  await expect(ranked(page)).toHaveCount(0);

  // A bare visit must not fire a rank for the default the form happens to show.
  let calls = 0;
  await page.route(ASK, (route) => {
    calls += 1;
    return route.continue();
  });
  await page.waitForTimeout(500);
  expect(calls).toBe(0);

  // An empty graph is the only way the ranker returns nobody, so the branch is
  // reached the honest way: by making the server say so.
  await page.unroute(ASK);
  await page.route(ASK, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' }),
  );
  await askFor(page, 'need=referral&topics=ml&run=1');
  await expect(page.getByText('No one to call')).toBeVisible();
  await expect(page.getByText('Nothing asked yet')).toHaveCount(0);
});

test('an ask that nothing matched says so, however well you know the leader', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=zzzznothingatall&org=zzzznowhere&run=1');

  // The ranker always returns its top ten, so "nobody fits" is never an empty
  // list, it is a full list ranked on something other than the question. The
  // old banner tested `score < 1.2` and stayed silent here, because the closest
  // contact scores 1.47 on tie strength alone.
  // Scoped to the ranked region: the screen carries other live regions now,
  // one for the recall shortcuts and one for a re-rank in flight.
  const banner = ranked(page).getByRole('status');
  await expect(banner).toContainText('No contact matched the intent');
  await expect(ranked(page).locator('article').first()).toBeVisible();

  // …and it goes away the moment a factor actually answers the ask.
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');
  await expect(ranked(page).locator('article').first()).toBeVisible();
  await expect(page.getByText('No contact matched the intent')).toHaveCount(0);
});

test('every rank is explained by name and number, not by colour', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');

  const rows = ranked(page).locator('article');
  await expect(rows.first()).toBeVisible();

  // The decomposition carries its own numbers, so the bar is never the only
  // thing saying what a score is made of.
  const bar = page.getByRole('img', { name: /^Score \d/ }).first();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAccessibleName(/strength \d\.\d\d/);

  // One ink for every segment, the old bar used a different hue per factor.
  const inks = await rows
    .first()
    .locator('.vt-factorbar__seg')
    .evaluateAll((els) => new Set(els.map((e) => getComputedStyle(e).backgroundColor)).size);
  expect(inks).toBe(1);

  // Every contributing factor gets a chip; the old card sliced to five.
  const segs = await rows.first().locator('.vt-factorbar__seg').count();
  const chips = await rows.first().locator('.vt-chip').count();
  expect(chips).toBe(segs);
});

test('the ask lives in the URL, linkable, reloadable, and back-able', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');
  await expect(ranked(page).locator('article').first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Topics' })).toHaveValue('reinforcement learning');

  await page.reload();
  await expect(ranked(page).locator('article').first()).toBeVisible();

  // Asking again from the form rewrites the URL rather than hiding the intent
  // in component state.
  await page.getByRole('textbox', { name: 'Organization' }).fill('Nile');
  await page.getByRole('button', { name: /^Ask$/ }).click();
  await expect(page).toHaveURL(/org=Nile/);
});

test('a failed rank says so instead of reporting that nobody fits', async ({ page }) => {
  await signIn(page);
  await page.route(ASK, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the ranker is unavailable"}}',
    }),
  );
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t rank anyone');
  await expect(alert).toContainText('the ranker is unavailable');
  await expect(page.getByText('No one to call')).toHaveCount(0);
});

test('a failed history costs the shortcuts, not the ability to ask', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/ask/history', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"down","message":"history unavailable"}}',
    }),
  );
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');

  // Was gated only on `data?.asks?.length`, so a failure and "no history yet"
  // were the same silent nothing.
  await expect(page.getByRole('alert')).toContainText('Recent asks could not be loaded');
  await expect(ranked(page).locator('article').first()).toBeVisible();
});

test('a card opens on request and offers three distinct next moves', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');

  const first = ranked(page).locator('article').first();
  const head = first.getByRole('button', { name: /rank 1$/ });
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');

  // "Log outreach" used to be a second link to the profile wearing a verb it
  // did not perform. It opens the logger.
  await expect(first.getByRole('button', { name: 'Draft the ask' })).toBeVisible();
  await expect(first.getByRole('link', { name: 'Open profile' })).toHaveAttribute('href', /\/people\//);
  await first.getByRole('button', { name: 'Log outreach' }).click();
  await expect(page.getByRole('dialog')).toContainText('Log interaction');
});

test('a failed draft says so instead of leaving an empty box above a live Send', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');
  await ranked(page).locator('article').first().getByRole('button', { name: /rank 1$/ }).click();

  await page.route('**/api/v1/composer/draft', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"no facts to draft from"}}',
    }),
  );
  await page.getByRole('button', { name: 'Draft the ask' }).click();

  // generate() was a try/finally with no catch: the rejection went nowhere.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t draft that message');
  await expect(dialog.getByRole('button', { name: 'Send & log' })).toBeDisabled();
});

test('the tone switch carries its state in more than a border colour', async ({ page }) => {
  await signIn(page);
  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');
  await ranked(page).locator('article').first().getByRole('button', { name: /rank 1$/ }).click();
  await page.getByRole('button', { name: 'Draft the ask' }).click();

  const tones = page.getByRole('group', { name: 'Tone' });
  await expect(tones.getByRole('button', { name: 'warm' })).toHaveAttribute('aria-pressed', 'true');
  await tones.getByRole('button', { name: 'formal' }).click();
  await expect(tones.getByRole('button', { name: 'formal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tones.getByRole('button', { name: 'warm' })).toHaveAttribute('aria-pressed', 'false');
});

test('no automated a11y violations, asked or not', async ({ page }) => {
  await signIn(page);
  await page.goto('/ask/people');
  await expect(page.getByText('Nothing asked yet')).toBeVisible();
  await expectNoA11yViolations(page);

  await askFor(page, 'need=referral&topics=reinforcement+learning&run=1');
  await ranked(page).locator('article').first().getByRole('button', { name: /rank 1$/ }).click();
  await expectNoA11yViolations(page);
});
