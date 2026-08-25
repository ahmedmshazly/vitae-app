import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 3: the front door. Which ways in appear depends on build-time flags
 * a browser cannot flip, so those branches live in SignIn.test.tsx; this spec
 * covers what only a real browser can show: the layout at both breakpoints,
 * the splash before auth resolves, a real failed sign-in, and keyboard order.
 */

const ME = '**/api/v1/auth/me';
const DEV_LOGIN = '**/api/v1/auth/dev-login';

test('the front door is flat, no wash, no glass, no looping motion', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('button', { name: /developer sign-in/i }).waitFor();

  // The card this replaces sat on two blurred radial gradients drifting on
  // infinite loops, behind a backdrop-filter. All three are standing bans.
  const painted = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('main, main *')) {
      const cs = getComputedStyle(el);
      for (const pseudo of [null, '::before', '::after']) {
        const s = pseudo ? getComputedStyle(el, pseudo) : cs;
        if (s.backgroundImage.includes('gradient')) offenders.push(`gradient on ${el.tagName}${pseudo ?? ''}`);
        if (s.backdropFilter && s.backdropFilter !== 'none') offenders.push(`backdrop-filter on ${el.tagName}${pseudo ?? ''}`);
        if (s.animationIterationCount === 'infinite') offenders.push(`looping animation on ${el.tagName}${pseudo ?? ''}`);
        if (s.filter.includes('blur')) offenders.push(`blur on ${el.tagName}${pseudo ?? ''}`);
      }
    }
    return offenders;
  });
  expect(painted).toEqual([]);
});

test('splits into two columns at desktop and stacks below 1024px', async ({ page }) => {
  // Both rects come from one evaluate: auth resolving re-renders the tree, and
  // two separate boundingBox() calls can straddle that and return null.
  const columns = () =>
    page.evaluate(() => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        identity: rect('main > section'),
        door: rect('main > div'),
        scrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/signin');
  await page.getByRole('button', { name: /developer sign-in/i }).waitFor();

  const wide = await columns();
  // Side by side: the door starts where the identity column ends.
  expect(wide.door!.x).toBeGreaterThanOrEqual(wide.identity!.x + wide.identity!.width);
  expect(wide.scrollsSideways).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await columns();
  // Stacked: the door sits below the identity, both at the same left edge.
  expect(narrow.door!.y).toBeGreaterThanOrEqual(narrow.identity!.y + narrow.identity!.height);
  expect(narrow.door!.x).toBe(narrow.identity!.x);
  expect(narrow.scrollsSideways).toBe(false);
});

test('the register rule carries no ticks, nothing here is true to encode', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await expect(page.locator('.vt-register')).toHaveCount(1);
  await expect(page.locator('.vt-register__tick')).toHaveCount(0);
  // A tick-less rule is decoration to a screen reader, so it stays out of the tree.
  await expect(page.locator('.vt-register')).toHaveAttribute('aria-hidden', 'true');
});

test('the auth splash is the door with its controls skeletonised', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(ME, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/signin');
  // Identity is already painted while the session is still being resolved.
  await expect(page.getByRole('status', { name: 'Checking your session' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);

  release();
  await expect(page.getByRole('button', { name: /developer sign-in/i })).toBeVisible();
});

test('a failed sign-in names the failure and leaves both ways in usable', async ({ page }) => {
  await page.goto('/signin');
  const dev = page.getByRole('button', { name: /developer sign-in/i });
  await dev.waitFor();

  await page.route(DEV_LOGIN, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"unavailable","message":"The session service is unavailable."}}',
    }),
  );
  await dev.click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Sign-in failed.');
  await expect(alert).toContainText('The session service is unavailable.');
  // Not a trap: a failed attempt must not leave the only way in disabled.
  await expect(dev).toBeEnabled();

  await page.unroute(DEV_LOGIN);
  await dev.click();
  // A successful sign-in lands on Today. The bare root only redirects there.
  await expect(page).toHaveURL(/\/today$/);
});

test('is operable from the keyboard, in visual order, with a visible ring', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('button', { name: /developer sign-in/i }).waitFor();

  // Google sign-in cannot appear in the artifact this gate builds. lib/firebase.ts
  // offers it only when the Auth emulator is wired, and that requires
  // import.meta.env.DEV, which is false in anything Vite builds for production.
  // The comment there is explicit that no environment variable can switch it on
  // in a shipped SPA, so the door has one way in and the order starts there.
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);

  const order: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
  }
  expect(order[0]).toContain('Developer sign-in');
  expect(order[1]).toContain('Take the tour');
  expect(order[2]).toContain('What is Vitae?');

  const dev = page.getByRole('button', { name: /developer sign-in/i });
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(dev).toBeFocused();
  await expect(dev).not.toHaveCSS('box-shadow', 'none');

  await expectNoA11yViolations(page);
});
