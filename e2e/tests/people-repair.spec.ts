import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiGet, expectOkJson } from './helpers/api';

const person = (id: number) => ({
  id: `review-person-${id}`,
  title: `Research partner ${String(id).padStart(2, '0')}`,
  headline: 'Community research and accessible service design',
  org: 'Open research collective',
  city: 'Cairo',
  topics: ['Research', 'Accessibility', 'Public services'],
  relation: 'friend',
  closeness: 4,
  cadenceTargetDays: 14,
  strength: 0.8 - id / 100,
  status: 'active',
  daysSinceLast: id === 0 ? null : 20,
  lastInteraction: null,
  source: 'manual',
  recordCount: 1,
  isPlaceholder: false,
});

test('People directory, sorting, selection and person form work at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/v1/people', (route) =>
    route.fulfill({
      json: {
        people: [
          {
            ...person(0),
            title: 'Amira El-Sayed — regional community research and accessibility partnership',
          },
          person(1),
          { ...person(2), cadenceTargetDays: null },
        ],
      },
    }),
  );
  await page.goto('/network/people');
  await expect(page.getByText('Every 14 days · Awaiting first contact')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    const heading = await page.getByRole('heading', { name: 'People', exact: true }).boundingBox();
    const add = await page.getByRole('button', { name: 'Add person', exact: true }).boundingBox();
    expect(heading).not.toBeNull();
    expect(add).not.toBeNull();
    expect(heading!.x + heading!.width <= add!.x || heading!.y + heading!.height <= add!.y).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`people-top-${width}.png`),
      animations: 'disabled',
    });
    const last = page.getByRole('list', { name: 'People', exact: true }).getByRole('link').last();
    await last.focus();
    await last.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`people-lower-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.people-directory');
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight &&
          scrollY === 0,
      ),
    ).toBe(true);
    await page.getByRole('combobox', { name: 'Sort by' }).click();
    await page.screenshot({
      path: info.outputPath(`people-sort-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeFocused();
    await page.getByRole('checkbox', { name: 'Select all visible', exact: true }).click();
    const bar = page.getByRole('group', { name: 'Bulk actions' });
    await expect(bar).toBeVisible();
    const dock = await page.locator('.mobile-dock').boundingBox();
    await expect
      .poll(async () => {
        const bounds = await bar.boundingBox();
        return bounds!.y + bounds!.height <= (dock?.y ?? page.viewportSize()!.height);
      })
      .toBe(true);
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`people-selection-${width}.png`),
      animations: 'disabled',
    });
    const lastBounds = await last.boundingBox();
    const barBounds = await bar.boundingBox();
    expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(barBounds!.y);
    await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Move 3 people to trash?' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`people-confirm-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    expect(await confirmation.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Move to trash', exact: true })).toBeFocused();
    await page
      .getByRole('group', { name: 'Bulk actions' })
      .getByRole('button', { name: 'Clear' })
      .click();
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.getByLabel('Full name')).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`people-add-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Add person', exact: true })).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('People URL controls compose, preserve context and bound selection to shown rows', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/people', (route) =>
    route.fulfill({ json: { people: Array.from({ length: 23 }, (_, i) => person(i)) } }),
  );
  await page.goto('/network/people?sort=name&source=network');
  const list = page.getByRole('list', { name: 'People', exact: true });
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await page.getByRole('checkbox', { name: 'Select all visible', exact: true }).click();
  await page.getByRole('button', { name: 'Friends', exact: true }).click();
  await page.getByLabel('Search people').fill('partner 22');
  await expect(page).toHaveURL(/filter=friend/);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText(/20 selected people are not shown/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search people')).toHaveValue('partner 22');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/sort=name&source=network$/);
  await page.getByRole('button', { name: 'Show more people' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(23);
  await page.getByRole('combobox', { name: 'Sort by' }).click();
  await page.getByRole('option', { name: 'Most recent contact', exact: true }).click();
  await expect(list.getByRole('link').first()).toContainText('Research partner 01');
  await page.getByLabel('Search people').fill('not in the directory');
  await expect(page.getByText('No people match your search')).toBeVisible();
  await page.getByRole('button', { name: 'Show everyone' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
});

test('People distinguish failed, empty and refresh failure, and retain partial Trash failures', async ({
  page,
}) => {
  await signIn(page);
  let mode = 'error';
  await page.route('**/api/v1/people', (route) =>
    mode === 'error'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', message: 'Directory unavailable' } },
        })
      : route.fulfill({ json: { people: mode === 'empty' ? [] : [person(0), person(1)] } }),
  );
  await page.goto('/network/people');
  await expect(page.getByText("Couldn't load your people")).toBeVisible();
  await expect(page.getByText('No one here yet')).toBeHidden();
  mode = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add your first person' })).toBeVisible();
  mode = 'populated';
  await page.getByRole('button', { name: 'Refresh people' }).click();
  await expect(page.getByRole('link', { name: /Research partner 00/ })).toBeVisible();
  mode = 'error';
  await page.getByRole('button', { name: 'Refresh people' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: /Research partner 00/ })).toBeVisible();
  mode = 'populated';
  await page.getByRole('button', { name: 'Refresh people' }).click();
  let writes = 0;
  await page.route('**/api/v1/nodes/review-person-*', (route) => {
    writes++;
    return route.fulfill(
      route.request().url().endsWith('-1')
        ? { status: 503, json: { error: { code: 'unavailable', message: 'Try again' } } }
        : { json: { ok: true } },
    );
  });
  await page.getByRole('checkbox', { name: 'Select all visible', exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Move 2 to trash', exact: true }).click();
  await expect(page.getByText('Moved 1 to trash · 1 still selected and not deleted')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Select Research partner 01', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Select Research partner 00', exact: true }),
  ).not.toBeChecked();
  expect(writes).toBe(2);
});

test('People real create, return to filtered directory and move only the new record to Trash', async ({
  page,
}) => {
  await signIn(page);
  const name = `People repair fixture ${Date.now()}`;
  await page.goto('/network/people');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Create person', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const recordUrl = page.url();
  await page.goto(`/network/people?q=${encodeURIComponent(name)}`);
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(recordUrl);
  await page.goBack();
  await expect(page.getByLabel('Search people')).toHaveValue(name);
  await page.getByRole('checkbox', { name: `Select ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await expect(page.getByText('Moved 1 person to trash')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeHidden();
  const result = await expectOkJson<{ people: { title: string }[] }>(
    await apiGet(page, '/people'),
    'People after moving fixture to Trash',
  );
  expect(result.people.some((p) => p.title === name)).toBe(false);
});
