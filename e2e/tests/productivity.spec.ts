import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';

/**
 * J9 — Work the productivity matrix.
 * Productivity journey. Both flags must be on in the running API and web build:
 *
 *   VITAE_PRODUCTIVITY_ENABLED=true
 *   VITE_PUBLIC_PRODUCTIVITY_ENABLED=true
 *
 * Then start API + web (`pnpm dev`) and run:
 *
 *   pnpm --filter @vitae/e2e exec playwright test productivity
 *
 * Vite bakes `VITE_PUBLIC_*` at bundle time, so a web server started without
 * the public flag will keep showing "Not available" even if this process has
 * the env vars. The test skips in that case rather than failing the suite.
 *
 * Demo vs real: `signIn` uses the real space. The productivity client sends
 * `x-vitae-space` from `getSpace()`, so a demo session stays on the demo graph.
 */
function flagsOn(): boolean {
  const on = (value: string | undefined) => /^(true|1|yes)$/i.test((value ?? '').trim());
  return on(process.env.VITAE_PRODUCTIVITY_ENABLED) && on(process.env.VITE_PUBLIC_PRODUCTIVITY_ENABLED);
}

test.describe('productivity matrix', () => {
  // Default-off kill switch: J9 must not fail the e2e gate while flags stay false.
  // eslint-disable-next-line playwright/no-skipped-test -- flags-off skip is the documented default
  test.skip(!flagsOn(), 'Requires VITAE_PRODUCTIVITY_ENABLED and VITE_PUBLIC_PRODUCTIVITY_ENABLED');

  test('create appears in a quadrant, complete survives reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/today/tasks');

    // Vite bakes the public flag at build time; process env alone is not enough.
    // eslint-disable-next-line playwright/no-conditional-in-test -- skip when the running web build still has the flag off
    if (await page.getByText('Not available').isVisible()) {
      // eslint-disable-next-line playwright/no-skipped-test -- skip when the running web build still has the flag off
      test.skip(true, 'Running web build has VITE_PUBLIC_PRODUCTIVITY_ENABLED off');
    }

    const title = `E2E matrix ${Date.now()}`;
    await page.getByLabel('Capture a task').fill(title);
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole('button', { name: 'Matrix' }).click();
    const card = page.getByText(title);
    await expect(card).toBeVisible();
    await expect(page.getByRole('region', { name: /^(Do|Schedule|Delegate|Eliminate)$/ }).filter({ hasText: title })).toBeVisible();

    await page
      .getByRole('region', { name: /^(Do|Schedule|Delegate|Eliminate)$/ })
      .filter({ hasText: title })
      .getByRole('button', { name: 'Complete' })
      .click();
    await expect(page.locator('li').filter({ hasText: title })).toContainText('Done');

    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.locator('li').filter({ hasText: title })).toContainText('Done');
  });
});
