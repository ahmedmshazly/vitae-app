import { test, expect, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { signIn } from './helpers/auth';

/**
 * The documentation surface at `/docs`.
 *
 * These tests assert the properties the corpus promises rather than any
 * particular page, so adding, renaming or reordering pages cannot break them.
 *
 * The first property used to be that the surface needed no session and never
 * called the API. It is the opposite now, deliberately: the corpus describes
 * every trust boundary in the system and enumerates every route, endpoint,
 * table and symbol in the repository, so it is served by the API behind the
 * owner allow-list rather than published as static files. The suite therefore
 * signs in first, and the one test that still checks an unauthenticated view
 * checks that it is refused.
 */

/** Requests the reading surface makes, for the tests that care which. */
function watchForApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) calls.push(url.pathname);
  });
  return calls;
}

/**
 * Every test below reads the corpus, and the corpus is private. Signing in as
 * the owner is therefore setup rather than something under test — except in the
 * one test that clears the session on purpose to prove the refusal.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('the owner can read the corpus, and it comes from the API', async ({ page }) => {
  const apiCalls = watchForApiCalls(page);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/docs');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Documentation sections' })).toBeVisible();

  // The corpus is no longer a static file beside the application. If this ever
  // passes without an /api/v1/docs request, something is serving it publicly.
  expect(apiCalls.some((path) => path.startsWith('/api/v1/docs/'))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('a reader with no session is refused, and told why', async ({ page, context }) => {
  // The whole point of the move. A signed-out reader must not get the corpus,
  // and must not be sent to debug a build that is fine.
  await context.clearCookies();
  await page.goto('/docs');

  await expect(page.getByText(/documentation is private/i)).toBeVisible();
  await expect(page.getByText(/account that owns this instance/i)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Documentation sections' })).toBeHidden();
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
  // The manifest is fetched; no page request follows, because the manifest
  // already said this route does not exist.
  expect(apiCalls.some((path) => path.includes('/docs/pages/'))).toBe(false);
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
  // The index is one file from the API, fetched once, not a query per keystroke.
  const indexReads = apiCalls.filter((path) => path.includes('search-text.json'));
  expect(indexReads.length).toBe(1);
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

  // One artifact, fetched once. Filtering happens in the page, not on a server.
  expect(apiCalls.filter((path) => path.endsWith('/routes.json')).length).toBe(1);
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

  // The algorithm itself runs in the browser: typing must not produce traffic.
  const before = apiCalls.length;
  await field.fill('another phrase entirely');
  await expect(tokens.getByRole('rowheader', { name: 'phrase' })).toBeVisible();
  expect(apiCalls.length, 'the algorithm runs here, not on a server').toBe(before);
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
