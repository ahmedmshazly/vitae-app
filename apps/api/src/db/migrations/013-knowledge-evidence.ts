import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/** Sources and observations are durable data, independently of graph curation. */
export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'knowledge_sources',
    'knowledge_runs',
    'source_records',
    'source_identities',
    'evidence_assertions',
    'reconciliation_decisions',
    'entity_redirects',
  ]) {
    await sql
      .raw(
        `CREATE TABLE ${table} (
      space text NOT NULL DEFAULT 'real' CHECK (space IN ('real','demo')),
      workspace_id text NOT NULL DEFAULT 'workspace-legacy-real' REFERENCES workspaces(id) ON DELETE RESTRICT,
      id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(workspace_id,id)
    )`,
      )
      .execute(db);
    await sql
      .raw(
        `CREATE TRIGGER ${table}_legacy_workspace_default BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION vitae_default_workspace_from_space()`,
      )
      .execute(db);
  }
  await sql`CREATE INDEX source_records_source ON source_records(workspace_id, space, (data->>'source_id'))`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX source_records_external ON source_records(workspace_id, space, (data->>'source_id'), (data->>'external_id'), (data->>'content_hash'))`.execute(
    db,
  );
  await sql`CREATE INDEX source_records_time ON source_records(workspace_id, space, (data->>'kind'), (data->>'occurred_at') DESC, id)`.execute(
    db,
  );
  await sql`CREATE INDEX source_records_participants ON source_records USING gin ((data->'participant_addresses'))`.execute(
    db,
  );
  await sql`CREATE INDEX source_records_search ON source_records USING gin (to_tsvector('simple', coalesce(data->>'title','') || ' ' || coalesce(data->'data'->>'body_text','')))`.execute(
    db,
  );
  await sql`CREATE INDEX evidence_assertions_subject ON evidence_assertions(workspace_id, space, (data->>'subject_id'), (data->>'subject_kind'))`.execute(
    db,
  );
  await sql`CREATE INDEX knowledge_runs_source ON knowledge_runs(workspace_id, space, (data->>'source_id'), (data->>'started_at') DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX source_identities_lookup ON source_identities(workspace_id, space, (data->>'scheme'), (data->>'normalized_value'))`.execute(
    db,
  );
  await sql`CREATE INDEX source_identities_entity ON source_identities(workspace_id, space, (data->>'entity_id'))`.execute(
    db,
  );
  await sql`CREATE INDEX evidence_assertions_source ON evidence_assertions(workspace_id, space, (data->'citation'->>'record_id'))`.execute(
    db,
  );
  await sql`CREATE INDEX evidence_assertions_status ON evidence_assertions(workspace_id, space, (data->>'status'))`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX evidence_assertions_idempotent ON evidence_assertions(workspace_id, space, (data->>'subject_kind'), (data->>'subject_id'), (data->>'field'), (data->'citation'->>'record_id'), md5((data->'value')::text))`.execute(
    db,
  );
  await sql`CREATE INDEX reconciliation_decisions_run ON reconciliation_decisions(workspace_id, space, (data->>'run_id'), (data->>'decided_at'))`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX entity_redirects_active ON entity_redirects(workspace_id, space, (data->>'from_id')) WHERE data->>'reversed_at' IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'entity_redirects',
    'reconciliation_decisions',
    'evidence_assertions',
    'source_identities',
    'source_records',
    'knowledge_runs',
    'knowledge_sources',
  ]) {
    await sql.raw(`DROP TABLE ${table}`).execute(db);
  }
}
