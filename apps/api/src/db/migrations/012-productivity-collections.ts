/**
 * Productivity collections (time entries, automation rules, execution receipts)
 * plus revision indexes for bounded 30/90/365-day replay.
 *
 * Table shape copies `011-dossiers.ts`: `space`, `workspace_id` defaulting to
 * `workspace-legacy-real` with a workspaces FK and the shared
 * `vitae_default_workspace_from_space` trigger, `id`, `data jsonb`, generated
 * columns from `data`, and `PRIMARY KEY (workspace_id, id)`.
 *
 * `revisions_subject` is `(space, subject_id, rev)` and cannot serve a
 * workspace-scoped time window. Generated `at` plus the two workspace/time
 * indexes let a 30/90/365-day scan use the index instead of reading the table.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

const LEGACY_WORKSPACE_ID = 'workspace-legacy-real';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE time_entries (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      workspace_id text NOT NULL DEFAULT ${sql.lit(LEGACY_WORKSPACE_ID)}
        REFERENCES workspaces(id) ON DELETE RESTRICT,
      id    text NOT NULL,
      data  jsonb NOT NULL,
      task_id     text GENERATED ALWAYS AS (data->>'task_id')     STORED,
      started_at  text GENERATED ALWAYS AS (data->>'started_at')  STORED,
      ended_at    text GENERATED ALWAYS AS (data->>'ended_at')    STORED,
      updated_at  text GENERATED ALWAYS AS (data->>'updated_at')  STORED,
      deleted_at  text GENERATED ALWAYS AS (data->>'deleted_at')  STORED,
      PRIMARY KEY (workspace_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX time_entries_workspace_id_idx ON time_entries (workspace_id)`.execute(db);
  await sql`
    CREATE INDEX time_entries_live_task_started
    ON time_entries (workspace_id, space, task_id, started_at DESC)
    WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE TRIGGER time_entries_legacy_workspace_default
    BEFORE INSERT ON time_entries
    FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()
  `.execute(db);

  await sql`
    CREATE TABLE automation_rules (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      workspace_id text NOT NULL DEFAULT ${sql.lit(LEGACY_WORKSPACE_ID)}
        REFERENCES workspaces(id) ON DELETE RESTRICT,
      id    text NOT NULL,
      data  jsonb NOT NULL,
      enabled    boolean GENERATED ALWAYS AS ((data->>'enabled')::boolean) STORED,
      updated_at text    GENERATED ALWAYS AS (data->>'updated_at')         STORED,
      deleted_at text    GENERATED ALWAYS AS (data->>'deleted_at')         STORED,
      PRIMARY KEY (workspace_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX automation_rules_workspace_id_idx ON automation_rules (workspace_id)`.execute(db);
  await sql`
    CREATE INDEX automation_rules_live_updated
    ON automation_rules (workspace_id, space, updated_at DESC)
    WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE TRIGGER automation_rules_legacy_workspace_default
    BEFORE INSERT ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()
  `.execute(db);

  await sql`
    CREATE TABLE productivity_receipts (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      workspace_id text NOT NULL DEFAULT ${sql.lit(LEGACY_WORKSPACE_ID)}
        REFERENCES workspaces(id) ON DELETE RESTRICT,
      id    text NOT NULL,
      data  jsonb NOT NULL,
      operation_id text GENERATED ALWAYS AS (data->>'operation_id') STORED,
      command_type text GENERATED ALWAYS AS (data->>'command_type') STORED,
      created_at   text GENERATED ALWAYS AS (data->>'created_at')   STORED,
      PRIMARY KEY (workspace_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX productivity_receipts_workspace_id_idx ON productivity_receipts (workspace_id)`.execute(db);
  await sql`
    CREATE UNIQUE INDEX productivity_receipts_operation
    ON productivity_receipts (workspace_id, operation_id)
  `.execute(db);
  await sql`
    CREATE TRIGGER productivity_receipts_legacy_workspace_default
    BEFORE INSERT ON productivity_receipts
    FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()
  `.execute(db);

  await sql`
    ALTER TABLE revisions
    ADD COLUMN IF NOT EXISTS at text GENERATED ALWAYS AS (data->>'at') STORED
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS revisions_workspace_at
    ON revisions (workspace_id, at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS revisions_workspace_kind_at
    ON revisions (workspace_id, subject_kind, at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS productivity_receipts_legacy_workspace_default ON productivity_receipts`.execute(db);
  await sql`DROP TRIGGER IF EXISTS automation_rules_legacy_workspace_default ON automation_rules`.execute(db);
  await sql`DROP TRIGGER IF EXISTS time_entries_legacy_workspace_default ON time_entries`.execute(db);
  await sql`DROP TABLE IF EXISTS productivity_receipts CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS automation_rules CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS time_entries CASCADE`.execute(db);
  await sql`DROP INDEX IF EXISTS revisions_workspace_kind_at`.execute(db);
  await sql`DROP INDEX IF EXISTS revisions_workspace_at`.execute(db);
  await sql`ALTER TABLE revisions DROP COLUMN IF EXISTS at`.execute(db);
}
