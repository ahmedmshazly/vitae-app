/**
 * Add query columns for the résumé studio without changing document storage.
 * Existing rows remain valid: absent JSON keys simply generate NULL.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE targets
      ADD COLUMN status text GENERATED ALWAYS AS (data->>'status') STORED,
      ADD COLUMN updated_at text GENERATED ALWAYS AS (data->>'updated_at') STORED,
      ADD COLUMN deleted_at text GENERATED ALWAYS AS (data->>'deleted_at') STORED
  `.execute(db);
  await sql`CREATE INDEX targets_status_updated ON targets (space, status, updated_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX targets_live_updated ON targets (space, updated_at DESC) WHERE deleted_at IS NULL`.execute(
    db,
  );

  await sql`
    ALTER TABLE resumes
      ADD COLUMN target_id text GENERATED ALWAYS AS (data->>'target_id') STORED,
      ADD COLUMN template_key text GENERATED ALWAYS AS (data->>'template_key') STORED,
      ADD COLUMN status text GENERATED ALWAYS AS (data->>'status') STORED,
      ADD COLUMN created_at text GENERATED ALWAYS AS (data->>'created_at') STORED,
      ADD COLUMN deleted_at text GENERATED ALWAYS AS (data->>'deleted_at') STORED
  `.execute(db);
  await sql`CREATE INDEX resumes_target ON resumes (space, target_id)`.execute(db);
  await sql`CREATE INDEX resumes_status_created ON resumes (space, status, created_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX resumes_template ON resumes (space, template_key)`.execute(db);
  await sql`CREATE INDEX resumes_live_created ON resumes (space, created_at DESC) WHERE deleted_at IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS resumes_live_created`.execute(db);
  await sql`DROP INDEX IF EXISTS resumes_template`.execute(db);
  await sql`DROP INDEX IF EXISTS resumes_status_created`.execute(db);
  await sql`DROP INDEX IF EXISTS resumes_target`.execute(db);
  await sql`ALTER TABLE resumes DROP COLUMN deleted_at, DROP COLUMN created_at, DROP COLUMN status, DROP COLUMN template_key, DROP COLUMN target_id`.execute(
    db,
  );

  await sql`DROP INDEX IF EXISTS targets_live_updated`.execute(db);
  await sql`DROP INDEX IF EXISTS targets_status_updated`.execute(db);
  await sql`ALTER TABLE targets DROP COLUMN deleted_at, DROP COLUMN updated_at, DROP COLUMN status`.execute(
    db,
  );
}
