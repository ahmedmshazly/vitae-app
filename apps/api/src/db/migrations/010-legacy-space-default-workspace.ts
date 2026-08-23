/**
 * Preserve direct legacy `space` inserts while primary keys become workspace
 * based. Repository writes always pass an explicit workspace id; this trigger
 * only repairs old scripts/tests that insert a `demo` row and rely on the old
 * column default.
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

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION vitae_default_workspace_from_space()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.space = 'demo' AND NEW.workspace_id = 'workspace-legacy-real' THEN
        NEW.workspace_id := 'workspace-system-demo';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  for (const table of DOC_TABLES) {
    await sql`
      CREATE TRIGGER ${sql.raw(`${table}_legacy_workspace_default`)}
      BEFORE INSERT ON ${sql.raw(table)}
      FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of DOC_TABLES) {
    await sql`DROP TRIGGER IF EXISTS ${sql.raw(`${table}_legacy_workspace_default`)} ON ${sql.raw(table)}`.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS vitae_default_workspace_from_space()`.execute(db);
}
