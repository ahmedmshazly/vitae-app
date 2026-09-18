import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiDelete, apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test.use({ reducedMotion: 'reduce' });

// Synthetic evidence for repeatable layout checks; no personal installation data.
const title =
  'Promotion review — community research, accessible recommendations and sustained delivery across the regional partnership';
const claim =
  'Led the community research programme, consolidated interviews into accessible recommendations, and coordinated follow-up commitments with regional partners.';
const section = {
  id: 'scope',
  heading: 'Scope',
  purpose: 'The work you owned and the people it reached.',
  admits: ['role', 'project'],
  admitsAtoms: false,
  minClaims: 1,
  maxClaims: 6,
  minCitationsPerClaim: 1,
  maxCitationsPerClaim: null,
  required: true,
};
const record = {
  kind: 'node',
  id: 'evidence-project',
  presence: 'live',
  type: 'project',
  label: 'Community research and shared findings across regional partnerships',
  source: 'manual',
  confidence: 0.9,
  revisions: [
    { rev: 1, at: '2026-08-01T10:00:00Z', op: 'create', source: 'manual', actor: 'owner' },
  ],
};
const dossier = {
  id: 'dossier-layout',
  subject_node: 'self',
  audience: 'promotion_review',
  title,
  sections: [
    {
      grammar_id: 'scope',
      claims: [{ id: 'entry-1', text: claim, cites: [{ kind: 'node', id: record.id }] }],
    },
  ],
  rev: 1,
  tex_key: null,
  pdf_key: null,
  deleted_at: null,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
};
const compiled = {
  dossier,
  subject: { id: 'self', title: 'Sam Rivera' },
  sections: [
    {
      grammar_id: 'scope',
      heading: 'Scope',
      purpose: section.purpose,
      claims: [{ id: 'entry-1', text: claim, cites: [record] }],
    },
  ],
  appendix: [record],
  violations: [],
  blocking: false,
};
async function mockDossiers(page: Page) {
  await page.route('**/api/v1/dossiers**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/audiences')
      ? { audiences: [{ audience: 'promotion_review', sections: [section] }] }
      : path.endsWith('/compile')
        ? compiled
        : { dossiers: [dossier] };
    await route.fulfill({ json: body });
  });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}

test('Dossiers list, creation, selection, document, appendix and confirmations fit three sizes', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await signIn(page);
  await mockDossiers(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/career/dossiers');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`dossiers-list-${width}.png`) });
    await page.getByRole('button', { name: 'New dossier' }).click();
    const sheet = page.getByRole('dialog', { name: 'New dossier' });
    await expect(sheet.getByRole('radio', { name: 'Promotion review' })).toBeVisible();
    await expect(sheet).toHaveCSS('opacity', '1');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`dossiers-create-${width}.png`) });
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByLabel('The sentence this entry asserts')).toBeVisible();
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`dossiers-editor-${width}.png`) });
    await page.getByRole('link', { name: 'Edit selection' }).click();
    await page.screenshot({ path: info.outputPath(`dossiers-selection-${width}.png`) });
    await page
      .getByRole('group', { name: 'Add an entry to Scope', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath(`dossiers-entry-form-${width}.png`) });
    await page.getByRole('link', { name: 'Compiled document', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`dossiers-document-${width}.png`) });
    await page.getByRole('link', { name: /^Appendix entry 1/ }).click();
    await page.getByRole('button', { name: `Revision trail of ${record.label}` }).click();
    await page.screenshot({ path: info.outputPath(`dossiers-appendix-${width}.png`) });
    await noOverflow(page);
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Remove entry 1 from Scope' }).click();
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath(`dossiers-remove-entry-${width}.png`) });
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath(`dossiers-delete-${width}.png`) });
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  }
  expect(errors).toEqual([]);
});

test('Dossier drafts survive refresh failures, local jumps and failed deletes', async ({
  page,
}) => {
  await signIn(page);
  await mockDossiers(page);
  await page.goto('/career/dossiers/dossier-layout');
  const input = page.getByLabel('The sentence this entry asserts');
  await input.fill('A draft worth keeping.');
  await page.getByRole('link', { name: 'Compiled document', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(input).toHaveValue('A draft worth keeping.');
  await page.route('**/api/v1/dossiers/dossier-layout/compile', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Temporarily unavailable' } },
    }),
  );
  await page.getByRole('button', { name: 'Refresh dossier' }).click();
  await expect(page.getByText('Dossier could not refresh')).toBeVisible();
  await expect(input).toHaveValue('A draft worth keeping.');
  await page.getByRole('link', { name: 'Back to dossiers' }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.unroute('**/api/v1/dossiers/dossier-layout/compile');
  await page.getByRole('button', { name: 'Retry refresh' }).click();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await page.route('**/api/v1/dossiers/dossier-layout', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Delete unavailable' } },
    }),
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete this dossier' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Delete unavailable');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(input).toHaveValue('A draft worth keeping.');
});

test('A real dossier can be created, cited, reloaded and removed through the interface', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const created = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'project',
      title: `Dossier evidence ${stamp}`,
      props: {},
    }),
    'project',
  );
  await page.goto('/career/dossiers');
  await page.getByRole('button', { name: 'New dossier' }).first().click();
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill(`Dossier browser proof ${stamp}`);
  await page.getByRole('radio', { name: 'Promotion review' }).click();
  await page.getByRole('button', { name: 'Create dossier' }).click();
  await expect(page).toHaveURL(/\/career\/dossiers\/[^/]+$/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const form = page.getByRole('group', { name: 'Add an entry to Scope', exact: true });
  await form
    .getByLabel('The sentence this entry asserts')
    .fill('I coordinated the evidence review.');
  await form.getByRole('combobox').fill(`Dossier evidence ${stamp}`);
  await page
    .getByRole('option')
    .filter({ hasText: `Dossier evidence ${stamp}` })
    .click();
  await form.getByRole('button', { name: 'Add this entry to Scope' }).click();
  await expect(form.getByLabel('The sentence this entry asserts')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('list', { name: 'Scope, as compiled' })).toContainText(
    'I coordinated the evidence review.',
  );
  await expect(page.getByRole('list', { name: 'Provenance appendix' })).toContainText(
    `Dossier evidence ${stamp}`,
  );
  await page.getByRole('button', { name: 'Remove entry 1 from Scope' }).click();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
  await expect(page.getByText('Nothing in this section yet.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete this dossier' }).click();
  await expect(page).toHaveURL(/\/career\/dossiers$/);
  const gone = await apiGet(page, `/dossiers/${id}/compile`);
  expect(gone.status()).toBe(404);
  expect((await apiGet(page, `/nodes/${created.node.id}`)).ok()).toBe(true);
  await apiDelete(page, `/nodes/${created.node.id}`);
});
