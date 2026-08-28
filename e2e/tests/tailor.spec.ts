import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 18: Tailor.
 *
 * This is where a résumé is actually made, and the one thing it must never do
 * is lose your work quietly. Its autosave was `api.patch(...).catch(() => {})`:
 * every failure discarded, while the rail went on reading "draft saved" from
 * whatever the server last accepted.
 */

const TARGETS = '**/api/v1/targets';
const ATOMS = '**/api/v1/atoms';
const DRAFT = '**/api/v1/targets/*/draft';
const TAILOR = '**/api/v1/resumes/tailor';

async function goTailor(page: Page) {
  await page.goto('/resume/tailor');
  await expect(page.getByRole('heading', { name: 'Tailor a résumé' })).toBeVisible({ timeout: 10_000 });
}

async function pickTarget(page: Page) {
  await page.getByText('Senior ML Engineer').first().click();
  await expect(page.getByText('Live document')).toBeVisible();
}

test('a failed autosave says so instead of discarding the failure', async ({ page }) => {
  await signIn(page);
  await goTailor(page);
  await pickTarget(page);

  await page.route(DRAFT, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"draft store unavailable"}}',
    }),
  );

  // Change something the draft owns; the debounced save fires 800ms later.
  await page.getByPlaceholder(/Headline/i).fill('Staff ML Engineer');

  // The promise this screen's own help text makes is "everything you change is
  // autosaved to this target, reload and carry on". When that stops being
  // true, the screen has to say so rather than keep showing "draft saved".
  await expect(page.getByRole('alert')).toContainText('Not saving', { timeout: 10_000 });
  await expect(page.getByRole('alert')).toContainText('only in this tab');
});

test('a successful autosave reports itself', async ({ page }) => {
  await signIn(page);
  await goTailor(page);
  await pickTarget(page);

  await page.getByPlaceholder(/Headline/i).fill(`E2E headline ${Date.now()}`);
  await expect(page.getByText('draft saved').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed target list says so rather than showing an empty workspace', async ({ page }) => {
  await signIn(page);
  await page.route(TARGETS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"target store unreachable"}}',
    }),
  );
  await goTailor(page);

  // `isError` was never destructured from either query, so a failed load left
  // empty panes reading "you have nothing" rather than "this did not load".
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't load your job targets");
  await expect(alert).toContainText('target store unreachable');
});

test('a failed atom list is reported too, not just the targets', async ({ page }) => {
  await signIn(page);
  await page.route(ATOMS, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"atom store unreachable"}}',
    }),
  );
  await goTailor(page);

  await expect(page.getByRole('alert')).toContainText("Couldn't load your atoms");
});

test('the score breakdown still proves its own arithmetic', async ({ page }) => {
  await signIn(page);
  await goTailor(page);
  await pickTarget(page);

  // Scores only exist once the atoms have been run against the JD.
  await page.getByRole('button', { name: 'Auto-select atoms' }).click();

  // The most explainable component in the app, and the rebuild must not cost
  // it: it prints the equation and a check line proving the product is the
  // score, rather than asking to be believed.
  const trigger = page.getByRole('button', { name: /^Score \d/ }).first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const pop = page.getByRole('dialog');
  await expect(pop).toContainText('relevance × recency × metrics = score');
  await expect(pop).toContainText(/\d\.\d\d × \d\.\d\d × \d\.\d\d = \d\.\d\d/);
});

test('tailor has no automated a11y violations, before and after picking a target', async ({ page }) => {
  await signIn(page);
  await goTailor(page);
  await expectNoA11yViolations(page);

  await pickTarget(page);
  await expectNoA11yViolations(page);
});

test('a failed re-score says so, and does not claim your work is unsaved', async ({ page }) => {
  await signIn(page);
  await page.route(TAILOR, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"scorer unavailable"}}',
    }),
  );
  await goTailor(page);
  await pickTarget(page);

  // Was `.catch(() => {})`: the previous target's numbers stayed on screen,
  // attached to this target's atoms.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't score your atoms", { timeout: 10_000 });

  // Scoring and saving fail for different reasons, a scoring failure must not
  // tell you your draft is not being saved.
  await expect(alert).not.toContainText('Not saving');
});
