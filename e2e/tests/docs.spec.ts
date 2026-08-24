import { test, expect, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * The documentation surface at `/docs`.
 *
 * These tests assert the properties the corpus promises rather than any
 * particular page, so adding, renaming or reordering pages cannot break them.
 * The properties are: it opens with no session, it never calls the API, every
 * section it advertises is reachable, and a reader can walk the whole thing
 * with the keyboard.
 */

/** Requests the reading surface must never make. */
function watchForApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) calls.push(url.pathname);
  });
  return calls;
}

test('the corpus opens without a session and without touching the API', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.context().clearCookies();
  await page.goto('/docs');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Documentation sections' })).toBeVisible();

  expect(apiCalls, 'the reading surface is readable with the API stopped').toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('every section the navigation advertises is reachable', async ({ page }) => {
  await page.goto('/docs');

  const sections = page.getByRole('navigation', { name: 'Documentation sections' });
  // The corpus entrance carries the same class as a section entrance, and it
  // is not a section: clicking it stays on this page, and the `goBack` below
  // would then leave the application entirely.
  const entrances = sections.locator('a.docs-nav__section[href^="/docs/"]');
  // `count()` does not wait. The manifest arrives after the document does, so
  // counting straight after `goto` counts an empty rail and calls it a corpus
  // with no sections in it.
  await entrances.first().waitFor();
  const count = await entrances.count();
  expect(count, 'the corpus has sections to enter').toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const link = entrances.nth(index);
    const label = (await link.textContent())?.trim() ?? '';
    const href = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await page.goBack();
  }
});

test('reading order runs both ways and the breadcrumb follows', async ({ page }) => {
  await page.goto('/docs');

  const pager = page.getByRole('navigation', { name: 'Reading order' });
  const next = pager.getByRole('link').filter({ hasText: 'Next' });
  await expect(next).toBeVisible();

  const heading = page.getByRole('heading', { level: 1 });
  const firstTitle = (await heading.textContent()) ?? '';
  await next.click();

  // An auto-waiting assertion, because the click starts a client-side
  // navigation and `textContent()` would read the heading that is still there.
  await expect(heading).not.toHaveText(firstTitle);

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link').first()).toHaveAttribute('href', '/docs');

  await pager.getByRole('link').filter({ hasText: 'Previous' }).click();
  await expect(heading).toHaveText(firstTitle);
});

test('a deep link to a heading lands on that heading', async ({ page }) => {
  await page.goto('/docs/meta');

  const toc = page.getByRole('navigation', { name: 'On this page' });
  await expect(toc).toBeVisible();

  const target = toc.getByRole('link').first();
  const href = await target.getAttribute('href');
  const anchor = (href ?? '').split('#')[1]!;
  await target.click();

  await expect(page).toHaveURL(new RegExp(`#${anchor}$`));
  await expect(page.locator(`#${anchor}`)).toBeVisible();
});

test('an unknown documentation path says so instead of asking for a login', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  await page.goto('/docs/nothing/here');

  await expect(page.getByRole('main')).toContainText(/no documentation page at this address/i);
  await expect(page.getByRole('link', { name: /documentation/i }).first()).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test('the skip link puts the keyboard on the document', async ({ page }) => {
  await page.goto('/docs');
  await page.getByRole('heading', { level: 1 }).waitFor();

  // Assert it is the first thing the keyboard reaches by reading the document
  // rather than by pressing Tab: where the browser puts focus on a fresh load
  // is the harness's business, and pressing Tab before React has rendered the
  // link tests nothing at all.
  const first = await page.evaluate(() => {
    const focusable = document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    return focusable[0]?.textContent ?? null;
  });
  expect(first).toMatch(/skip/i);

  const skip = page.getByRole('link', { name: /skip/i });
  await skip.focus();
  await expect(skip).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('search answers from a static index, with the query in the address', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  await page.goto('/docs/search');

  await page.getByLabel('What are you looking for?').fill('migration');

  await expect(page).toHaveURL(/\?q=migration$/);
  const results = page.getByRole('status');
  await expect(results).toContainText(/page/);
  await expect(page.getByRole('link').filter({ hasText: /migration/i }).first()).toBeVisible();
  expect(apiCalls, 'search must not need the API').toEqual([]);
});

test('a search can be opened from a link and narrowed by facet', async ({ page }) => {
  await page.goto('/docs/search?q=migration');
  await expect(page.getByRole('status')).toContainText(/page/);

  const before = await page.getByRole('status').textContent();
  // `click`, not `check`: checking re-reads the box to confirm its state, and
  // the re-render that follows the URL change replaces the element it was
  // holding. The behaviour under test is what the click does to the address
  // and to the result count, and both are asserted below.
  await page.getByRole('checkbox').first().click();

  await expect(page).toHaveURL(/&audience=/);
  await expect(page.getByRole('status')).toContainText('after filtering');
  await expect(page.getByRole('status')).not.toHaveText(before ?? '');
});

test('the command palette opens on a bare slash and reaches a page', async ({ page }) => {
  await page.goto('/docs');
  await page.getByRole('heading', { level: 1 }).waitFor();

  await page.keyboard.press('/');

  const field = page.getByRole('combobox', { name: 'Documentation page search' });
  await expect(field).toBeFocused();
  await field.fill('trust boundaries');

  const first = page.getByRole('option').first();
  await expect(first).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Vitae documentation');
  await expect(page).toHaveURL(/\/docs\//);
});

test('a generated catalog loads, filters, and keeps the filter in the address', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  await page.goto('/docs/reference/routes');

  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const all = await page.getByRole('status').textContent();

  await page.getByRole('searchbox').fill('pricing');
  await expect(page).toHaveURL(/\?q=pricing$/);
  await expect(page.getByRole('status')).not.toHaveText(all ?? '');

  expect(apiCalls, 'a catalog is a static artifact').toEqual([]);
});

test('a diagram carries its table whether or not anyone asks for it', async ({ page }) => {
  await page.goto('/docs/architecture/security');

  // In the document from the start, for a screen reader, and only revealed by
  // the button. This is the accessibility promise the diagram kit makes.
  const steps = page.getByRole('table', { name: 'Steps in order' }).first();
  await expect(steps).toBeAttached();

  const toggle = page.getByRole('button', { name: 'Show as a table' }).first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hide the table' }).first()).toBeVisible();
  await expect(steps).toBeVisible();
});

test('an explainer runs the real algorithm in the page', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  await page.goto('/docs/architecture/algorithms');

  const field = page.getByLabel('Some text');
  await field.fill('running migrations');

  const tokens = page.getByRole('table', { name: /Tokens/ });
  await expect(tokens.getByRole('rowheader', { name: 'running' })).toBeVisible();
  await expect(tokens.getByRole('rowheader', { name: 'migrations' })).toBeVisible();

  expect(apiCalls, 'the algorithm runs here, not on a server').toEqual([]);
});

/**
 * Wide content — tables, diagrams, code — scrolls inside its own container.
 * The page body never scrolls sideways, at any width. This is the rule that
 * makes a documentation surface usable on a phone, and the one that a single
 * wide table quietly breaks.
 */
for (const [label, width, height] of [
  ['a desktop', 1440, 900],
  ['a tablet', 834, 1112],
  ['a phone', 390, 844],
] as const) {
  test(`the page never scrolls sideways on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });

    for (const route of [
      '/docs',
      '/docs/architecture/security',
      '/docs/architecture/algorithms',
      '/docs/reference/config',
      '/docs/search?q=migration',
    ]) {
      await page.goto(route);
      await page.getByRole('heading', { level: 1 }).waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
}

test('the reading surface has no serious a11y violations', async ({ page }) => {
  await page.goto('/docs/meta');
  await expectNoA11yViolations(page);
});

test('a page carrying diagrams has no serious a11y violations', async ({ page }) => {
  await page.goto('/docs/architecture/security');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await expectNoA11yViolations(page);
});

test('a generated catalog has no serious a11y violations', async ({ page }) => {
  await page.goto('/docs/reference/config');
  await page.getByRole('table').waitFor();
  await expectNoA11yViolations(page);
});
