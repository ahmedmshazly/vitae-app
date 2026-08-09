/**
 * Make child tables key on (space, id) like every other table.
 *
 * 001 gave `import_rows`, `import_raw_chunks`, and `meta_runs` a composite key
 * of (space, parent_id, id), mirroring the Firestore path they came from. That
 * reads naturally and is wrong in one specific way: the repository's document
 * helpers upsert with `ON CONFLICT (space, id)`, and Postgres requires the
 * conflict target to match a unique constraint, so every staged import would
 * have failed at runtime with "no unique or exclusion constraint matching the
 * ON CONFLICT specification".
 *
 * Row ids are already globally unique (UUIDs, or derived hashes), so the parent
 * adds nothing to identity. It stays as an indexed foreign key, which is what
 * actually carries the cascade.
 */
import type { Kysely} from 'kysely';
import { sql } from 'kysely';

const CHILDREN = [
  { table: 'import_rows', parent: 'import_id' },
  { table: 'import_raw_chunks', parent: 'import_id' },
  { table: 'meta_runs', parent: 'meta_id' },
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const { table, parent } of CHILDREN) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT ${sql.raw(`${table}_pkey`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} ADD PRIMARY KEY (space, id)`.execute(db);
    await sql`
      CREATE INDEX ${sql.raw(`${table}_parent`)} ON ${sql.raw(table)} (space, ${sql.raw(parent)})
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const { table, parent } of CHILDREN) {
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_parent`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT ${sql.raw(`${table}_pkey`)}`.execute(db);
    await sql`
      ALTER TABLE ${sql.raw(table)} ADD PRIMARY KEY (space, ${sql.raw(parent)}, id)
    `.execute(db);
  }
}
