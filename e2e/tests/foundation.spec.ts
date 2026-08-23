import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Foundation screen: the skip link and the first automated a11y coverage in
 * the repo. Not retrofitted into the other 12 specs, that's each screen's
 * job as it's touched (rebrand-implementation-prompt.md).
 */

test('skip link is the first tab stop and jumps focus to main content', async ({ page }) => {
  await signIn(page);
  // Fresh navigation for a clean, known focus state before the first Tab.
  await page.goto('/today');

  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  // Auth restoration is asynchronous after a full reload. Wait until the shell
  // has actually inserted its first focusable element before testing tab order.
  await skipLink.waitFor({ state: 'attached' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('no automated a11y violations on the sign-in page', async ({ page }) => {
  await page.goto('/signin');
  await expectNoA11yViolations(page);
});

test('no automated a11y violations on the authenticated dashboard', async ({ page }) => {
  await signIn(page);
  await expectNoA11yViolations(page);
});
