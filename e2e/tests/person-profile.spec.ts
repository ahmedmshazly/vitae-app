import { test, expect, type Locator } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

async function showInPane(locator: Locator) {
  await locator.evaluate((element) => {
    const pane = element.closest('main');
    if (!pane) throw new Error('Missing content pane');
    pane.scrollBy({
      top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 24,
      behavior: 'instant',
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

test('Person contact details, edit and deletion recovery work across viewport sizes', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `Fictional profile review ${Date.now()}`;
  const props = {
    emails: ['community.research.partnerships@example.com', 'research@example.com'],
    phones: ['+20 (100) 123-4567', '+44 20 7946 0123'],
    city: 'Alexandria',
    timezone: 'Africa/Cairo',
    pronouns: 'she/her',
    birthday: '2000-02-29',
    year_known: false,
    do_not_contact: true,
    headline: 'Researcher in accessible community services and international partnerships',
    socials: { site: 'https://example.com/research', github: 'https://github.com/example' },
    review_marker: 'Preserve this imported property',
  };
  const { node } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', { type: 'person', title, props }),
    'Create scratch profile',
  );
  await page.goto(`/network/people/${node.id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const details = page.getByRole('region', { name: 'Details', exact: true });
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await showInPane(page.locator('.network-dossier--person'));
    await expect(page.getByRole('button', { name: 'Edit record' })).toBeInViewport();
    await expectNoA11yViolations(page, '.page--person-dossier');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`profile-top-${width}.png`),
      animations: 'disabled',
    });
    await showInPane(details);
    await expect(details.getByText('Do not contact', { exact: true })).toBeInViewport();
    await expect(
      details.getByRole('link', { name: 'research@example.com', exact: true }),
    ).toHaveAttribute('href', 'mailto:research%40example.com');
    await page.screenshot({
      path: info.outputPath(`profile-details-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.getByRole('button', { name: 'Edit record' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit person', exact: true });
  await expect(edit.getByLabel('Full name')).toHaveValue(title);
  await expect(edit.getByText(/Birth year is not recorded/)).toBeVisible();
  await edit.getByLabel('Full name').fill(`${title} updated`);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await expect(edit.getByRole('button', { name: 'Save changes' })).toBeInViewport();
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`profile-edit-${width}.png`),
      animations: 'disabled',
    });
    await edit.getByText(/Birth year is not recorded/).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`profile-birthday-${width}.png`),
      animations: 'disabled',
    });
    await edit.getByLabel('Do not contact', { exact: true }).scrollIntoViewIfNeeded();
    const overflowing = await edit.locator('.entity-form__fields').evaluate((element) => {
      const boundary = element.getBoundingClientRect();
      return [...element.querySelectorAll('*')]
        .filter((child) => {
          const box = child.getBoundingClientRect();
          return box.width > 0 && box.right > boundary.right + 1;
        })
        .map((child) => ({
          tag: child.tagName,
          className: child.className,
          width: Math.round(child.getBoundingClientRect().width),
          right: Math.round(child.getBoundingClientRect().right - boundary.right),
        }));
    });
    expect(overflowing).toEqual([]);
    const picker = edit.getByRole('combobox', { name: 'Link skills...', exact: true });
    const pickerBox = await picker.boundingBox();
    const dialogBox = await edit.boundingBox();
    expect(pickerBox!.x + pickerBox!.width).toBeLessThan(dialogBox!.x + dialogBox!.width - 12);
    await page.screenshot({
      path: info.outputPath(`profile-edit-lower-${width}.png`),
      animations: 'disabled',
    });
    await edit.getByText('Any typed connection', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`profile-edit-connections-${width}.png`),
      animations: 'disabled',
    });
    await edit.getByLabel('Full name').scrollIntoViewIfNeeded();
  }
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(edit.getByLabel('Full name')).toHaveValue(`${title} updated`);
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: `${title} updated`, exact: true })).toBeVisible();
  const saved = await expectOkJson<{ node: { props: Record<string, unknown> } }>(
    await apiGet(page, `/nodes/${node.id}`),
    'Read edited profile',
  );
  expect(saved.node.props.review_marker).toBe(props.review_marker);
  expect(saved.node.props.phones).toEqual(props.phones);
  expect(saved.node.props.year_known).toBe(false);
  let failDelete = true;
  let deleteCount = 0;
  let release!: () => void;
  await page.route(`**/api/v1/nodes/${node.id}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    deleteCount += 1;
    if (failDelete) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Review deletion interrupted' } },
      });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /Move.*to trash/ });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect.poll(() => deleteCount).toBe(1);
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();
  await expect(confirm.getByText('Couldn’t move this person to Trash')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await expect(
      confirm.getByRole('button', { name: 'Move to trash', exact: true }),
    ).toBeInViewport();
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`profile-delete-${width}.png`),
      animations: 'disabled',
    });
  }
  failDelete = false;
  await confirm.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page).toHaveURL(/\/data\/trash$/);
  expect(deleteCount).toBe(2);
  const trashed = await expectOkJson<{ node: { deleted_at: string } }>(
    await apiGet(page, `/nodes/${node.id}`),
    'Read scratch Trash record',
  );
  expect(trashed.node.deleted_at).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Person keeps an undated interaction visible without claiming no contact', async ({
  page,
}, info) => {
  await signIn(page);
  const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional undated review ${Date.now()}`,
      props: {},
    }),
    'Create scratch profile',
  );
  await page.route(`**/api/v1/nodes/${node.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.edges.push({
      id: 'review-undated-edge',
      type: 'WITH',
      src: 'review-undated',
      dst: node.id,
      props: {},
    });
    body.neighbors['review-undated'] = {
      id: 'review-undated',
      type: 'interaction',
      title: 'Fictional imported conversation',
      props: { occurred_at: 'invalid' },
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/network/people/${node.id}`);
  await expect(page.getByText('Date not recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('No interaction yet', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Logged interactions' })).toContainText(
    'Fictional imported conversation',
  );
  const correspondence = page.getByRole('region', { name: 'Correspondence', exact: true });
  await expect(correspondence).toContainText('No correspondence measurements yet');
  await expect(correspondence.getByText('No interactions logged', { exact: true })).toHaveCount(0);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await showInPane(page.locator('.network-dossier--person'));
    await expect(page.getByText('Date not recorded', { exact: true })).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`profile-undated-${width}.png`),
      animations: 'disabled',
    });
    await showInPane(correspondence);
    await expectNoA11yViolations(page, '.correspondence-panel');
    await page.screenshot({
      path: info.outputPath(`correspondence-undated-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.unroute(`**/api/v1/nodes/${node.id}`);
  await page.reload();
  await expect(correspondence).toContainText('No interactions logged');
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await showInPane(correspondence);
    await page.screenshot({
      path: info.outputPath(`correspondence-empty-${width}.png`),
      animations: 'disabled',
    });
  }
});

test('Person interaction logger protects its draft and refreshes the saved history', async ({
  page,
}, info) => {
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional logger review ${Date.now()}`,
      props: {},
    }),
    'Create scratch person',
  );
  await page.goto(`/network/people/${node.id}`);
  await page.getByRole('button', { name: 'Log interaction', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: `Log interaction · ${node.title}`, exact: true });
  const note = dialog.getByLabel('What happened?', { exact: false });
  await note.fill('Reviewed the accessibility research.\nNext: share the workshop notes.');
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`person-logger-${width}.png`),
      animations: 'disabled',
    });
    await dialog.getByLabel('Follow-up reminder', { exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`person-logger-lower-${width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('group', { name: 'Kind', exact: true }).scrollIntoViewIfNeeded();
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(note).toHaveValue(
    'Reviewed the accessibility research.\nNext: share the workshop notes.',
  );
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('list', { name: 'Logged interactions' }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Logged interactions' }).getByRole('listitem'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
