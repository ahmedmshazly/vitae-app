import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { createSearchFixture, deleteSearchFixture, type SearchFixture } from './helpers/fixtures';

/**
 * Screen 11: Search.
 *
 * The query lives in the URL so a result is linkable, reloadable, and
 * back-able. The other half of the job is telling two records with the same
 * name apart.
 */

const SEARCH = '**/api/v1/search?q=*';
const QUERY = 'Search query';

function matches(page: Page) {
  return page.getByRole('region', { name: /^Matches/ });
}

test.describe('search', () => {
  let fixture: SearchFixture;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    fixture = await createSearchFixture(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteSearchFixture(page, fixture);
  });

  test('the query is the URL, linkable, reloadable, and in the box', async ({ page }) => {
    await page.goto(`/search?q=${fixture.token}`);

    // The whole bug in one assertion: this used to render an empty screen.
    await expect(matches(page).getByRole('link')).toHaveCount(3);
    await expect(page.getByLabel(QUERY)).toHaveValue(fixture.token);

    // Typing writes back to the URL, so the result is still there after F5.
    await page.getByLabel(QUERY).fill(fixture.orgTitle);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(matches(page).getByRole('link')).toHaveCount(1);

    await page.reload();
    await expect(page.getByLabel(QUERY)).toHaveValue(fixture.orgTitle);
    await expect(matches(page).getByRole('link')).toHaveCount(1);
  });

  test('two records with the same name are told apart', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(fixture.twinTitle)}`);

    const rows = matches(page).getByRole('link');
    await expect(rows).toHaveCount(2);
    // Identical titles: every row rendered the same word and a "0.00", and
    // there was no way to know which one you were about to open.
    await expect(rows.nth(0)).toContainText(fixture.twinTitle);
    await expect(rows.nth(1)).toContainText(fixture.twinTitle);
    await expect(matches(page)).toContainText('First of the two · Berlin');
    await expect(matches(page)).toContainText('Second of the two · Lisbon');
    // …and each says where it came from, which is what separates a person you
    // typed from one a vCard brought in.
    await expect(matches(page).locator('.vt-prov')).toHaveCount(2);

    await rows.nth(0).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  });

  test('relevance is a share of the top match, and is withheld when nothing was scored', async ({ page }) => {
    await page.goto(`/search?q=${fixture.token}`);
    const bars = matches(page).locator('.vt-strength__value');
    await expect(bars).toHaveCount(3);
    // Ranked, so the leader is the unit everything else is measured against.
    await expect(bars.first()).toHaveText('1.00');

    // A filters-only query has no text to score: the index scores every hit
    // against its own title and hands back a flat 1.00, so drawing a full bar
    // on every row would be a number the screen made up.
    await page.goto('/search?q=type%3Aorganization');
    await expect(matches(page).getByRole('link').first()).toBeVisible();
    await expect(matches(page).locator('.vt-strength')).toHaveCount(0);
  });

  test('narrowing by kind only offers kinds that are there', async ({ page }) => {
    await page.goto(`/search?q=${fixture.token}`);
    const group = page.getByRole('group', { name: 'Narrow results by kind' });

    await expect(group.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'People 2' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Organizations 1' })).toBeVisible();
    // Every option carries its count, so narrowing can never empty the list.
    await expect(group.getByRole('button')).toHaveCount(3);

    await group.getByRole('button', { name: 'People 2' }).click();
    await expect(group.getByRole('button', { name: 'People 2' })).toHaveAttribute('aria-pressed', 'true');
    await expect(matches(page).getByRole('link')).toHaveCount(2);

    // A kind that the next result set does not contain must not strand you on
    // a list you cannot explain.
    await page.getByLabel(QUERY).fill(fixture.orgTitle);
    await expect(matches(page).getByRole('link')).toHaveCount(1);
  });

  test('a failed search reports the failure, not "No matches"', async ({ page }) => {
    await page.goto('/search');
    await page.route(SEARCH, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":{"code":"boom","message":"the index is rebuilding"}}',
      }),
    );
    await page.getByLabel(QUERY).fill(fixture.token);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Couldn’t run that search');
    await expect(alert).toContainText('the index is rebuilding');
    await expect(page.getByText('No matches', { exact: true })).toHaveCount(0);
  });

  test('nothing found says so, and is not the same screen as nothing typed', async ({ page }) => {
    await page.goto('/search?q=zzzznothingmatchesthis');
    await expect(page.getByText('No matches')).toBeVisible();
    await expect(page.getByRole('region', { name: /^Filter grammar/ })).toHaveCount(0);

    await page.goto('/search');
    await expect(page.getByRole('region', { name: /^Filter grammar/ })).toBeVisible();
    await expect(page.getByText('No matches')).toHaveCount(0);
  });

  test('an invalid filter explains itself in words, not a tooltip', async ({ page }) => {
    await page.goto('/search?q=is%3Awombat');
    // The reason used to live in a `title` attribute, invisible to keyboards,
    // touch and screen readers alike.
    await expect(page.getByText('is:wombat: expected one of')).toBeVisible();
  });

  test('the grammar on the idle screen is runnable, not just readable', async ({ page }) => {
    await page.goto('/search');
    await page.getByRole('button', { name: 'type:person one kind of record' }).click();

    await expect(page).toHaveURL(/q=type%3Aperson/);
    await expect(page.getByLabel(QUERY)).toHaveValue('type:person');
    await expect(matches(page).getByRole('link').first()).toBeVisible();
    // The parsed clause comes back as a chip you can take off again.
    await page.getByRole('button', { name: 'Remove filter type:person' }).click();
    await expect(page.getByRole('region', { name: /^Filter grammar/ })).toBeVisible();
  });

  test('no automated a11y violations, searched or not', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('region', { name: /^Filter grammar/ })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto(`/search?q=${fixture.token}`);
    await expect(matches(page).getByRole('link').first()).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
