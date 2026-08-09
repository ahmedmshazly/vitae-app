import { expect, type Page } from '@playwright/test';

export interface SignInOptions {
  /** Data space to enter before signing in; 'demo' targets the seeded demo graph. */
  space?: 'real' | 'demo';
}

/**
 * Developer sign-in shared by every spec. Skips the first-run welcome modal,
 * waits out the auth-loading spinner before clicking, and confirms Today's
 * register rule, the one element that only renders once the dashboard query
 * has resolved, so it can't pass against a half-loaded page. The old signal
 * was the subtitle string "Your day at a glance", which Screen 2 deleted.
 */
export async function signIn(page: Page, opts: SignInOptions = {}) {
  await page.goto('/signin');
  await page.evaluate((space) => {
    localStorage.setItem('vitae.v1.welcomed', '1');
    if (space === 'demo') localStorage.setItem('vitae.space', 'demo');
  }, opts.space ?? 'real');
  const devButton = page.getByRole('button', { name: /developer sign-in/i });
  await devButton.waitFor({ state: 'visible', timeout: 10_000 });
  await devButton.click();
  await expect(page.getByRole('img', { name: /^Days of this week/ })).toBeVisible({
    timeout: 10_000,
  });
}

/** Sign in inside the demo space (rich seeded data) and confirm the banner took effect. */
export async function signInDemo(page: Page) {
  await signIn(page, { space: 'demo' });
  await expect(page.getByText(/demo space/i)).toBeVisible();
}
