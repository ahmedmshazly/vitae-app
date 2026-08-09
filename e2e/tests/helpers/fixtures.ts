import { expect, type Page } from '@playwright/test';
import { apiDelete, apiGet, apiPost, expectOkJson } from './api.js';

/**
 * Preconditions a spec needs, created through the API rather than assumed.
 *
 * `pnpm seed` produces a graph with no reminders, no open tasks and a handful
 * of interactions, which is correct, and is the documented baseline. Tests
 * that only pass once fifteen gate runs have littered the database are not
 * testing anything, so anything a spec needs, it makes.
 *
 * All helpers honor the page's current `vitae.space` via `x-vitae-space`.
 */

/** Capture a line through the same endpoint ⌘K uses. Returns nothing useful;
 * the point is the side effect on Today's queue. */
export async function capture(page: Page, raw: string): Promise<void> {
  const res = await apiPost(page, '/capture', { raw });
  await expectOkJson(res, 'capture');
}

/**
 * Guarantee at least `min` rows in Today's "Needs you" queue, and return how
 * many there are. Captured tasks carry a due date, which is what puts them in
 * the queue and gives each row a date to render.
 */
export async function ensureQueue(page: Page, min = 1): Promise<number> {
  const stamp = Date.now();
  for (let i = 0; i < min; i += 1) {
    await capture(page, `t E2E queue item ${stamp}-${i} ^today`);
  }
  await page.goto('/');
  const heading = page.getByRole('heading', { name: /^Needs you/ });
  await expect(heading).toBeVisible();
  return Number((await heading.innerText()).replace(/\D/g, ''));
}

/** Log `count` interactions against a person, so a history-dependent
 * assertion has a history to depend on. */
export async function logInteractions(page: Page, personId: string, count: number): Promise<void> {
  const stamp = Date.now();
  for (let i = 0; i < count; i += 1) {
    const res = await apiPost(page, '/interactions', {
      personId,
      kind: i % 2 === 0 ? 'coffee' : 'call',
      summary: `E2E interaction ${stamp}-${i}`,
      // Spread across days so the register rule has a real span to plot.
      occurredAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      idempotencyKey: `e2e-${stamp}-${i}`,
    });
    await expectOkJson(res, 'interaction');
  }
}

/**
 * An ongoing role, a span with a start and no end. The seeded graph has none,
 * so the state that says "still going" cannot be asserted without making one.
 * Returns the node id so the spec can delete it again.
 */
export async function createOngoingRole(page: Page, title: string): Promise<string> {
  const res = await apiPost(page, '/nodes', {
    type: 'role',
    title,
    props: { employment_type: 'full_time' },
    start_date: '2024-02-01',
    status: 'active',
  });
  const { node } = await expectOkJson<{ node: { id: string } }>(res, 'ongoing role');
  const roleId = node.id;

  // The timeline shows the *owner's* dated records, and ownership is derived
  // from each type's declared subject edge, a role nobody HELD belongs to
  // nobody, so an unlinked one never appears at all.
  const me = await apiGet(page, '/auth/me');
  const { self } = await expectOkJson<{ self: { id: string } | null }>(me, 'auth/me');
  expect(self, 'the seeded graph has no self person').toBeTruthy();
  const edge = await apiPost(page, '/edges', {
    type: 'HELD',
    src: self!.id,
    dst: roleId,
    props: {},
  });
  await expectOkJson(edge, 'HELD edge');
  return roleId;
}

export async function deleteNode(page: Page, id: string): Promise<void> {
  await apiDelete(page, `/nodes/${id}`);
}

/**
 * Records planted for a search spec: two people who share a title (the case
 * search exists to resolve) and an organization, all carrying one nonsense
 * token so the query matches these and nothing else. Stamped per run and
 * deleted afterwards, a fixture that accumulates changes the result counts of
 * every later run, which is how a search spec quietly stops meaning anything.
 */
export interface SearchFixture {
  token: string;
  twinTitle: string;
  orgTitle: string;
  ids: string[];
}

export async function createSearchFixture(page: Page): Promise<SearchFixture> {
  const token = `zqxfind${Date.now()}`;
  const twinTitle = `${token} Twin`;
  const orgTitle = `${token} Works`;
  const wanted = [
    { type: 'person', title: twinTitle, props: { city: 'Berlin', headline: 'First of the two' } },
    { type: 'person', title: twinTitle, props: { city: 'Lisbon', headline: 'Second of the two' } },
    { type: 'organization', title: orgTitle, props: {} },
  ];
  const ids: string[] = [];
  for (const data of wanted) {
    const res = await apiPost(page, '/nodes', data);
    const { node } = await expectOkJson<{ node: { id: string } }>(res, 'fixture create');
    ids.push(node.id);
  }
  return { token, twinTitle, orgTitle, ids };
}

export async function deleteSearchFixture(page: Page, fixture: SearchFixture): Promise<void> {
  for (const id of fixture.ids) await deleteNode(page, id);
}

/**
 * Link an open role to an organization. No seeded org has one, and "open
 * roles" is the fact that makes an org worth acting on, so the spec that
 * asserts it is surfaced has to create one.
 */
export async function addOpenRole(page: Page, orgId: string, title: string): Promise<void> {
  const role = await apiPost(page, '/nodes', {
    type: 'role',
    title,
    props: { open: true, employment_type: 'full_time' },
  });
  const { node } = await expectOkJson<{ node: { id: string } }>(role, 'create role');
  const roleId = node.id;

  // The org profile counts roles reachable by an inbound ROLE_AT edge.
  const edge = await apiPost(page, '/edges', {
    type: 'ROLE_AT',
    src: roleId,
    dst: orgId,
    props: {},
  });
  await expectOkJson(edge, 'link role');
}
