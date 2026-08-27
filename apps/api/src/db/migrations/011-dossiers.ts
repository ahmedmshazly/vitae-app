/**
 * Dossiers table (SRS FR-DOS-001, FR-DOS-002 / §4.5).
 *
 * A dossier is a selection, not a document: it stores which records each claim
 * rests on, and the compiled artifact is derived from that selection every
 * time. So the row is the same three-column document shape the rest of the
 * workspace uses, with the columns a reader filters on generated from `data`
 * rather than written beside it, which is what keeps the index and the
 * document from ever disagreeing.
 *
 * The tenancy wiring is not optional decoration and is not copied from the
 * `letters` migration, which predates it. Migrations 007 through 010 moved
 * every document table onto `(workspace_id, id)` as its real identity, gave it
 * a foreign key into `workspaces`, and hung a trigger on it so a legacy script
 * inserting a `demo` row still lands in the demo workspace. A new table created
 * after all of that has to arrive with the finished shape, or it becomes the
 * one table whose rows can collide between two Cloud workspaces.
 *
 * `subject_node` is indexed because every dossier is about exactly one subject
 * and the only listing anyone asks for is "what have I compiled about this
 * person"; `audience` joins it because the second question is always which
 * packet, and a promotion review and an exhibit list are not interchangeable.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

const LEGACY_WORKSPACE_ID = 'workspace-legacy-real';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE dossiers (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      workspace_id text NOT NULL DEFAULT ${sql.lit(LEGACY_WORKSPACE_ID)}
        REFERENCES workspaces(id) ON DELETE RESTRICT,
      id    text NOT NULL,
      data  jsonb NOT NULL,
      subject_node text GENERATED ALWAYS AS (data->>'subject_node') STORED,
      audience     text GENERATED ALWAYS AS (data->>'audience')     STORED,
      updated_at   text GENERATED ALWAYS AS (data->>'updated_at')   STORED,
      deleted_at   text GENERATED ALWAYS AS (data->>'deleted_at')   STORED,
      PRIMARY KEY (workspace_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX dossiers_workspace_id_idx ON dossiers (workspace_id)`.execute(db);
  await sql`
    CREATE INDEX dossiers_subject
    ON dossiers (workspace_id, space, subject_node, audience)
  `.execute(db);
  await sql`
    CREATE INDEX dossiers_live_updated
    ON dossiers (workspace_id, space, updated_at DESC)
    WHERE deleted_at IS NULL
  `.execute(db);
  // The function is created by migration 010 and shared by every document
  // table; this table only needs its own trigger onto it.
  await sql`
    CREATE TRIGGER dossiers_legacy_workspace_default
    BEFORE INSERT ON dossiers
    FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS dossiers_legacy_workspace_default ON dossiers`.execute(db);
  await sql`DROP TABLE IF EXISTS dossiers CASCADE`.execute(db);
}
