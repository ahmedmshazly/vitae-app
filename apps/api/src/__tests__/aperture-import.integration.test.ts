/**
 * Aperture → Vitae round trip, against the isolated Postgres test database.
 *
 * The properties this defends, in order of how expensive they are to get wrong:
 *
 *   1. Importing the same bundle twice does not duplicate anything. Scraping is
 *      re-run constantly; without stable external identities every re-export
 *      would fork the graph.
 *   2. Records land attached to the person they belong to, not to me. That is
 *      the whole point of the exercise.
 *   3. Rollback removes the batch completely, edges included.
 *
 * The global setup requires Postgres. It may not silently skip locally or in CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { requireSessionToken } from './helpers/app.js';

// Never conditionally skipped: vitest.global-setup.ts refuses to start without
// Postgres, so an unreachable database fails the run instead of quietly
// reducing it to nothing.
const d = describe;

const GOLDEN = fileURLToPath(new URL('../../../../fixtures/vitae-bundle.golden.json', import.meta.url));
const bundleText = readFileSync(GOLDEN, 'utf8');

/** A bundle emitted by Aperture's real projection code, not hand-written. */
const PRODUCED = fileURLToPath(new URL('../../../../fixtures/aperture-produced.sample.json', import.meta.url));
const producedText = readFileSync(PRODUCED, 'utf8');

interface StageResp {
  batch: { id: string; kind: string; detail: string | null; stats: { rows: number; accepted: number } };
  rows: Array<{ id: string; entity: string; title: string; ref: string | null; node_type: string | null; decision: string }>;
}

let app: Express;
let token: string;

/**
 * Counting assertions only mean something against a known slate, and the
 * test database keeps state between runs. Purge exactly this suite's footprint.
 * anything sourced from an Aperture import, and nothing else, so a shared
 * test database stays safe for the other suites.
 */
async function purgeApertureRecords(): Promise<void> {
  const { repository } = await import('../db/repository.js');
  const nodes = await repository.allLiveNodes();
  await repository.purgeNodes(nodes.filter((n) => n.source === 'import_aperture').map((n) => n.id));
  const edges = await repository.allLiveEdges();
  await repository.purgeEdges(edges.filter((e) => e.source === 'import_aperture').map((e) => e.id));
  // `kind` is not a promoted column, only status and created_at are indexed on
  // imports, so filter in memory rather than adding an index for a test.
  // import_rows / import_raw_chunks go with the batch via ON DELETE CASCADE.
  const batches = await repository.docList<{ id: string; kind?: string }>('imports');
  await repository.docDeleteMany(
    'imports',
    batches.filter((b) => b.kind === 'aperture').map((b) => b.id),
  );
}

async function countApertureEdges(): Promise<number> {
  const { repository } = await import('../db/repository.js');
  const edges = await repository.allLiveEdges();
  return edges.filter((e) => e.source === 'import_aperture').length;
}

async function countNodes(type: string): Promise<number> {
  const res = await request(app).get(`/api/v1/nodes?type=${type}&limit=1000`).set('authorization', `Bearer ${token}`);
  return (res.body.nodes as unknown[]).length;
}

/** Stage the golden bundle and commit every row. */
async function importGolden(): Promise<{ batchId: string; created: number }> {
  const staged = await request(app)
    .post('/api/v1/imports')
    .set('authorization', `Bearer ${token}`)
    .send({ kind: 'aperture', filename: 'vitae-bundle.json', content: bundleText })
    .expect(201);
  const { batch } = staged.body as StageResp;
  const committed = await request(app)
    .post(`/api/v1/imports/${batch.id}/commit`)
    .set('authorization', `Bearer ${token}`)
    .expect(200);
  return { batchId: batch.id, created: committed.body.created as number };
}

d('Aperture bundle import (integration)', () => {
  beforeAll(async () => {
    process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
    const { createApp } = await import('../app.js');
    app = createApp();
    token = requireSessionToken(await request(app).post('/api/v1/auth/dev-login'));

    await purgeApertureRecords();
  }, 60_000);

  it('stages every bundle node as a reviewable row', async () => {
    const res = await request(app)
      .post('/api/v1/imports')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'aperture', filename: 'vitae-bundle.json', content: bundleText })
      .expect(201);
    const { batch, rows } = res.body as StageResp;

    expect(batch.kind).toBe('aperture');
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.entity === 'graph_node')).toBe(true);
    // Refs must survive staging or the edge pass has nothing to resolve against.
    expect(rows.every((r) => typeof r.ref === 'string' && r.ref.length > 0)).toBe(true);
    expect(new Set(rows.map((r) => r.node_type))).toContain('post');

    await request(app).post(`/api/v1/imports/${batch.id}/discard`).set('authorization', `Bearer ${token}`).expect(200);
  }, 60_000);

  it('rejects content that is not a bundle, with a reason', async () => {
    const notJson = await request(app)
      .post('/api/v1/imports')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'aperture', content: 'this is not json' });
    expect(notJson.status).toBe(422);
    expect(notJson.body.error).toMatchObject({
      code: 'INVALID_IMPORT_CONTENT',
      message: expect.stringContaining('not valid JSON'),
    });

    const wrongShape = await request(app)
      .post('/api/v1/imports')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'aperture', content: JSON.stringify({ format: 'something.else', schema_version: 1 }) });
    expect(wrongShape.status).toBe(422);
    expect(wrongShape.body.error).toMatchObject({
      code: 'INVALID_IMPORT_CONTENT',
      message: expect.stringContaining('not a valid vitae.graph.bundle'),
    });
  }, 60_000);

  it('commits the bundle as linked atomic records', async () => {
    // Deliberately no assertion on the raw `created` count: the test database keeps
    // state across runs, so on a second pass every row is a known duplicate and
    // creates nothing. What must hold either way is the resulting graph.
    await importGolden();

    const people = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const jane = (people.body.nodes as Array<{ id: string; title: string; identity_keys?: string[]; source: string }>).find(
      (n) => n.title === 'Jane Smith',
    );
    expect(jane, 'the scraped person must exist').toBeDefined();
    expect(jane!.identity_keys).toContain('linkedin:person:jane-smith');
    expect(jane!.source).toBe('import_aperture');

    // The heart of it: the post, the role and the degree hang off Jane, not off
    // the owner of this Vitae instance.
    const detail = await request(app)
      .get(`/api/v1/nodes/${jane!.id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const edges = detail.body.edges as Array<{ type: string; src: string; dst: string }>;
    const neighbors = detail.body.neighbors as Record<string, { type: string; title: string }>;
    const outTo = (type: string) =>
      edges.filter((e) => e.type === type && e.src === jane!.id).map((e) => neighbors[e.dst]);

    expect(outTo('AUTHORED').map((n) => n?.type).sort()).toEqual(['post', 'post', 'publication']);
    expect(outTo('HELD')[0]?.title).toBe('Staff Engineer');
    expect(outTo('ATTENDED')[0]?.title).toBe('MSc, Computer Science');
    expect(outTo('MEMBER_OF')[0]?.title).toBe('IEEE');
    expect(outTo('FOLLOWS')[0]?.title).toBe('Acme Corp');
    expect(outTo('USES_SKILL')).toHaveLength(2);

    // Jane is imported, so she must NOT have been auto-claimed as someone I know.
    expect(edges.some((e) => e.type === 'KNOWS')).toBe(false);
  }, 90_000);

  it('re-importing the same bundle creates nothing new', async () => {
    const snapshot = async () => ({
      person: await countNodes('person'),
      post: await countNodes('post'),
      role: await countNodes('role'),
      education: await countNodes('education'),
      skill: await countNodes('skill'),
      organization: await countNodes('organization'),
      publication: await countNodes('publication'),
      // Edges matter as much as nodes here: keying an edge on the batch rather
      // than on (type, src, dst) would lay a second parallel edge every import
      // while every node count stayed reassuringly flat.
      edges: await countApertureEdges(),
    });

    const before = await snapshot();
    await importGolden();
    expect(await snapshot()).toEqual(before);
  }, 90_000);

  /**
   * The whole point, end to end: what Aperture's projection actually emits for
   * one scraped profile lands here as many linked records, each belonging to the
   * person it describes, with nothing attributed to the owner of this graph.
   */
  it("imports a real Aperture-produced bundle as someone else's records", async () => {
    await purgeApertureRecords();

    const staged = await request(app)
      .post('/api/v1/imports')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'aperture', filename: 'aperture-run.json', content: producedText })
      .expect(201);
    await request(app)
      .post(`/api/v1/imports/${staged.body.batch.id}/commit`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const people = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const jane = (people.body.nodes as Array<{ id: string; title: string }>).find((n) => n.title === 'Jane Smith');
    expect(jane).toBeDefined();

    const detail = await request(app)
      .get(`/api/v1/nodes/${jane!.id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const edges = detail.body.edges as Array<{ type: string; src: string }>;
    const outbound = new Set(edges.filter((e) => e.src === jane!.id).map((e) => e.type));

    // One scraped profile → a dozen kinds of relationship, all hers.
    expect(outbound).toEqual(
      new Set([
        'HELD',
        'ATTENDED',
        'USES_SKILL',
        'EARNED',
        'AUTHORED',
        'WORKED_ON',
        'COMPLETED',
        'MEMBER_OF',
        'FOLLOWS',
        'RECOMMENDS',
        'REACTED_TO',
        'RELATES_TO',
      ]),
    );
    // Never claimed as someone the owner knows.
    expect(outbound.has('KNOWS')).toBe(false);

    // And the job posting scraped separately resolves to the same employer node
    // her experience names, rather than a parallel copy.
    const orgs = await request(app)
      .get('/api/v1/nodes?type=organization&limit=1000')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const acme = (orgs.body.nodes as Array<{ title: string }>).filter((n) => n.title === 'Acme Corp');
    expect(acme).toHaveLength(1);
  }, 120_000);

  it('rolls a bundle back completely, edges included', async () => {
    // Self-contained: with idempotent ids, records belong to the batch that
    // first created them, so rolling back a later no-op import correctly
    // removes nothing. Start clean so this batch genuinely owns its records.
    await purgeApertureRecords();
    const { repository } = await import('../db/repository.js');
    const { batchId } = await importGolden();

    const edgesFor = async () =>
      (await repository.allLiveEdges()).filter((e) => e.source_ref === batchId).length;

    expect(await edgesFor(), 'the batch owns its edges').toBeGreaterThan(0);

    await request(app)
      .post(`/api/v1/imports/${batchId}/rollback`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(await edgesFor()).toBe(0);
    expect(await countNodes('post'), 'rollback removes the imported nodes too').toBe(0);

    // Rolling back is an undo, not a ban. Deterministic ids resolve to the
    // soft-deleted records, so without an explicit restore a re-import would
    // silently produce nothing at all.
    await importGolden();
    expect(await countNodes('post'), 're-import after rollback restores the records').toBe(2);
  }, 120_000);
});
