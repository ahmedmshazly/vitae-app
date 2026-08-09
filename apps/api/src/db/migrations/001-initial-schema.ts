/**
 * The initial Postgres schema (ADR 0005), replacing Firestore.
 *
 * ## Why every table is `data jsonb` plus generated columns
 *
 * The obvious port is a typed column per field. It was rejected because the
 * risk here is not query performance, it is *fidelity*: the export bundle must
 * round-trip byte-identically or the migration silently loses data, and a
 * hand-written codec across 21 collections is 21 chances to drop a field.
 *
 * The repository already writes whole documents: `stageNodeUpdate` merges the
 * patch into the record and `set`s all of it, never a partial UPDATE, so a
 * single `jsonb` column matches the existing write model exactly and is
 * lossless by construction. Reads are `JSON.parse` for free (node-postgres
 * hands back a parsed object).
 *
 * The queryable fields are then GENERATED ALWAYS ... STORED columns derived from
 * `data`. They cannot drift from the document because Postgres computes them,
 * and they index like any ordinary column, so the joins and WHERE clauses that
 * Firestore could not do are available:
 *
 *     SELECT e.data FROM edges e JOIN nodes n ON n.space = e.space AND n.id = e.src
 *      WHERE e.space = $1 AND e.type = 'HELD' AND n.deleted_at IS NULL;
 *
 * ## Timestamps stay TEXT
 *
 * `nowIso()` writes ISO-8601 UTC with milliseconds. Those strings sort
 * lexicographically in exactly timestamp order, so `ORDER BY updated_at DESC`
 * and `deleted_at < $cutoff` behave identically to today. Converting to
 * `timestamptz` would buy date arithmetic we do not do, and cost a formatting
 * round-trip that could silently reshape every timestamp in the database.
 *
 * ## Data spaces
 *
 * `demo` is a `space` column (part of every primary key), injected by one query
 * helper. A forgotten filter is a missing-column error rather than a silent
 * data leak.
 */
import type { Kysely} from 'kysely';
import { sql } from 'kysely';

/** Columns every table carries: the space, the document id, the document. */
const BASE = sql`
  space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
  id    text NOT NULL,
  data  jsonb NOT NULL
`;

/**
 * A table whose only queried fields are promoted to generated columns.
 * `extra` is raw DDL appended inside the CREATE TABLE, `indexes` runs after.
 */
async function docTable(
  db: Kysely<unknown>,
  name: string,
  extra = sql``,
  indexes: string[] = [],
): Promise<void> {
  await sql`
    CREATE TABLE ${sql.raw(name)} (
      ${BASE}${extra},
      PRIMARY KEY (space, id)
    )
  `.execute(db);
  for (const idx of indexes) await sql.raw(idx).execute(db);
}

/** `data->>'field'`, stored so it can be indexed. */
const gen = (col: string, path = col) =>
  sql`, ${sql.raw(col)} text GENERATED ALWAYS AS (data->>${sql.lit(path)}) STORED`;

export async function up(db: Kysely<unknown>): Promise<void> {
  // Trigram search for the ⌘P quick-switcher and fuzzy title matching. Present
  // from the start so a later FTS change is a query change, not a migration.
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // ── Graph core ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE nodes (
      ${BASE},
      type        text GENERATED ALWAYS AS (data->>'type')        STORED NOT NULL,
      title       text GENERATED ALWAYS AS (data->>'title')       STORED NOT NULL,
      updated_at  text GENERATED ALWAYS AS (data->>'updated_at')  STORED,
      deleted_at  text GENERATED ALWAYS AS (data->>'deleted_at')  STORED,
      archived_at text GENERATED ALWAYS AS (data->>'archived_at') STORED,
      merged_into text GENERATED ALWAYS AS (data->>'merged_into') STORED,
      sensitivity text GENERATED ALWAYS AS (data->>'sensitivity') STORED,
      PRIMARY KEY (space, id)
    )
  `.execute(db);

  // listNodes: filter by type, newest first, live only. The partial index means
  // the soft-deleted rows are not even in it.
  await sql`
    CREATE INDEX nodes_live_type_updated ON nodes (space, type, updated_at DESC)
    WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX nodes_live_updated ON nodes (space, updated_at DESC)
    WHERE deleted_at IS NULL
  `.execute(db);
  // findByIdentityKey. A generated text[] is impossible (the conversion needs a
  // subquery, which generated columns forbid), so index the jsonb array itself
  // and query it with the containment operator: data->'identity_keys' @> '"k"'.
  await sql`
    CREATE INDEX nodes_identity_keys ON nodes
    USING gin ((data -> 'identity_keys') jsonb_path_ops)
  `.execute(db);
  await sql`CREATE INDEX nodes_props ON nodes USING gin ((data -> 'props') jsonb_path_ops)`.execute(db);
  await sql`CREATE INDEX nodes_title_trgm ON nodes USING gin (title gin_trgm_ops)`.execute(db);
  await sql`CREATE INDEX nodes_merged_into ON nodes (space, merged_into) WHERE merged_into IS NOT NULL`.execute(db);

  await sql`
    CREATE TABLE edges (
      ${BASE},
      type       text GENERATED ALWAYS AS (data->>'type')       STORED NOT NULL,
      src        text GENERATED ALWAYS AS (data->>'src')        STORED NOT NULL,
      dst        text GENERATED ALWAYS AS (data->>'dst')        STORED NOT NULL,
      updated_at text GENERATED ALWAYS AS (data->>'updated_at') STORED,
      deleted_at text GENERATED ALWAYS AS (data->>'deleted_at') STORED,
      PRIMARY KEY (space, id)
    )
  `.execute(db);
  // edgesForNode is two lookups today (one per direction) merged in memory;
  // these serve both halves, and let it become a single OR query.
  await sql`CREATE INDEX edges_src ON edges (space, src, type) WHERE deleted_at IS NULL`.execute(db);
  await sql`CREATE INDEX edges_dst ON edges (space, dst, type) WHERE deleted_at IS NULL`.execute(db);
  await sql`CREATE INDEX edges_type ON edges (space, type) WHERE deleted_at IS NULL`.execute(db);

  await docTable(
    db,
    'revisions',
    sql`${gen('subject_id')}${gen('subject_kind')}, rev integer GENERATED ALWAYS AS ((data->>'rev')::integer) STORED`,
    ['CREATE INDEX revisions_subject ON revisions (space, subject_id, rev)'],
  );

  // ── Résumé composition ────────────────────────────────────────────────────
  await docTable(db, 'atoms', sql`${gen('owner_node')}${gen('source_ref')}${gen('deleted_at')}`, [
    'CREATE INDEX atoms_owner ON atoms (space, owner_node)',
    'CREATE INDEX atoms_source_ref ON atoms (space, source_ref)',
  ]);
  await docTable(db, 'atom_variants', sql`${gen('atom_id')}`, [
    'CREATE INDEX atom_variants_atom ON atom_variants (space, atom_id)',
  ]);
  await docTable(db, 'atom_skills', sql`${gen('atom_id')}${gen('skill_id')}`, [
    'CREATE INDEX atom_skills_atom ON atom_skills (space, atom_id)',
  ]);
  await docTable(db, 'targets');
  await docTable(db, 'resumes');
  await docTable(db, 'templates');

  // ── CRM / organisation ────────────────────────────────────────────────────
  await docTable(db, 'reminders', sql`${gen('status')}${gen('due_on')}${gen('subject_id')}`, [
    'CREATE INDEX reminders_due ON reminders (space, status, due_on)',
  ]);
  await docTable(db, 'tags', sql`${gen('name')}`, [
    'CREATE UNIQUE INDEX tags_name ON tags (space, name)',
  ]);
  await docTable(db, 'taggings', sql`${gen('tag_id')}${gen('subject_id')}`, [
    'CREATE INDEX taggings_tag ON taggings (space, tag_id)',
    'CREATE INDEX taggings_subject ON taggings (space, subject_id)',
  ]);
  await docTable(db, 'attachments', sql`${gen('subject_id')}, gc_pending boolean GENERATED ALWAYS AS ((data->>'gc_pending')::boolean) STORED`, [
    'CREATE INDEX attachments_gc ON attachments (space) WHERE gc_pending',
  ]);
  await docTable(db, 'merges', sql`${gen('keep_id')}${gen('drop_id')}`, [
    'CREATE INDEX merges_keep ON merges (space, keep_id)',
  ]);
  await docTable(db, 'saved_views');
  await docTable(db, 'habit_checks');
  await docTable(db, 'dedup_dismissals');
  await docTable(db, 'dedup_aliases', sql`${gen('type')}`, [
    'CREATE INDEX dedup_aliases_type ON dedup_aliases (space, type)',
  ]);

  // ── Imports, with their subcollections as real tables ──────────────────────
  // `imports/{id}/rows` and `.../raw_chunks` were Firestore subcollections,
  // deleted with `recursiveDelete`. A foreign key with ON DELETE CASCADE is the
  // same guarantee enforced by the database instead of by application code.
  await docTable(db, 'imports', sql`${gen('status')}${gen('created_at')}`, [
    'CREATE INDEX imports_status ON imports (space, status, created_at)',
  ]);
  for (const child of ['import_rows', 'import_raw_chunks']) {
    await sql`
      CREATE TABLE ${sql.raw(child)} (
        ${BASE},
        import_id text NOT NULL,
        PRIMARY KEY (space, import_id, id),
        FOREIGN KEY (space, import_id) REFERENCES imports (space, id) ON DELETE CASCADE
      )
    `.execute(db);
  }

  // ── Meta ──────────────────────────────────────────────────────────────────
  // Singleton documents: the search-invalidation counter, the dedup scan lease.
  await docTable(db, 'meta');
  // `meta/{doc}/runs/{runId}` and the import-maintenance journals that
  // make those scripts undoable. Firestore modelled them as a subcollection.
  await sql`
    CREATE TABLE meta_runs (
      ${BASE},
      meta_id text NOT NULL,
      PRIMARY KEY (space, meta_id, id),
      FOREIGN KEY (space, meta_id) REFERENCES meta (space, id) ON DELETE CASCADE
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [
    'meta_runs', 'meta', 'import_raw_chunks', 'import_rows', 'imports',
    'dedup_aliases', 'dedup_dismissals', 'habit_checks', 'saved_views', 'merges',
    'attachments', 'taggings', 'tags', 'reminders', 'templates', 'resumes',
    'targets', 'atom_skills', 'atom_variants', 'atoms', 'revisions', 'edges', 'nodes',
  ]) {
    await sql`DROP TABLE IF EXISTS ${sql.raw(t)} CASCADE`.execute(db);
  }
}
