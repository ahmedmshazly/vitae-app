/**
 * Cover letters table (SRS FR-RES-020 / §4.5).
 *
 * Generation UI is deferred; this migration only stands up durable storage so
 * later compile/export work can attach without another schema break. Marked
 * optional in export bundles so older backups remain restorable.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE letters (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      id    text NOT NULL,
      data  jsonb NOT NULL,
      target_id  text GENERATED ALWAYS AS (data->>'target_id')  STORED,
      resume_id  text GENERATED ALWAYS AS (data->>'resume_id')  STORED,
      status     text GENERATED ALWAYS AS (data->>'status')     STORED,
      updated_at text GENERATED ALWAYS AS (data->>'updated_at') STORED,
      deleted_at text GENERATED ALWAYS AS (data->>'deleted_at') STORED,
      PRIMARY KEY (space, id)
    )
  `.execute(db);
  await sql`CREATE INDEX letters_target ON letters (space, target_id)`.execute(db);
  await sql`CREATE INDEX letters_resume ON letters (space, resume_id)`.execute(db);
  await sql`CREATE INDEX letters_status_updated ON letters (space, status, updated_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX letters_live_updated ON letters (space, updated_at DESC) WHERE deleted_at IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS letters CASCADE`.execute(db);
}
