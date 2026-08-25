import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';
import { chooseOption, chosenOption } from './helpers/controls';
import { expectNoA11yViolations } from './helpers/a11y';

/** The wording that is not the one showing, so saving is a real change. */
function theOtherWording(current: string | null): 'Leadership' | 'Technical' {
  return current === 'Leadership' ? 'Technical' : 'Leadership';
}

const OVERVIEW = '**/api/v1/resumes/overview';

/**
 * Résumé hub overview KPIs + settings resume defaults + mobile dock.
 */
test('resume hub shows live overview KPIs and links into the workflow', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume');

  await expect(page.getByRole('heading', { name: 'Résumé' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Atoms', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Targets', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Outputs', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Workflow')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Tailor/i })).toBeVisible();

  await page.getByRole('button', { name: /New résumé/i }).click();
  await expect(page).toHaveURL(/\/resume\/tailor/);
});

test('settings exposes résumé defaults for template, accent, and wording', async ({ page }) => {
  await signInDemo(page);
  // Résumé defaults live in the Preferences panel; /settings is its index.
  await page.goto('/settings/preferences');

  await expect(page.getByRole('heading', { name: 'Résumé defaults' })).toBeVisible({
    timeout: 10_000,
  });
  const next = theOtherWording(await chosenOption(page, 'Default wording'));
  await chooseOption(page, 'Default wording', next);
  await page.locator('button[aria-label^="Use "][aria-pressed="false"]').first().click();
  await page.getByRole('button', { name: /Save résumé defaults/i }).click();
  await expect(page.getByRole('combobox', { name: 'Default wording' })).toContainText(next);
});

test('the résumé workspace stays reachable on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInDemo(page);
  await page.goto('/today');

  // The dock carries the six workspaces, not every screen under them. Résumé
  // is Career's, so the route to it is the route the IA describes.
  const dock = page.getByRole('navigation', { name: 'Primary' });
  await expect(dock).toBeVisible({ timeout: 10_000 });
  await dock.getByRole('link', { name: 'Career' }).click();
  await expect(page).toHaveURL(/\/career\/?$/);

  const workspace = page.getByRole('navigation', { name: 'Career workspace' });
  await workspace.getByRole('link', { name: 'Résumé', exact: true }).click();
  await expect(page).toHaveURL(/\/career\/resume\/?$/);
  await workspace.getByRole('link', { name: 'Outputs', exact: true }).click();
  await expect(page).toHaveURL(/\/career\/resume\/outputs/);
});

test('a failed overview says so instead of reporting an empty workspace', async ({ page }) => {
  await signInDemo(page);
  await page.route(OVERVIEW, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the résumé store is unreachable"}}',
    }),
  );
  await page.goto('/resume');

  // Without reading `isError`, a failure rendered every counter as a confident
  // 0, set "Base résumé", and told you to finalize your first résumé: the
  // screen inventing an empty workspace and asking you to rebuild it.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t read your résumé workspace');
  await expect(alert).toContainText('the résumé store is unreachable');
  await expect(page.getByText('No outputs yet')).toHaveCount(0);
  await expect(page.getByText('Finalize a résumé to set the first base')).toHaveCount(0);

  // The failure costs you the numbers, not the way into the work.
  await expect(page.getByRole('link', { name: /Open Tailor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /New résumé/i })).toBeVisible();
});

test('a pending count is never rendered as zero', async ({ page }) => {
  await signInDemo(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(OVERVIEW, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/resume');

  const atoms = page.locator('.resume-kpi').first();
  await expect(atoms).toBeVisible();
  // A pending count used to render 0, which is indistinguishable from a
  // workspace that is genuinely empty.
  await expect(atoms.locator('.vt-skel')).toHaveCount(2);
  await expect(atoms).not.toContainText(/\b\d+\b/);

  release();
  await expect(atoms).toContainText(/\d/);
});

test('the workflow reads as the numbered sequence it is', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume');

  // Five steps in a two-column grid left step 5 alone beside a hole, and each
  // step carried its number inside its own label ("1 · Tailor").
  const steps = page.getByRole('region', { name: /^Workflow/ }).getByRole('listitem');
  await expect(steps).toHaveCount(5);
  await expect(steps.first()).toContainText('Tailor');
  await expect(steps.last()).toContainText('Templates');
});

test('the résumé hub has no automated a11y violations', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume');
  await expect(page.getByRole('heading', { name: 'Résumé' })).toBeVisible({ timeout: 10_000 });
  await expectNoA11yViolations(page);
});
