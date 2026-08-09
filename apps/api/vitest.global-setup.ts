/**
 * Give the test suite its own database.
 *
 * The suites truncate between tests, so pointing them at the development
 * database means running `vitest` silently destroys whatever you had seeded ,
 * which is exactly what happened once before this file existed. `vitae_test` is
 * created on demand and migrated to the same schema as the real one.
 */
import { Client } from 'pg';

const ADMIN_URL = process.env.VITAE_TEST_ADMIN_URL ?? 'postgresql://vitae:vitae@127.0.0.1:5433/postgres';
const TEST_DB = process.env.VITAE_TEST_DB ?? 'vitae_test';

export default async function setup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      'Postgres is not reachable, so the API suites cannot run and must not silently pass. ' +
        `Start it with \`docker compose up -d postgres\`. Cause: ${(error as Error).message}`,
    );
  }
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
  // CREATE DATABASE cannot be parameterised or run inside a transaction.
  if (!rowCount) await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  // Migrate with the same runner production uses, so the schema under test is
  // never a hand-maintained copy that can drift from the migrations.
  process.env.DATABASE_URL = testUrl();
  const { Migrator, FileMigrationProvider } = await import('kysely/migration');
  const { promises: fs } = await import('node:fs');
  const path = await import('node:path');
  const { db, closeDb } = await import('./src/db/pg.js');

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dirname, 'src/db/migrations'),
    }),
  });
  const { error } = await migrator.migrateToLatest();
  await closeDb();
  if (error) throw error;
}

export function testUrl(): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}
