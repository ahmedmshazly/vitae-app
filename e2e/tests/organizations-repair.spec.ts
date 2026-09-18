import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  selector = '.organizations-directory',
  lower = false,
) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator('main')
      .evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    if (selector === '[role="dialog"]') {
      await page
        .locator('.vt-modal__body')
        .evaluateAll((elements) =>
          elements.forEach((element) => element.scrollTo({ top: 0, behavior: 'instant' })),
        );
      if (lower) await page.locator('.connection-composer').scrollIntoViewIfNeeded();
    }
    await expectNoA11yViolations(page, selector);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

test('Organizations search, sorting, disclosure and cached recovery work at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const orgs = Array.from({ length: 23 }, (_, index) => ({
    id: `review-org-${index}`,
    title: `Fictional community organization ${String(index).padStart(2, '0')} — accessibility research and international partnerships`,
    kind: 'community',
    domain: `community-${index}.example.com`,
    city: index === 0 ? 'Alexandria' : 'Cairo',
    peopleCount: index + 1,
    affinity: 1 - index / 100,
    openRoles: index % 3,
  }));
  let state: 'ready' | 'error' | 'empty' = 'ready';
  await page.route('**/api/v1/orgs', (route) =>
    state === 'error'
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: 'REVIEW_ERROR', message: 'Organizations temporarily unavailable' },
          },
        })
      : route.fulfill({ json: { orgs: state === 'empty' ? [] : orgs } }),
  );
  await page.goto('/network/organizations');
  const list = page.getByRole('list', { name: 'Organizations', exact: true });
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await capture(page, info, 'organizations-directory');
  await page.getByRole('button', { name: 'Show more organizations' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(23);
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).click();
  await page.getByRole('option', { name: 'Most known people', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(list.getByRole('link').first()).toContainText('organization 22');
  await expect(page).toHaveURL(/sort=people/);
  await list.getByRole('checkbox').first().check();
  await page.getByRole('searchbox', { name: 'Search organizations' }).fill('Alexandria');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText(/1 selected organization is not shown/)).toBeVisible();
  await capture(page, info, 'organizations-selection');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search organizations' }).fill('not-a-real-match');
  await expect(page.getByText('No organizations match your search')).toBeVisible();
  await capture(page, info, 'organizations-no-results');
  await page.getByRole('button', { name: 'Show all organizations' }).click();
  state = 'error';
  await page.getByRole('button', { name: 'Refresh organizations' }).click();
  await expect(page.getByText('Organizations could not be refreshed')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await capture(page, info, 'organizations-cached');
  await page.reload();
  await expect(page.getByText("Couldn't load your organizations")).toBeVisible();
  await capture(page, info, 'organizations-error');
  state = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No organizations yet')).toBeVisible();
  await capture(page, info, 'organizations-empty');
  expect(errors).toEqual([]);
});

test('Organization creation protects drafts and recovers saves and moves to Trash', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const title = `Fictional organization review ${stamp}`;
  const website = `https://organization-${stamp}.example.com/research`;
  await page.goto('/network/organizations');
  await page.getByRole('button', { name: 'Add organization', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New organization', exact: true });
  await dialog.getByLabel(/^Name/).fill(title);
  await dialog
    .getByLabel('One-liner', { exact: true })
    .fill('Community accessibility research and long-term partnerships');
  await dialog.getByLabel('HQ city', { exact: true }).fill('Alexandria');
  await dialog.getByLabel('Website', { exact: true }).fill(website);
  await capture(page, info, 'organization-create', '[role="dialog"]');
  await capture(page, info, 'organization-create-connections', '[role="dialog"]', true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(dialog.getByLabel(/^Name/)).toHaveValue(title);
  await page.route('**/api/v1/nodes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: 'REVIEW_ERROR', message: 'Organization save temporarily unavailable' },
          },
        })
      : route.continue(),
  );
  await dialog.getByRole('button', { name: 'Create organization', exact: true }).click();
  const saveError = dialog.getByRole('alert');
  const createSeparately = dialog.getByRole('button', { name: 'Create separately', exact: true });
  await expect(saveError.or(createSeparately)).toBeVisible();
  // Earlier interrupted runs can leave similar fictional records in the scratch graph.
  // eslint-disable-next-line playwright/no-conditional-in-test -- The optional dedup checkpoint depends on retained scratch fixtures; the required save-error assertions below always run.
  if (await createSeparately.isVisible()) await createSeparately.click();
  await expect(saveError).toContainText('Organization save temporarily unavailable');
  await expect(saveError).toBeFocused();
  await expect(saveError).toBeInViewport();
  await capture(page, info, 'organization-save-error', '[role="dialog"]');
  await page.unroute('**/api/v1/nodes');
  await dialog.getByRole('button', { name: 'Create organization', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/network\/organizations\/[^/]+$/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const saved = await expectOkJson<{ node: { props: { hq_city: string; website: string } } }>(
    await apiGet(page, `/nodes/${id}`),
    'Saved organization',
  );
  expect(saved.node.props.hq_city).toBe('Alexandria');
  expect(saved.node.props.website).toBe(website);
  await expect(page.getByRole('definition').filter({ hasText: /^Alexandria$/ })).toBeVisible();
  await page.goto('/network/organizations?q=Alexandria');
  const cityMatch = page.locator(`a[href="/network/organizations/${id}"]`);
  await expect(cityMatch).toContainText(title);
  await expect(cityMatch).toContainText('Alexandria');
  await capture(page, info, 'organization-saved-city');
  await page.goto(`/network/organizations?q=${encodeURIComponent(title)}`);
  await page.getByRole('checkbox', { name: `Select ${title}`, exact: true }).check();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `Move '${title}' to trash?`, exact: true });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await capture(page, info, 'organization-trash-confirm', '[role="dialog"]');
  await page.route(`**/api/v1/nodes/${id}`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'REVIEW_ERROR', message: 'Move temporarily unavailable' } },
        })
      : route.continue(),
  );
  await confirm.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('checkbox', { name: `Select ${title}`, exact: true })).toBeChecked();
  await page.unroute(`**/api/v1/nodes/${id}`);
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await confirm.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('checkbox', { name: `Select ${title}`, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Organization creation adds and removes membership drafts before saving the intended link', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const title = `Fictional membership organization ${stamp}`;
  const { node: person } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional accessibility community member ${stamp}`,
      props: {},
    }),
    'Create fictional member',
  );
  await page.goto('/network/organizations');
  await page.getByRole('button', { name: 'Add organization', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New organization', exact: true });
  await dialog.getByLabel(/^Name/).fill(title);
  const composer = dialog.locator('.connection-composer');
  const addMember = async () => {
    await composer.getByRole('combobox', { name: 'Relationship', exact: true }).click();
    await page.getByRole('option', { name: 'Career · Has member', exact: true }).click();
    await composer
      .getByRole('combobox', { name: 'Search or create a record...' })
      .fill(person.title);
    await page.getByRole('option', { name: new RegExp(`^${person.title}`) }).click();
    await composer.getByPlaceholder('Senior Member').fill('Accessibility coordinator');
    await composer.getByRole('button', { name: 'Add connection', exact: true }).click();
  };
  await addMember();
  await expect(composer.getByRole('button', { name: `Unlink ${person.title}` })).toBeVisible();
  await capture(page, info, 'organization-membership-draft', '[role="dialog"]', true);
  await composer.getByRole('button', { name: `Unlink ${person.title}` }).click();
  await expect(composer.getByText(person.title, { exact: true })).toHaveCount(0);
  await addMember();
  await dialog.getByRole('button', { name: 'Create organization', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/network\/organizations\/[^/]+$/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const record = await expectOkJson<{
    edges: { type: string; src: string; dst: string; props: { role?: string } }[];
  }>(await apiGet(page, `/nodes/${id}`), 'Saved organization membership');
  const membership = record.edges.filter((edge) => edge.type === 'MEMBER_OF');
  expect(membership).toHaveLength(1);
  expect(membership[0]).toMatchObject({
    src: person.id,
    dst: id,
    props: { role: 'Accessibility coordinator' },
  });
  expect(errors).toEqual([]);
});
