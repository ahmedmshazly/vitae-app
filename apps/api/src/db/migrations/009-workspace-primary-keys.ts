/**
 * Make the workspace key the actual document identity.
 *
 * Migration 007 added a unique `(workspace_id, id)` index, but leaving the
 * historical `(space, id)` primary key in place would still make singleton
 * documents such as `meta/search_generation` collide between two Cloud
 * workspaces. This promotes the tenant key to every table's primary key and
 * replaces the old child foreign keys with the workspace-aware ones introduced
 * in 007.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

const DOC_TABLES = [
  'nodes',
  'edges',
  'revisions',
  'atoms',
  'atom_variants',
  'atom_skills',
  'targets',
  'resumes',
  'letters',
  'templates',
  'reminders',
  'tags',
  'taggings',
  'attachments',
  'merges',
  'imports',
  'import_rows',
  'import_raw_chunks',
  'saved_views',
  'meta',
  'meta_runs',
  'habit_checks',
  'dedup_dismissals',
  'dedup_aliases',
] as const;

const LEGACY_CHILD_FKS = [
  { table: 'import_rows', constraint: 'import_rows_space_import_id_fkey', parent: 'imports', column: 'import_id' },
  { table: 'import_raw_chunks', constraint: 'import_raw_chunks_space_import_id_fkey', parent: 'imports', column: 'import_id' },
  { table: 'meta_runs', constraint: 'meta_runs_space_meta_id_fkey', parent: 'meta', column: 'meta_id' },
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const { table, constraint } of LEGACY_CHILD_FKS) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT IF EXISTS ${sql.raw(constraint)}`.execute(db);
  }
  for (const table of DOC_TABLES) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT ${sql.raw(`${table}_pkey`)}`.execute(db);
    await sql`
      ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(`${table}_pkey`)}
      PRIMARY KEY USING INDEX ${sql.raw(`${table}_workspace_id_id_key`)}
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Workspace-aware child FKs may be attached to the parent primary key after
  // this migration, so release them before moving identity back to `space`.
  await sql`ALTER TABLE meta_runs DROP CONSTRAINT IF EXISTS meta_runs_workspace_parent_fkey`.execute(db);
  for (const child of ['import_rows', 'import_raw_chunks']) {
    await sql`
      ALTER TABLE ${sql.raw(child)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(`${child}_workspace_parent_fkey`)}
    `.execute(db);
  }
  for (const table of [...DOC_TABLES].reverse()) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT ${sql.raw(`${table}_pkey`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} ADD CONSTRAINT ${sql.raw(`${table}_pkey`)} PRIMARY KEY (space, id)`.execute(db);
    await sql`
      CREATE UNIQUE INDEX ${sql.raw(`${table}_workspace_id_id_key`)}
      ON ${sql.raw(table)} (workspace_id, id)
    `.execute(db);
  }
  for (const { table, constraint, parent, column } of LEGACY_CHILD_FKS) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(constraint)}
      FOREIGN KEY (space, ${sql.raw(column)}) REFERENCES ${sql.raw(parent)} (space, id) ON DELETE CASCADE
    `.execute(db);
  }
  for (const child of ['import_rows', 'import_raw_chunks']) {
    await sql`
      ALTER TABLE ${sql.raw(child)}
      ADD CONSTRAINT ${sql.raw(`${child}_workspace_parent_fkey`)}
      FOREIGN KEY (workspace_id, import_id) REFERENCES imports (workspace_id, id) ON DELETE CASCADE
    `.execute(db);
  }
  await sql`
    ALTER TABLE meta_runs
    ADD CONSTRAINT meta_runs_workspace_parent_fkey
    FOREIGN KEY (workspace_id, meta_id) REFERENCES meta (workspace_id, id) ON DELETE CASCADE
  `.execute(db);
}
