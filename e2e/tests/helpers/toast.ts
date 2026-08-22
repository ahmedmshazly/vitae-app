import type { Locator, Page } from '@playwright/test';

/**
 * Toasts stack. A spec that resets its own fixture, or one that acts twice,
 * leaves two or three on screen at once, so `.toast` on its own is ambiguous
 * and `getByRole('status')` catches every one of their live rows. Ask for the
 * toast that says the thing instead.
 *
 * Anchor the pattern when one word contains another: `Unchecked` contains
 * `Checked`, and `Unpinned` contains `Pinned`.
 */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('.toast').filter({ hasText: text });
}
