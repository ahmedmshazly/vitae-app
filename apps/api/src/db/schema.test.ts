/**
 * The five properties the Postgres schema is betting on (ADR 0005).
 *
 * The design stores each record whole in a `jsonb` column and derives the
 * queryable fields as GENERATED ALWAYS columns. That trade only pays if all of
 * these hold, and each one replaces something Firestore did for us:
 *
 *   1. documents round-trip exactly, or the migration loses data
 *   2. generated columns cannot be written, or an index can disagree with the record
 *   3. jsonb containment finds identity keys (replaces `array-contains`)
 *   4. `space` isolates demo from real (replaces the `demo_` collection prefix)
 *   5. FK cascade removes children (replaces `recursiveDelete`)
 *
 * Requires Postgres: `docker compose up -d postgres && pnpm --filter @vitae/api migrate`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from './pg.js';
import { repository } from './repository.js';
import { TABLES } from './schema.js';

/** The envelope from packages/core, as the repository actually writes it. */
const node = {
  id: 'n1',
  type: 'person',
  title: 'Jordan Park Kim',
  props: { emails: ['a@b.c'], socials: { gh: 'x' } },
  identity_keys: ['linkedin:person:jordan', 'github:user:jordan'],
  notes_md: '',
  date_precision: 'day',
  pinned: false,
  sensitivity: 'normal',
  source: 'manual',
  confidence: 1,
  captured_at: '2026-07-31T10:00:00.000Z',
  created_at: '2026-07-31T10:00:00.000Z',
  updated_at: '2026-07-31T10:00:00.000Z',
  archived_at: null,
  deleted_at: null,
  merged_into: null,
  rev: 1,
};

beforeAll(async () => {
  try {
    await sql`SELECT 1`.execute(db);
  } catch (error) {
    throw new Error(
      'Postgres is not reachable, so the schema suite cannot run and must not silently pass. ' +
        'Start it with `docker compose up -d postgres` and apply migrations with ' +
        `\`pnpm --filter @vitae/api migrate\`. Cause: ${(error as Error).message}`,
    );
  }
});

afterEach(async () => {
  // fileParallelism is off, so a blunt truncate is safe and keeps each test
  // independent of the order the others ran in.
  await sql.raw(`TRUNCATE ${TABLES.join(', ')} CASCADE`).execute(db);
});

afterAll(closeDb);

describe('jsonb document storage', () => {
  it('round-trips a record with every field and value intact', async () => {
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    const row = await db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', 'real')
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();

    expect(row.data).toEqual(node);
  });

  it('normalises key order, so bundle comparison must canonicalise', async () => {
    // `jsonb` is a parsed binary format, not stored text: it drops whitespace,
    // discards duplicate keys, and reorders keys (by length, then bytewise).
    // No value is lost, but a byte-for-byte diff of two exports would light up
    // for no reason. Pinned here so the migration's round-trip check is written
    // against sorted keys rather than raw output: `json` would preserve the
    // text exactly but gives up GIN indexing and the containment operator,
    // which is the whole reason identity-key lookup is fast.
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    const row = await db
      .selectFrom('nodes')
      .select('data')
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();

    const canonical = (v: unknown): string => JSON.stringify(v, Object.keys(node as object).sort());
    expect(canonical(row.data)).toBe(canonical(node));
  });

  it('preserves the difference between null and absent', async () => {
    // `subtitle` is `.optional()` in the core envelope and `deleted_at` is
    // `.nullable()`. Collapsing one into the other fails Zod validation on read:
    // an absent optional must stay absent, not become null.
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    const row = await db
      .selectFrom('nodes')
      .select('data')
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();
    const data = row.data as Record<string, unknown>;

    expect('subtitle' in data, 'an absent optional must not materialise as null').toBe(false);
    expect(data.deleted_at, 'an explicit null must survive as null').toBeNull();
  });
});

describe('generated columns', () => {
  it('derive themselves from the document', async () => {
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    const row = await db
      .selectFrom('nodes')
      .select(['type', 'title', 'deleted_at', 'merged_into'])
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();

    expect(row.type).toBe('person');
    expect(row.title).toBe('Jordan Park Kim');
    expect(row.deleted_at).toBeNull();
    expect(row.merged_into).toBeNull();
  });

  it('cannot be written, so an index can never disagree with the record', async () => {
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    await expect(
      sql`UPDATE nodes SET type = 'organization' WHERE id = 'n1'`.execute(db),
    ).rejects.toThrow(/can only be updated to DEFAULT/i);
  });

  it('follow the document when it changes', async () => {
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    await db
      .updateTable('nodes')
      .set({ data: { ...node, deleted_at: '2026-08-01T00:00:00.000Z' } })
      .where('id', '=', 'n1')
      .execute();

    const row = await db
      .selectFrom('nodes')
      .select('deleted_at')
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('docMerge', () => {
  it('creates the document when it is absent', async () => {
    // Firestore's set(doc, {merge:true}) upserts, and every call site was
    // written against that. A plain UPDATE against a missing row *succeeds*
    // while doing nothing, so the failure surfaces somewhere else entirely.
    // the duplicate scanner claimed its lease this way, never created
    // meta/dedup_scan, and then died on a foreign key writing its results.
    await repository.docMerge('meta', 'lease', { status: 'running', run_id: 'r1' });

    expect(await repository.docGet('meta', 'lease')).toEqual({
      status: 'running',
      run_id: 'r1',
    });
  });

  it('merges into an existing document without dropping untouched keys', async () => {
    await repository.docPut('meta', 'lease', { status: 'running', run_id: 'r1', started_at: 't0' });
    await repository.docMerge('meta', 'lease', { status: 'complete' });

    expect(await repository.docGet('meta', 'lease')).toEqual({
      status: 'complete',
      run_id: 'r1',
      started_at: 't0',
    });
  });

  it('lets a child row be written once its parent exists', async () => {
    // The end-to-end shape of the bug: results hang off a meta document by
    // foreign key, so the lease claim has to have created it.
    await repository.docMerge('meta', 'dedup_scan', { status: 'running' });
    await repository.docBulkPut('meta_runs', [
      { id: 'run1:pair1', data: { run_id: 'run1' }, extra: { meta_id: 'dedup_scan' } },
    ]);

    expect(await repository.docQuery('meta_runs', { meta_id: 'dedup_scan', run_id: 'run1' })).toHaveLength(1);
  });
});

describe('identity keys', () => {
  it('are findable by containment, replacing array-contains', async () => {
    await db.insertInto('nodes').values({ space: 'real', id: 'n1', data: node }).execute();
    const hits = await db
      .selectFrom('nodes')
      .select('id')
      .where('space', '=', 'real')
      .where(sql<boolean>`data -> 'identity_keys' @> ${JSON.stringify(['github:user:jordan'])}::jsonb`)
      .execute();

    expect(hits.map((h) => h.id)).toEqual(['n1']);
  });
});

describe('data spaces', () => {
  it('let demo and real hold the same id without colliding', async () => {
    await db
      .insertInto('nodes')
      .values([
        { space: 'real', id: 'n1', data: node },
        { space: 'demo', id: 'n1', data: { ...node, title: 'DEMO COPY' } },
      ])
      .execute();

    const real = await db
      .selectFrom('nodes')
      .select('title')
      .where('space', '=', 'real')
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow();

    expect(real.title).toBe('Jordan Park Kim');
    const all = await db.selectFrom('nodes').select('id').where('id', '=', 'n1').execute();
    expect(all).toHaveLength(2);
  });
});

describe('import subcollections', () => {
  it('cascade on delete, replacing recursiveDelete', async () => {
    await db.insertInto('imports').values({ space: 'real', id: 'imp1', data: { id: 'imp1', status: 'staged' } }).execute();
    await db
      .insertInto('import_rows')
      .values({ space: 'real', id: 'r1', import_id: 'imp1', data: { id: 'r1' } })
      .execute();

    await db.deleteFrom('imports').where('space', '=', 'real').where('id', '=', 'imp1').execute();

    const rows = await db.selectFrom('import_rows').select('id').execute();
    expect(rows, 'rows must not outlive the import they belong to').toHaveLength(0);
  });

  it('refuses a row whose import does not exist', async () => {
    await expect(
      db
        .insertInto('import_rows')
        .values({ space: 'real', id: 'r1', import_id: 'ghost', data: { id: 'r1' } })
        .execute(),
    ).rejects.toThrow(/foreign key/i);
  });
});
