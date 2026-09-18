import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  selector = '.page--organization-dossier',
) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const target = page.locator(selector).first();
    await target.evaluate((element) => {
      const pane = element.closest('main');
      if (pane)
        pane.scrollBy({
          top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 20,
          behavior: 'instant',
        });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expectNoA11yViolations(page, selector);
    expect(
      await page
        .locator('[role="dialog"] .vt-modal__title')
        .evaluateAll((headings) =>
          headings.every((heading) =>
            getComputedStyle(heading).fontFamily.includes('Space Grotesk'),
          ),
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('.page--organization-dossier .vt-pagehead__actions button')
        .evaluateAll((buttons) =>
          buttons.every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
          }),
        ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

test('Organization profile exposes details, bounded records, evidence and recoverable states', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = 'organization-dossier-review';
  const org = {
    id,
    title:
      'Fictional community research organization — accessible services and international partnerships',
    kind: 'community',
    domain: 'research.example.com',
    city: 'Alexandria',
    peopleCount: 23,
    affinity: 0.71,
    openRoles: 8,
    inroads: Array.from({ length: 23 }, (_, i) => ({
      rank: i + 1,
      person: {
        id: `p${i}`,
        title: `Fictional research partner ${i} — community accessibility and long-term collaboration`,
        headline: 'Senior researcher in accessible community services',
        strength: 0.8 - i / 100,
      },
      reason: 'Recorded role at this organization and a relationship in your network',
    })),
    roles: Array.from({ length: 23 }, (_, i) => ({
      id: `r${i}`,
      title: `Community research and international partnerships role ${i}`,
      holder: i % 2 ? 'Fictional researcher' : null,
      open: i % 3 === 0,
    })),
    relatedOrgs: Array.from({ length: 23 }, (_, i) => ({
      id: `o${i}`,
      title: `Fictional partner organization ${i} — accessible services`,
      kind: 'partner',
      direction: i % 2 ? 'in' : 'out',
      edgeId: `e${i}`,
      note: 'Joint community research program',
    })),
  };
  const record = {
    node: {
      id,
      title: org.title,
      type: 'organization',
      subtitle: 'Research partnerships with community organizations',
      props: {
        industry: 'Community research',
        size_hint: '51–200',
        website: 'https://research.example.com/accessible-services',
        linkedin_url: 'https://www.linkedin.com/company/fictional-review',
      },
      notes_md:
        'Fictional notes: review the underlying role and relationship before asking for an introduction.',
    },
    edges: [],
    neighbors: {},
  };
  let failed = false;
  let empty = false;
  let recordFailed = false;
  await page.route(`**/api/v1/orgs/${id}`, (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: 'Profile temporarily unavailable' } })
      : route.fulfill({
          json: {
            org: empty
              ? {
                  ...org,
                  peopleCount: 0,
                  openRoles: 0,
                  affinity: 0,
                  inroads: [],
                  roles: [],
                  relatedOrgs: [],
                }
              : org,
          },
        }),
  );
  await page.route(`**/api/v1/nodes/${id}`, (route) =>
    recordFailed
      ? route.fulfill({ status: 503, json: { error: 'Details temporarily unavailable' } })
      : route.fulfill({ json: record }),
  );
  await page.route(`**/api/v1/knowledge/entities/${id}/evidence`, (route) =>
    route.fulfill({
      json: {
        assertions: [
          {
            id: 'assertion',
            field: 'props.industry',
            status: 'accepted',
            basis: 'explicit',
            confidence: 0.9,
            value: 'Community research',
            reason: 'Fictional workshop source',
            citation: {
              locator: 'review:workshop',
              excerpt: 'Our team studies accessible community services.',
              record_id: 'source',
            },
          },
        ],
        records: {
          source: {
            title: 'Fictional workshop invitation',
            kind: 'message',
            direction: 'in',
            locator: 'review:workshop',
            occurred_at: '2026-08-10T12:00:00Z',
          },
        },
      },
    }),
  );
  await page.goto(`/network/organizations/${id}`);
  await expect(page.getByRole('heading', { name: org.title })).toBeVisible();
  await capture(page, info, 'organization-profile');
  await page.locator('.organization-notes summary').focus();
  await page.keyboard.press('Enter');
  await capture(page, info, 'organization-details', '#organization-details');
  await capture(page, info, 'organization-people', '#organization-people');
  await capture(page, info, 'organization-roles', '#organization-people > :nth-child(2)');
  for (const [label, button] of [
    ['Inroads, strongest first', 'Show more people'],
    ['Roles', 'Show more roles'],
    ['Related organizations', 'Show more related organizations'],
  ]) {
    const list = page.getByRole('list', { name: label, exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(20);
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(23);
  }
  await capture(page, info, 'organization-related', '#organization-related');
  await page.locator('#organization-evidence summary').focus();
  await page.keyboard.press('Enter');
  await capture(page, info, 'organization-evidence', '#organization-evidence');
  failed = true;
  recordFailed = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('This organization could not be refreshed')).toBeVisible();
  await capture(page, info, 'organization-cached', '.network-secondary-state');
  await page.reload();
  await expect(page.getByText("Couldn't load this organization")).toBeVisible();
  await capture(page, info, 'organization-error');
  failed = false;
  empty = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Couldn’t load organization details')).toBeVisible();
  await capture(page, info, 'organization-partial', '#organization-details');
  recordFailed = false;
  await page
    .getByRole('region', { name: 'Details', exact: true })
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.getByText('Community research', { exact: true })).toBeVisible();
  await capture(page, info, 'organization-empty', '#organization-people');
  expect(errors).toEqual([]);
});

test('Organization edit, connection properties, unlink and Trash retain recoverable drafts', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const { node: org } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'organization',
      title: `Fictional dossier organization ${stamp}`,
      props: { hq_city: 'Alexandria' },
    }),
    'Create organization',
  );
  const { node: person } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional membership researcher ${stamp}`,
      props: {},
    }),
    'Create member',
  );
  await page.goto(`/network/organizations/${org.id}`);
  await page.getByRole('button', { name: 'Edit record', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit organization', exact: true });
  await edit.getByLabel('Industry', { exact: true }).fill('Community research');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(edit.getByLabel('Industry', { exact: true })).toHaveValue('Community research');
  await capture(page, info, 'organization-edit', '[role="dialog"]');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Community research', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add connection', exact: true });
  await add.getByRole('combobox', { name: /^Relationship:/ }).click();
  await page.getByRole('option', { name: 'Career · Has member', exact: true }).click();
  await add.getByRole('combobox', { name: /^Search/ }).fill(person.title);
  await page.getByRole('option', { name: new RegExp(`^${person.title}`) }).click();
  await capture(page, info, 'organization-add', '[role="dialog"]');
  await add.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(add).toBeHidden();
  const connections = page.getByRole('list', { name: 'Organization connections', exact: true });
  await expect(connections.getByRole('listitem')).toHaveCount(1);
  await capture(page, info, 'organization-connections', '#organization-connections');
  await connections.getByRole('button', { name: /^Edit .* properties$/ }).click();
  const props = page.getByRole('dialog');
  await props.getByLabel('Role', { exact: true }).fill('Research coordinator');
  await capture(page, info, 'organization-connection-properties', '[role="dialog"]');
  await props.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(props).toBeHidden();
  const saved = await expectOkJson<{ edges: { type: string; props: { role?: string } }[] }>(
    await apiGet(page, `/nodes/${org.id}`),
    'Saved member',
  );
  expect(saved.edges.find((edge) => edge.type === 'MEMBER_OF')?.props.role).toBe(
    'Research coordinator',
  );
  await connections.getByRole('button', { name: `Unlink ${person.title}`, exact: true }).click();
  const unlink = page.getByRole('dialog');
  await expect(unlink.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await capture(page, info, 'organization-unlink', '[role="dialog"]');
  await unlink.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(unlink).toBeHidden();
  await expect(connections).toHaveCount(0);
  await expectOkJson(await apiGet(page, `/nodes/${person.id}`), 'Member retained after unlink');
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  const trash = page.getByRole('dialog');
  await expect(trash.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.route(`**/api/v1/nodes/${org.id}`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, json: { error: 'Trash temporarily unavailable' } })
      : route.continue(),
  );
  await trash.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(trash.getByText('Couldn’t move this organization to Trash')).toBeVisible();
  await capture(page, info, 'organization-trash-retry', '[role="dialog"]');
  await page.unroute(`**/api/v1/nodes/${org.id}`);
  await trash.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page).toHaveURL(/\/data\/trash$/);
  expect(errors).toEqual([]);
});
