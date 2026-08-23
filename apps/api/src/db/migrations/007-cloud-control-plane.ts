/**
 * Cloud control plane and workspace partitioning.
 *
 * The original `space` column separates one self-hosted owner's real graph
 * from an internal demo. It cannot safely represent customer tenancy: a
 * browser chose it with a request header and it has only two values. This
 * migration keeps that legacy compatibility surface while adding a
 * server-selected `workspace_id` to every durable graph table.
 *
 * Existing data is moved without rewriting its JSON documents: real rows are
 * assigned to the claimable legacy workspace and demo rows to an unassigned
 * system workspace. The application only enters multi-tenant mode when its
 * server flag is enabled, so self-hosted installations continue to work while
 * the hosted rollout is prepared.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

const LEGACY_WORKSPACE_ID = 'workspace-legacy-real';
const DEMO_WORKSPACE_ID = 'workspace-system-demo';

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
    CREATE TABLE users (
      id text PRIMARY KEY,
      email text NOT NULL,
      email_verified boolean NOT NULL,
      provider text NOT NULL,
      created_at text NOT NULL DEFAULT now()::text,
      updated_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);
  await sql`CREATE UNIQUE INDEX users_email_lower ON users ((lower(email)))`.execute(db);

  await sql`
    CREATE TABLE workspaces (
      id text PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('personal', 'legacy', 'system')),
      state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleted')),
      owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at text NOT NULL DEFAULT now()::text,
      updated_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);

  await sql`
    CREATE TABLE workspace_members (
      workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'member')),
      created_at text NOT NULL DEFAULT now()::text,
      PRIMARY KEY (workspace_id, user_id)
    )
  `.execute(db);
  await sql`CREATE INDEX workspace_members_user ON workspace_members (user_id, workspace_id)`.execute(db);

  await sql`
    CREATE TABLE workspace_lifecycles (
      workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      access_state text NOT NULL CHECK (access_state IN ('trialing', 'active', 'past_due', 'read_only', 'deletion_pending')),
      trial_ends_at text,
      grace_ends_at text,
      deletion_scheduled_at text,
      updated_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);

  await sql`
    CREATE TABLE billing_customers (
      workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      provider text NOT NULL,
      provider_customer_id text,
      created_at text NOT NULL DEFAULT now()::text,
      updated_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX billing_customers_provider_customer
      ON billing_customers (provider, provider_customer_id)
      WHERE provider_customer_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TABLE billing_subscriptions (
      workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      provider text NOT NULL,
      provider_subscription_id text,
      provider_status text,
      billing_period text,
      current_period_ends_at text,
      provider_updated_at text,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX billing_subscriptions_provider_subscription
      ON billing_subscriptions (provider, provider_subscription_id)
      WHERE provider_subscription_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TABLE billing_events (
      provider_event_id text PRIMARY KEY,
      provider text NOT NULL,
      event_type text NOT NULL,
      workspace_id text REFERENCES workspaces(id) ON DELETE SET NULL,
      payload jsonb NOT NULL,
      received_at text NOT NULL DEFAULT now()::text,
      processed_at text
    )
  `.execute(db);
  await sql`CREATE INDEX billing_events_workspace_received ON billing_events (workspace_id, received_at DESC)`.execute(db);

  await sql`
    CREATE TABLE workspace_lifecycle_events (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at text NOT NULL DEFAULT now()::text
    )
  `.execute(db);
  await sql`CREATE INDEX workspace_lifecycle_events_workspace_created ON workspace_lifecycle_events (workspace_id, created_at DESC)`.execute(db);

  // Keep these records ownerless until the legacy Firebase identity performs
  // its first Cloud bootstrap. The system demo has no membership by design.
  await sql`
    INSERT INTO workspaces (id, kind, state)
    VALUES (${LEGACY_WORKSPACE_ID}, 'legacy', 'active'), (${DEMO_WORKSPACE_ID}, 'system', 'active')
  `.execute(db);
  await sql`
    INSERT INTO workspace_lifecycles (workspace_id, access_state)
    VALUES (${LEGACY_WORKSPACE_ID}, 'active'), (${DEMO_WORKSPACE_ID}, 'read_only')
  `.execute(db);

  for (const table of DOC_TABLES) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
      ADD COLUMN workspace_id text NOT NULL DEFAULT ${sql.lit(LEGACY_WORKSPACE_ID)}
    `.execute(db);
    await sql`
      UPDATE ${sql.raw(table)}
      SET workspace_id = ${DEMO_WORKSPACE_ID}
      WHERE space = 'demo'
    `.execute(db);
    await sql`
      ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(`${table}_workspace_id_fkey`)}
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
    `.execute(db);
    // Repository upserts must target the tenant key, never the legacy
    // (space,id) key, or an astronomically unlikely reused UUID could overwrite
    // another customer's row.
    await sql`
      CREATE UNIQUE INDEX ${sql.raw(`${table}_workspace_id_id_key`)}
      ON ${sql.raw(table)} (workspace_id, id)
    `.execute(db);
    await sql`
      CREATE INDEX ${sql.raw(`${table}_workspace_id_idx`)}
      ON ${sql.raw(table)} (workspace_id)
    `.execute(db);
  }

  // The historical children reference their parents through `(space, id)`.
  // Retain that constraint for rollback compatibility and add the tenant key so
  // no child can be attached to a same-id parent in another Cloud workspace.
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

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE meta_runs DROP CONSTRAINT IF EXISTS meta_runs_workspace_parent_fkey`.execute(db);
  for (const child of ['import_rows', 'import_raw_chunks']) {
    await sql`
      ALTER TABLE ${sql.raw(child)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(`${child}_workspace_parent_fkey`)}
    `.execute(db);
  }
  for (const table of [...DOC_TABLES].reverse()) {
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_workspace_id_idx`)}`.execute(db);
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_workspace_id_id_key`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT IF EXISTS ${sql.raw(`${table}_workspace_id_fkey`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} DROP COLUMN IF EXISTS workspace_id`.execute(db);
  }
  for (const table of [
    'workspace_lifecycle_events',
    'billing_events',
    'billing_subscriptions',
    'billing_customers',
    'workspace_lifecycles',
    'workspace_members',
    'workspaces',
    'users',
  ]) {
    await sql`DROP TABLE IF EXISTS ${sql.raw(table)} CASCADE`.execute(db);
  }
}
