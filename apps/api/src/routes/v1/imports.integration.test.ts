/**
 * Imports route: staging and discarding, and the longitudinal half of
 * re-import (FR-SYNC-001, FR-SYNC-002).
 *
 * What the longitudinal suite defends, in order of how expensive it is to get
 * wrong:
 *
 *   1. Importing the same address book twice does not fork the person. Address
 *      books are re-exported constantly, and without a stable identity every
 *      export would lay another copy beside the last.
 *   2. A row that differs writes nothing until somebody accepts it, and a
 *      rejected proposal leaves the record exactly as it was.
 *   3. Rolling back puts changed fields back, per node, and refuses a record
 *      somebody has edited since instead of clobbering their work.
 *
 * The global setup requires Postgres. It may not silently skip locally or in CI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('imports routes', () => {
  it('rejects unauthenticated stage', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/imports')
      .send({ kind: 'contacts', filename: 'x.csv', content: 'Name,Email\nA,a@b.c' });
    expect(res.status).toBe(401);
  });

  it('stages a contacts CSV and discards the batch', async () => {
    const { app, token } = await getAuthedApp();
    const csv = 'Name,Email\nImport Split Person,import.split@example.com\n';
    const staged = await request(app)
      .post('/api/v1/imports')
      .set(authHeader(token))
      .send({ kind: 'contacts', filename: 'split.csv', content: csv })
      .expect(201);
    expect(staged.body.batch.stats.rows).toBeGreaterThan(0);
    const id = staged.body.batch.id as string;

    await request(app).post(`/api/v1/imports/${id}/discard`).set(authHeader(token)).expect(200);
  });
});

const FIXTURE_EMAIL = 'longitudinal.fixture@sync.test';
const FIXTURE_KEY = `contact:email:${FIXTURE_EMAIL}`;
const SECOND_EMAIL = 'longitudinal.second@sync.test';
const SECOND_KEY = `contact:email:${SECOND_EMAIL}`;

/** One card for a person an address book identifies by their email address. */
function card(name: string, email: string, city: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `FN:${name}`,
    `EMAIL:${email}`,
    `ADR:;;;${city};;;`,
    'END:VCARD',
  ].join('\n');
}

interface StagedRow {
  id: string;
  title: string;
  decision: 'accept' | 'skip';
  dup: { nodeId: string; verdict: string; evidence: string[] } | null;
  proposal: {
    identity_key: string;
    target_node_id: string;
    target_rev: number;
    fields: Array<{ key: string; from: unknown; to: unknown }>;
    accepted: string[];
  } | null;
}

interface CommitResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

let app: Express;
let token: string;

async function stageCards(content: string): Promise<{ batchId: string; rows: StagedRow[] }> {
  const res = await request(app)
    .post('/api/v1/imports')
    .set(authHeader(token))
    .send({ kind: 'contacts', filename: 'longitudinal.vcf', content })
    .expect(201);
  return { batchId: res.body.batch.id as string, rows: res.body.rows as StagedRow[] };
}

async function commitBatch(batchId: string): Promise<CommitResult> {
  const res = await request(app)
    .post(`/api/v1/imports/${batchId}/commit`)
    .set(authHeader(token))
    .expect(200);
  return res.body as CommitResult;
}

async function setRow(
  batchId: string,
  rowId: string,
  body: { decision?: 'accept' | 'skip'; fields?: string[] },
): Promise<void> {
  await request(app)
    .patch(`/api/v1/imports/${batchId}/rows/${rowId}`)
    .set(authHeader(token))
    .send(body)
    .expect(200);
}

async function node(id: string): Promise<Record<string, unknown>> {
  const res = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);
  return res.body.node as Record<string, unknown>;
}

async function peopleNamed(name: string): Promise<Array<{ id: string }>> {
  const res = await request(app)
    .get('/api/v1/nodes?type=person&limit=1000')
    .set(authHeader(token))
    .expect(200);
  return (res.body.nodes as Array<{ id: string; title: string }>).filter((n) => n.title === name);
}

/**
 * Counting assertions only mean something against a known slate, and the test
 * database keeps state between runs. Remove exactly this suite's footprint and
 * nothing else, so a shared test database stays safe for the other suites.
 */
async function purgeFixture(): Promise<void> {
  const { repository } = await import('../../db/repository.js');
  const nodes = await repository.allLiveNodes();
  const mine = nodes.filter((n) => (n.identity_keys ?? []).some((k) => k === FIXTURE_KEY || k === SECOND_KEY));
  const edges = await repository.allLiveEdges();
  await repository.purgeEdges(
    edges.filter((e) => mine.some((n) => n.id === e.src || n.id === e.dst)).map((e) => e.id),
  );
  await repository.purgeNodes(mine.map((n) => n.id));
  const batches = await repository.docList<{ id: string; filename?: string }>('imports');
  await repository.docDeleteMany(
    'imports',
    batches.filter((b) => b.filename === 'longitudinal.vcf').map((b) => b.id),
  );
}

describe('re-import is longitudinal', () => {
  beforeAll(async () => {
    ({ app, token } = await getAuthedApp());
    await purgeFixture();
  }, 60_000);

  afterAll(async () => {
    await purgeFixture();
  }, 60_000);

  it('creates on the first import and converges silently on the second', async () => {
    const first = await stageCards(card('Longitudinal Fixture', FIXTURE_EMAIL, 'Cairo'));
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]!.dup).toBeNull();
    expect(first.rows[0]!.proposal).toBeNull();
    expect(first.rows[0]!.decision).toBe('accept');
    expect(await commitBatch(first.batchId)).toMatchObject({ created: 1, updated: 0, unchanged: 0 });

    const second = await stageCards(card('Longitudinal Fixture', FIXTURE_EMAIL, 'Cairo'));
    expect(second.rows[0]!.proposal).toMatchObject({ identity_key: FIXTURE_KEY, fields: [] });
    expect(second.rows[0]!.dup?.evidence[0]).toContain(FIXTURE_KEY);
    expect(await commitBatch(second.batchId)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      skipped: 0,
    });

    expect(await peopleNamed('Longitudinal Fixture')).toHaveLength(1);
  }, 90_000);

  it('offers a changed row as a per-field diff and writes nothing until it is accepted', async () => {
    const staged = await stageCards(card('Longitudinal Fixture', FIXTURE_EMAIL, 'Berlin'));
    const row = staged.rows[0]!;
    expect(row.proposal!.fields).toEqual([{ key: 'props.city', from: 'Cairo', to: 'Berlin' }]);
    // Nothing updates without acceptance, so a proposal arrives skipped.
    expect(row.decision).toBe('skip');

    const targetId = row.proposal!.target_node_id;
    const before = await node(targetId);
    expect(await commitBatch(staged.batchId)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 1,
    });
    expect(await node(targetId)).toEqual(before);
  }, 90_000);

  it('leaves the record untouched when every field of the proposal is rejected', async () => {
    const staged = await stageCards(card('Longitudinal Fixture', FIXTURE_EMAIL, 'Berlin'));
    const row = staged.rows[0]!;
    const before = await node(row.proposal!.target_node_id);

    await setRow(staged.batchId, row.id, { decision: 'accept', fields: [] });
    expect(await commitBatch(staged.batchId)).toMatchObject({ updated: 0, skipped: 1 });
    expect(await node(row.proposal!.target_node_id)).toEqual(before);
  }, 90_000);

  it('applies an accepted proposal and puts the old value back on rollback', async () => {
    const staged = await stageCards(card('Longitudinal Fixture', FIXTURE_EMAIL, 'Berlin'));
    const row = staged.rows[0]!;
    const targetId = row.proposal!.target_node_id;

    await setRow(staged.batchId, row.id, { decision: 'accept' });
    expect(await commitBatch(staged.batchId)).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
    });
    expect((await node(targetId)).props).toMatchObject({ city: 'Berlin' });

    const rolled = await request(app)
      .post(`/api/v1/imports/${staged.batchId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolled.body).toMatchObject({ removed: 0, restored: 1 });
    expect(rolled.body.refused).toEqual([]);
    // The record still exists; only the field the import changed went back.
    expect((await node(targetId)).props).toMatchObject({ city: 'Cairo' });
  }, 90_000);

  it('refuses to roll back a record edited since the import, and rolls back the rest', async () => {
    const two = [
      card('Longitudinal Fixture', FIXTURE_EMAIL, 'Lisbon'),
      card('Longitudinal Second', SECOND_EMAIL, 'Nairobi'),
    ].join('\n');
    const staged = await stageCards(two);
    const update = staged.rows.find((r) => r.proposal)!;
    const create = staged.rows.find((r) => !r.proposal)!;
    const targetId = update.proposal!.target_node_id;
    // A row with nothing to converge on is still a plain create, accepted by default.
    expect(create.decision).toBe('accept');

    await setRow(staged.batchId, update.id, { decision: 'accept' });
    expect(await commitBatch(staged.batchId)).toMatchObject({ created: 1, updated: 1 });

    // Somebody edits the updated record after the import lands.
    await request(app)
      .patch(`/api/v1/nodes/${targetId}`)
      .set(authHeader(token))
      .send({ notes_md: 'edited by hand after the import' })
      .expect(200);

    const rolled = await request(app)
      .post(`/api/v1/imports/${staged.batchId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolled.body.restored).toBe(0);
    expect(rolled.body.refused).toHaveLength(1);
    expect(rolled.body.refused[0].reason).toContain('edited after the import');

    // The hand edit survives, and so does the value the import wrote under it.
    const kept = await node(targetId);
    expect(kept.notes_md).toBe('edited by hand after the import');
    expect(kept.props).toMatchObject({ city: 'Lisbon' });
    // The record the batch created is gone all the same.
    expect(await peopleNamed('Longitudinal Second')).toHaveLength(0);
  }, 90_000);

  it('reads the trail every write above left, for many subjects in one query', async () => {
    const { repository } = await import('../../db/repository.js');
    const fixtureId = (await peopleNamed('Longitudinal Fixture'))[0]!.id;
    const trails = await repository.revisionsForMany([fixtureId, 'no-such-record']);

    // An id with nothing retained is present and empty rather than missing.
    // A caller has to be able to tell that apart from having forgotten to ask.
    expect([...trails.keys()].sort()).toEqual([fixtureId, 'no-such-record'].sort());
    expect(trails.get('no-such-record')).toEqual([]);

    const trail = trails.get(fixtureId)!;
    const revs = trail.map((r) => Number(r.rev));
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    expect(trail[0]!.op).toBe('create');
    // Created by an import, changed by an accepted proposal, put back by a
    // rollback: every step of this suite is in the record's own history.
    expect(trail.some((r) => r.actor === 'import')).toBe(true);
    expect(trail.some((r) => r.actor === 'import-rollback')).toBe(true);
  }, 60_000);

  it('asks nothing of the database when the list of subjects is empty', async () => {
    // `IN ()` is a syntax error in Postgres, so an empty ask must not become a
    // query at all.
    const { repository } = await import('../../db/repository.js');
    expect(await repository.revisionsForMany([])).toEqual(new Map());
  }, 60_000);
});
