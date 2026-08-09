/**
 * Generated columns the retention sweep filters on.
 *
 * `purgeExpiredTrash` deletes every dependent record of a purged node, habit
 * checks, dedup dismissals, by matching a foreign id inside the document.
 * Without these columns those become unindexed jsonb probes, which is fine at
 * today's size and wrong as soon as it is not.
 *
 * Split from 001 rather than folded into it: 001 is already applied, and
 * rewriting an applied migration means the schema on a developer's machine
 * depends on when they last reset it.
 */
import type { Kysely} from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE habit_checks
      ADD COLUMN habit_id text GENERATED ALWAYS AS (data->>'habit_id') STORED
  `.execute(db);
  await sql`CREATE INDEX habit_checks_habit ON habit_checks (space, habit_id)`.execute(db);

  // A dismissed duplicate pair, stored as its two node ids.
  await sql`
    ALTER TABLE dedup_dismissals
      ADD COLUMN a text GENERATED ALWAYS AS (data->>'a') STORED,
      ADD COLUMN b text GENERATED ALWAYS AS (data->>'b') STORED
  `.execute(db);
  await sql`CREATE INDEX dedup_dismissals_a ON dedup_dismissals (space, a)`.execute(db);
  await sql`CREATE INDEX dedup_dismissals_b ON dedup_dismissals (space, b)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE habit_checks DROP COLUMN IF EXISTS habit_id`.execute(db);
  await sql`ALTER TABLE dedup_dismissals DROP COLUMN IF EXISTS a, DROP COLUMN IF EXISTS b`.execute(db);
}
