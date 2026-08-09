import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 1: App shell: rail, top bar, breadcrumb, space switcher, mobile
 * dock. The rail has three layout states (full, manually collapsed, and the
 * 641-1023px tablet band that auto-collapses regardless of the manual
 * preference) plus a bottom dock below 640px, each gets its own real-browser
 * check because none of it is expressible as a Vitest/jsdom unit test.
 */

test('rail collapses and expands via the toggle', async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();
  // Exact-name link, not the same-labelled "People" group header button.
  const peopleLink = rail.getByRole('link', { name: 'People', exact: true });
  await expect(peopleLink).toBeVisible();

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  // Icon-tile mode flattens groups entirely, the link survives with an
  // accessible name (title fallback), just no visible label.
  await expect(peopleLink).toBeVisible();
  await expect(rail.getByRole('button', { name: /^People/ })).toBeHidden();

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^People/ })).toBeVisible();
});

test('rail auto-collapses to icons in the 641-1023px tablet band', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();

  // Forced by viewport, not the manual preference, the redundant toggle is hidden.
  await expect(rail.getByRole('button', { name: /^People/ })).toBeHidden();
  await expect(rail.getByRole('link', { name: 'People', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /collapse sidebar|expand sidebar/i })).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(rail.getByRole('button', { name: /^People/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('People and Library groups collapse independently and remember state', async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();
  const peopleHead = rail.getByRole('button', { name: /^People/ });
  const libraryHead = rail.getByRole('button', { name: /^Library/ });

  // People starts open (small group), Library starts closed (7 items).
  await expect(peopleHead).toHaveAttribute('aria-expanded', 'true');
  await expect(libraryHead).toHaveAttribute('aria-expanded', 'false');
  await expect(rail.getByRole('link', { name: 'Collections', exact: true })).toBeHidden();

  await libraryHead.click();
  await expect(libraryHead).toHaveAttribute('aria-expanded', 'true');
  await expect(rail.getByRole('link', { name: 'Collections', exact: true })).toBeVisible();

  await peopleHead.click();
  await expect(peopleHead).toHaveAttribute('aria-expanded', 'false');
  // Collapsing People must not touch Library's independent state.
  await expect(libraryHead).toHaveAttribute('aria-expanded', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: /^People/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /^Library/ })).toHaveAttribute('aria-expanded', 'true');
});

test('navigating into a closed group reopens it', async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();

  // Library defaults closed; arriving at one of its destinations reveals it.
  await expect(rail.getByRole('button', { name: /^Library/ })).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/timeline');
  await expect(page.getByRole('button', { name: /^Library/ })).toHaveAttribute('aria-expanded', 'true');

  // Sub-routes count too. Collapsing has to happen from a neutral route.
  // /people is itself a People destination, so collapsing there would be
  // undone by this very effect before the profile is ever opened.
  const profileHref = await page.goto('/people').then(async () => {
    const href = await page.locator('.people__link').first().getAttribute('href');
    if (!href) throw new Error('seed has no person to open');
    return href;
  });

  await page.goto('/');
  const peopleHead = page.getByRole('button', { name: /^People/ });
  await peopleHead.click();
  await expect(peopleHead).toHaveAttribute('aria-expanded', 'false');

  await page.goto(profileHref);
  await expect(page.getByRole('button', { name: /^People/ })).toHaveAttribute('aria-expanded', 'true');
});

test('top bar collapses to reachable icon-only actions below 640px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  // The rail is gone; every action it would otherwise carry stays reachable
  // from the top bar, each with a real accessible name (not just visible text
  // that a mobile stylesheet hides, that would silently orphan the name too).
  const search = page.getByRole('button', { name: 'Search or jump (⌘P)' });
  const capture = page.getByRole('button', { name: 'Quick capture' });
  const reminders = page.getByRole('button', { name: /reminders/i });
  const signOut = page.getByRole('button', { name: 'Sign out' });
  for (const el of [search, capture, reminders, signOut]) await expect(el).toBeVisible();

  await search.click();
  await expect(page.getByLabel('Command or record search')).toBeVisible();
  await page.keyboard.press('Escape');

  // Scoped to the dock and exact: Today's queue rows are links whose names end
  // in "due today", which a loose name match sweeps up.
  const dock = page.getByRole('navigation', { name: 'Primary' }).last();
  await expect(dock).toBeVisible();
  await expect(dock.getByRole('link', { name: 'Today', exact: true })).toBeVisible();

  await expectNoA11yViolations(page);
});

test('demo-space toggle carries an accessible name in every state', async ({ page }) => {
  await signIn(page);
  const toggle = page.getByRole('button', { name: 'View demo' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByText(/demo space/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /demo data/i })).toBeVisible();
});
