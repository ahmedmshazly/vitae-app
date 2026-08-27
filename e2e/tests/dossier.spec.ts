import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { apiPost, apiGet, apiDelete, expectOkJson } from './helpers/api.js';

/**
 * J5, prove it with a dossier (FR-DOS-001, FR-DOS-002).
 *
 * The walk that matters is not "a document was produced". It is that every
 * claim in the document points at the records underneath it, and that the
 * appendix keeps telling the truth about those records after they change. So
 * the third case here deletes a cited record and comes back: the citation
 * still prints, marked withdrawn, with its history intact, and the document
 * still compiles. A reader is better served knowing evidence was withdrawn
 * than not knowing it was ever there.
 */

const SECTION = 'Impact';

async function record(page: Page, type: string, title: string, props: Record<string, unknown> = {}) {
  const created = await apiPost(page, '/nodes', { type, title, props });
  const { node } = await expectOkJson<{ node: { id: string } }>(created, `${type} record`);
  return node.id;
}

/** A promotion packet that satisfies its grammar, so violations mean something. */
async function dossier(page: Page, stamp: number) {
  const self = await expectOkJson<{ self: { id: string } | null }>(
    await apiGet(page, '/auth/me'),
    'self',
  );
  expect(self.self, 'the seeded graph names a self record').not.toBeNull();
  const scope = await record(page, 'role', `Dossier role ${stamp}`, { employment_type: 'full_time' });
  const first = await record(page, 'project', `Dossier project ${stamp}`);
  const second = await record(page, 'project', `Dossier second ${stamp}`);
  const created = await apiPost(page, '/dossiers', {
    subject_node: self.self!.id,
    audience: 'promotion_review',
    title: `Promotion packet ${stamp}`,
    sections: [
      {
        grammar_id: 'scope',
        claims: [{ id: 's1', text: 'Owned the serving path.', cites: [{ kind: 'node', id: scope }] }],
      },
      {
        grammar_id: 'impact',
        claims: [
          { id: 'i1', text: 'Cut latency across the fleet.', cites: [{ kind: 'node', id: first }] },
          { id: 'i2', text: 'Shipped the benchmark.', cites: [{ kind: 'node', id: second }] },
        ],
      },
    ],
  });
  const body = await expectOkJson<{ dossier: { id: string } }>(created, 'dossier');
  return { id: body.dossier.id, scope, first, second };
}

test('J5: the list names each packet by the audience it is written for', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  await dossier(page, stamp);
  await page.goto('/career/dossiers');

  await expect(page.getByRole('heading', { level: 1, name: 'Dossiers' })).toBeVisible();
  const row = page.getByRole('link', { name: `Promotion packet ${stamp}` });
  await expect(row).toBeVisible();
  // The audience reads as a phrase. `promotion_review` never reaches a screen.
  await expect(page.getByText('Promotion review').first()).toBeVisible();
  // The crumb had no case for these paths and rendered "Not found" over a
  // working screen, which is the kind of defect only a real navigation shows.
  await expect(page.getByText('Not found')).toHaveCount(0);
});

test('J5: every claim carries a marker into the appendix that names its record', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const { id, first } = await dossier(page, stamp);
  await page.goto(`/career/dossiers/${id}`);

  await expect(page.getByRole('heading', { level: 1, name: `Promotion packet ${stamp}` })).toBeVisible();
  await expect(page.getByText('This dossier satisfies its grammar')).toBeVisible();

  // Grammar order, not the order the sections were stored in.
  const compiled = page.getByRole('list', { name: `${SECTION}, as compiled` });
  await expect(compiled).toBeVisible();

  const marker = page.getByRole('link', { name: new RegExp(`^Appendix entry \\d+, Dossier project ${stamp}$`) });
  await expect(marker).toBeVisible();
  const href = await marker.getAttribute('href');
  expect(href, 'the marker points into the appendix').toMatch(/^#dossier-appendix-\d+$/);

  const appendix = page.getByRole('list', { name: 'Provenance appendix' });
  await expect(appendix.locator(`#${href!.slice(1)}`)).toContainText(`Dossier project ${stamp}`);
  await expect(appendix.locator(`#${href!.slice(1)}`)).toContainText('in the graph');
  // The trail is real history, read back from the revisions the create wrote.
  await appendix.getByRole('button', { name: `Revision trail of Dossier project ${stamp}` }).click();
  await expect(page.getByRole('list', { name: `Revisions of Dossier project ${stamp}` })).toBeVisible();
  void first;
});

test('J5: a withdrawn record still prints, and the document still compiles', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const { id, first } = await dossier(page, stamp);
  // Deleted after the dossier cited it, which is the case the appendix exists
  // to survive rather than to hide.
  const removed = await apiDelete(page, `/nodes/${first}`);
  expect(removed.ok(), 'the cited record was deleted').toBe(true);

  await page.goto(`/career/dossiers/${id}`);
  const appendix = page.getByRole('list', { name: 'Provenance appendix' });
  await expect(appendix.getByText('withdrawn').first()).toBeVisible();
  await expect(
    page.getByText(
      'This record was deleted after the dossier cited it. The citation stands and prints, because a reader is better served knowing the evidence was withdrawn than not knowing it was ever there.',
    ),
  ).toBeVisible();

  // Non-blocking: the document is still a document.
  await expect(
    page.getByText('The document compiles, with evidence a reader cannot follow'),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: `${SECTION}, as compiled` })).toBeVisible();
  // A gap in the evidence is work to do, not a failure to load.
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('J5: the audiences differ in what their sections demand', async ({ page }) => {
  await signIn(page);
  await page.goto('/career/dossiers');
  await page.getByRole('button', { name: 'New dossier' }).click();

  // FR-DOS-002 is this: one selection format, three audiences, different rules
  // underneath. The sections are on screen before the audience is chosen.
  for (const audience of ['Promotion review', 'Petition exhibits', 'Background history']) {
    // The section list is aria-describedby the radio, so getByLabel matches both.
    await expect(page.getByRole('radio', { name: audience })).toBeVisible();
    await expect(
      page.getByRole('list', { name: `Sections of a ${audience} dossier` }),
    ).toBeVisible();
  }
  const promotion = page.getByRole('list', { name: 'Sections of a Promotion review dossier' });
  await expect(promotion.getByText('Impact')).toBeVisible();
  const exhibits = page.getByRole('list', { name: 'Sections of a Petition exhibits dossier' });
  await expect(exhibits.getByText('Exhibits')).toBeVisible();
  await expect(exhibits.getByText('Impact')).toHaveCount(0);
});

test('the dossier screens have no automated a11y violations', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const { id } = await dossier(page, stamp);
  await page.goto(`/career/dossiers/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Promotion packet ${stamp}` })).toBeVisible();
  await expectNoA11yViolations(page);
});
