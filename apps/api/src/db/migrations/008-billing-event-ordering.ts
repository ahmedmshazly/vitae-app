/** Provider timestamps make webhook processing monotonic across retries and delayed delivery. */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE billing_subscriptions
    ADD COLUMN IF NOT EXISTS provider_updated_at text
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS billing_subscriptions_provider_updated
    ON billing_subscriptions (workspace_id, provider_updated_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS billing_subscriptions_provider_updated`.execute(db);
  await sql`ALTER TABLE billing_subscriptions DROP COLUMN IF EXISTS provider_updated_at`.execute(db);
}
