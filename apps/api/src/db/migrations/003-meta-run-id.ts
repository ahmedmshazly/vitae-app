/**
 * `run_id` on meta_runs, for the duplicate-scan results.
 *
 * Firestore modelled a scan as `meta/dedup_scan/runs/{runId}/results/{pair}`.
 * two levels of subcollection. `meta_runs` flattens that: the journal rows and
 * the scan results both hang off a meta document, and `run_id` is what
 * separates one scan's results from the previous one's so a superseded run can
 * be read or discarded as a unit.
 */
import type { Kysely} from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_runs
      ADD COLUMN run_id text GENERATED ALWAYS AS (data->>'run_id') STORED
  `.execute(db);
  await sql`CREATE INDEX meta_runs_run ON meta_runs (space, meta_id, run_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE meta_runs DROP COLUMN IF EXISTS run_id`.execute(db);
}
