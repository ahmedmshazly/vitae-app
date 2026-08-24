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
  const entrances = sections.locator('a.docs-nav__section');
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

  const firstTitle = await page.getByRole('heading', { level: 1 }).textContent();
  await next.click();

  const secondTitle = await page.getByRole('heading', { level: 1 }).textContent();
  expect(secondTitle).not.toBe(firstTitle);

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link').first()).toHaveAttribute('href', '/docs');

  await pager.getByRole('link').filter({ hasText: 'Previous' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstTitle ?? '');
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

  await expect(page.getByRole('main')).toContainText(/no page/i);
  await expect(page.getByRole('link', { name: /documentation/i }).first()).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test('the skip link puts the keyboard on the document', async ({ page }) => {
  await page.goto('/docs');

  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveText(/skip/i);

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('the reading surface has no serious a11y violations', async ({ page }) => {
  await page.goto('/docs/meta');
  await expectNoA11yViolations(page);
});
