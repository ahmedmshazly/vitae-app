import { expect, type Page } from '@playwright/test';
import { devToken } from './api';

export interface SignInOptions {
  /** Data space to enter before signing in; 'demo' targets the seeded demo graph. */
  space?: 'real' | 'demo';
}

/**
 * Developer sign-in shared by every spec.
 *
 * This does not drive the sign-in screen. Driving it is `signin.spec.ts`'s
 * subject, and re-proving it before each of the other 240 signed-in tests bought
 * nothing: it loaded `/signin`, waited up to ten seconds for the developer
 * button to render, clicked it, waited for the redirect, and only then arrived
 * where the test wanted to be. The session is minted straight from
 * `/auth/dev-login` instead, which sets the same httpOnly cookie in the same
 * browser context, and the page goes directly to Today.
 *
 * The two localStorage keys are seeded through `addInitScript` so they are
 * present before the shell mounts, rather than written to one page and hoped
 * for on the next.
 *
 * The readiness signal is unchanged: Today's register rule, the one element
 * that only renders once the dashboard query has resolved, so this cannot pass
 * against a half-loaded page.
 */
export async function signIn(page: Page, opts: SignInOptions = {}) {
  const space = opts.space ?? 'real';
  await page.addInitScript((chosen) => {
    localStorage.setItem('vitae.v1.welcomed', '1');
    // Seed the space, do not enforce it. An init script runs before *every*
    // navigation, so writing unconditionally re-imposed the starting space on
    // each `goto` and silently undid an in-session toggle: demo-mode switched
    // to demo, navigated, and arrived back in the real graph.
    if (localStorage.getItem('vitae.space') === null) {
      localStorage.setItem('vitae.space', chosen);
    }
  }, space);
  await devToken(page);
  await page.goto('/today');
  await expect(page.getByRole('img', { name: /^Days of this week/ })).toBeVisible({
    timeout: 10_000,
  });
}

/** Sign in inside the demo space (rich seeded data) and confirm the banner took effect. */
export async function signInDemo(page: Page) {
  await signIn(page, { space: 'demo' });
  await expect(page.getByText(/demo space/i)).toBeVisible();
}
