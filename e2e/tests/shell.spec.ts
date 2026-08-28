import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Application shell: stable workspace rail, contextual workspace strip, and
 * the mobile dock. The rail has a full desktop state, a manually compacted
 * state, and an automatic compact state in the 701-1080px tablet band. Below
 * 700px its destinations move into the dock and the accessible More sheet.
 */

const hubs = [
  { label: 'Today', description: 'Agenda and daily momentum', href: '/today' },
  { label: 'Network', description: 'Relationships and reach', href: '/network' },
  { label: 'Career', description: 'Applications and documents', href: '/career' },
  { label: 'Explore', description: 'Graph, time, and place', href: '/explore' },
  { label: 'Data', description: 'Imports, integrity, and ownership', href: '/data' },
  { label: 'Settings', description: 'Identity and system controls', href: '/settings' },
] as const;

test('desktop rail keeps every workspace reachable when compacted', async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();

  for (const hub of hubs) {
    const link = rail.getByRole('link', { name: new RegExp(`^${hub.label}\\b`) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', hub.href);
    await expect(rail.getByText(hub.description, { exact: true })).toBeVisible();
  }
  await expect(rail.getByRole('link', { name: /^Today\b/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();

  // Compact links deliberately use aria-labels: their visible descriptions
  // disappear, while all six destinations retain concise accessible names.
  for (const hub of hubs) {
    const link = rail.getByRole('link', { name: hub.label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', hub.href);
    await expect(rail.getByText(hub.description, { exact: true })).toBeHidden();
  }
  await expect(rail.getByRole('button', { name: 'Search or jump (⌘P)' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Capture to graph' })).toBeVisible();

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  await expect(rail.getByText('Relationships and reach', { exact: true })).toBeVisible();
});

test('rail automatically compacts in the 701-1080px tablet band', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();

  // This state is forced by the viewport rather than the stored preference,
  // so exposing a redundant collapse control would be misleading.
  await expect(rail.getByRole('link', { name: 'Network', exact: true })).toBeVisible();
  await expect(rail.getByText('Relationships and reach', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /collapse sidebar|expand sidebar/i })).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(rail.getByText('Relationships and reach', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('hub navigation swaps the contextual strip and uses canonical routes', async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Primary' }).first();

  await rail.getByRole('link', { name: /^Network\b/ }).click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(rail.getByRole('link', { name: /^Network\b/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const network = page.getByRole('navigation', { name: 'Network workspace' });
  await expect(network.getByRole('link', { name: 'Network', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(network.getByRole('link', { name: 'People', exact: true })).toHaveAttribute(
    'href',
    '/network/people',
  );
  await expect(network.getByRole('link', { name: 'Orgs', exact: true })).toHaveAttribute(
    'href',
    '/network/organizations',
  );
  await expect(network.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute(
    'href',
    '/network/intelligence?lens=contact',
  );
  await expect(network.getByRole('link', { name: 'Reach', exact: true })).toHaveAttribute(
    'href',
    '/network/intelligence?lens=reach',
  );

  await network.getByRole('link', { name: 'Orgs', exact: true }).click();
  await expect(page).toHaveURL(/\/network\/organizations$/);
  await expect(network.getByRole('link', { name: 'Orgs', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(rail.getByRole('link', { name: /^Network\b/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await rail.getByRole('link', { name: /^Explore\b/ }).click();
  await expect(page).toHaveURL(/\/explore$/);
  const explore = page.getByRole('navigation', { name: 'Explore workspace' });
  await expect(explore.getByRole('link', { name: 'Life map', exact: true })).toHaveAttribute(
    'href',
    '/explore/graph',
  );
  await explore.getByRole('link', { name: 'Life map', exact: true }).click();
  await expect(page).toHaveURL(/\/explore\/graph$/);
  // In a cold Vite session the graph visualization chunk can still be
  // compiling after history has advanced. Assert the destination screen
  // before reading the shell state so this checks committed navigation, not
  // the intentionally retained previous Suspense frame.
  await expect(page.getByRole('heading', { name: 'Life map', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(explore.getByRole('link', { name: 'Life map', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a canonical deep link retains its hub and local navigation context', async ({ page }) => {
  await signIn(page);
  await page.goto('/career/resume/evidence');

  const rail = page.getByRole('navigation', { name: 'Primary' }).first();
  const career = page.getByRole('navigation', { name: 'Career workspace' });
  await expect(rail.getByRole('link', { name: /^Career\b/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(career.getByRole('link', { name: 'Evidence', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(career.getByRole('link', { name: 'Applications', exact: true })).toHaveAttribute(
    'href',
    '/career/applications',
  );
  await expect(career.getByRole('link', { name: 'Résumé', exact: true })).toHaveAttribute(
    'href',
    '/career/resume',
  );
  await expect(page.locator('[aria-live="polite"][aria-atomic="true"]')).toContainText(
    'Résumé, Evidence',
  );
});

test('mobile dock, capture, search, and More sheet keep every workspace reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.locator('nav.rail')).toBeHidden();

  const search = page.getByRole('button', { name: 'Search records or run a command' });
  const capture = page.getByRole('button', { name: 'Quick capture' });
  const reminders = page.getByRole('button', { name: /reminders/i });
  const signOut = page.getByRole('button', { name: 'Sign out' });
  for (const action of [search, capture, reminders, signOut]) await expect(action).toBeVisible();

  await search.click();
  await expect(page.getByLabel('Command or record search')).toBeVisible();
  await page.keyboard.press('Escape');

  const dock = page.getByRole('navigation', { name: 'Primary' }).last();
  await expect(dock).toBeVisible();
  for (const item of [
    { label: 'Today', href: '/today' },
    { label: 'Network', href: '/network' },
    { label: 'Explore', href: '/explore' },
    { label: 'Career', href: '/career' },
  ]) {
    await expect(dock.getByRole('link', { name: item.label, exact: true })).toHaveAttribute(
      'href',
      item.href,
    );
  }
  await expect(dock.getByRole('link', { name: 'Today', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const more = dock.getByRole('button', { name: 'More destinations' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'Vitae workspaces' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link', { name: /^Data\b/ })).toHaveAttribute('href', '/data');
  await expect(sheet.getByRole('link', { name: /^Settings\b/ })).toHaveAttribute(
    'href',
    '/settings',
  );
  await expect(sheet.getByRole('link', { name: /^Help\b/ })).toHaveAttribute('href', '/help');

  await sheet.getByRole('link', { name: /^Data\b/ }).click();
  await expect(page).toHaveURL(/\/data$/);
  await expect(sheet).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toHaveClass(/active/);

  await expectNoA11yViolations(page);
});

test('the root recognises a returning session and goes to Today', async ({ page }) => {
  await signIn(page);
  // A returning visitor types the bare address. The public root reads the
  // session hint synchronously (it still never waits on Firebase or the
  // API) and hands them to Today instead of the marketing page. The auth
  // gate stays the authority; the signIn above is what made the hint honest.
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('img', { name: /^Days of this week/ })).toBeVisible({
    timeout: 10_000,
  });
});

test('demo-space toggle carries an accessible name in every state', async ({ page }) => {
  await signIn(page);
  const toggle = page.getByRole('button', { name: 'View demo' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByText(/demo space/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /demo data/i })).toBeVisible();
});
