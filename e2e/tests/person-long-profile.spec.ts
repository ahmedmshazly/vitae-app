import { test, expect, type Locator } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiPost, expectOkJson } from './helpers/api';
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

test('Person long records disclose complete history and preserve bounded connection selection', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional long profile ${Date.now()}`,
      props: {
        headline: 'Research lead for accessible community services and international partnerships',
        emails: ['research@example.com'],
        phones: ['+20 100 123 4567'],
        city: 'Alexandria',
      },
    }),
    'Create scratch long-profile fixture',
  );
  const interactions = Array.from({ length: 42 }, (_, i) => ({
    id: `review-history-${i}`,
    type: 'interaction',
    title: `Fictional accessibility research conversation ${i + 1}: community services and next steps`,
    props: { kind: 'meeting', occurred_at: new Date(Date.UTC(2026, 6, i + 1, 12)).toISOString() },
  }));
  const connections = Array.from({ length: 23 }, (_, i) => ({
    id: `review-org-${i}`,
    type: 'organization',
    title: `Fictional community research partner ${i + 1} — international accessibility working group`,
  }));
  await page.route(`**/api/v1/nodes/${node.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.edges = [
      ...interactions.map((item) => ({
        id: `edge-${item.id}`,
        type: 'WITH',
        src: item.id,
        dst: node.id,
        props: {},
      })),
      ...connections.map((item) => ({
        id: `edge-${item.id}`,
        type: 'MEMBER_OF',
        src: node.id,
        dst: item.id,
        props: {},
      })),
    ];
    body.neighbors = Object.fromEntries(
      [...interactions, ...connections].map((item) => [item.id, item]),
    );
    await route.fulfill({ response, json: body });
  });
  await page.route(`**/api/v1/people/${node.id}/profile`, (route) =>
    route.fulfill({
      json: {
        person: { id: node.id, title: node.title, isSelf: false, isPlaceholder: false },
        sections: [
          {
            type: 'role',
            label: 'Career',
            entries: Array.from({ length: 11 }, (_, i) => ({
              id: `review-role-${i}`,
              title: `Fictional research leadership role ${i + 1} in community accessibility and service design`,
              org: 'International Community Research Partnership',
              start_date: '2020-01-01',
              end_date: '2026-01-01',
            })),
          },
        ],
        skills: Array.from({ length: 30 }, (_, i) => ({
          id: `review-skill-${i}`,
          name: `Research practice ${i + 1}`,
        })),
        counts: { records: 11, skills: 30 },
      },
    }),
  );
  await page.route(`**/api/v1/people/${node.id}/correspondence`, (route) =>
    route.fulfill({ json: { profile: { coverage: { withDirection: 0, total: 42 } } } }),
  );
  await page.goto(`/network/people/${node.id}`);
  await expect(page.getByRole('heading', { name: node.title, exact: true })).toBeVisible();
  const profile = page.getByRole('region', { name: 'Profile 11 records', exact: true });
  const history = page.getByRole('list', { name: 'Logged interactions' });
  const connectionList = page.getByRole('list', { name: 'Connections', exact: true });
  await expect(history.getByRole('listitem')).toHaveCount(10);
  await expect(connectionList.getByRole('listitem')).toHaveCount(20);
  await expect(profile.locator('.network-profile-ledger__entries > li')).toHaveCount(8);
  await expect(profile.locator('.network-profile-ledger__skills > li')).toHaveCount(24);
  await profile.getByRole('button', { name: 'Show all 11 of career' }).click();
  await profile.getByRole('button', { name: 'Show all 30 skills' }).click();
  await expect(profile.locator('.network-profile-ledger__entries > li')).toHaveCount(11);
  await expect(profile.locator('.network-profile-ledger__skills > li')).toHaveCount(30);
  await page.getByRole('button', { name: 'Show all 42 interactions' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(42);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, target] of [
      ['header', page.locator('.network-dossier--person')],
      ['profile', profile],
      ['history', history],
      ['connections', connectionList],
    ] as const) {
      await showInPane(target);
      await expectNoA11yViolations(page, '.page--person-dossier');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page
          .locator('main')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`long-${name}-${width}.png`),
        animations: 'disabled',
      });
    }
  }
  await page.getByRole('checkbox', { name: 'Select all visible' }).check();
  await expect(page.getByRole('group', { name: 'Connection bulk actions' })).toContainText('20');
  await page.getByRole('button', { name: 'Show more connections (3 remaining)' }).click();
  await expect(connectionList.getByRole('listitem')).toHaveCount(23);
  await expect(connectionList.getByRole('checkbox', { checked: true })).toHaveCount(20);
  await expect(page.getByRole('checkbox', { name: 'Select all visible' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Select all visible' }).check();
  await expect(connectionList.getByRole('checkbox', { checked: true })).toHaveCount(23);
  await page
    .getByRole('group', { name: 'Connection bulk actions' })
    .getByRole('button', { name: 'Clear', exact: true })
    .click();
  await expect(connectionList.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show recent only' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(10);
  await profile.getByRole('button', { name: 'Show first 8 of career' }).click();
  await profile.getByRole('button', { name: 'Show first 24 skills' }).click();
  await expect(profile.locator('.network-profile-ledger__entries > li')).toHaveCount(8);
  await page.getByRole('link', { name: 'People', exact: true }).click();
  await expect(page).toHaveURL(/\/network\/people$/);
  await page.goBack();
  await expect(connectionList.getByRole('listitem')).toHaveCount(20);
  await expect(connectionList.getByRole('checkbox', { checked: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
