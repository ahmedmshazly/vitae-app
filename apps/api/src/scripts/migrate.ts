/**
 * Schema migrations (ADR 0005).
 *
 *   pnpm --filter @vitae/api migrate           # apply everything pending
 *   pnpm --filter @vitae/api migrate -- --down # roll back the newest one
 *   pnpm --filter @vitae/api migrate -- --status
 *
 * Kysely's own migrator, running the plain `.ts` files in `db/migrations/`
 * under tsx. No codegen and no build step, the API runs TypeScript directly in
 * production, and a migration tool that needed compiling would be the first
 * thing to break that.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// Kysely 0.29 moved the migrator off the main entry onto a subpath export.
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import '../env.js';
import { closeDb, db } from '../db/pg.js';

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({ fs, path, migrationFolder }),
});

async function main(): Promise<void> {
  if (process.argv.includes('--status')) {
    const all = await migrator.getMigrations();
    for (const m of all) {
      console.log(`  ${m.executedAt ? '✓ applied' : '· pending'}  ${m.name}`);
    }
    if (all.length === 0) console.log('  (no migrations found)');
    return;
  }

  const down = process.argv.includes('--down');
  const { error, results } = down ? await migrator.migrateDown() : await migrator.migrateToLatest();

  for (const r of results ?? []) {
    const verb = down ? 'reverted' : 'applied';
    console.log(
      r.status === 'Success'
        ? `  ✓ ${verb} ${r.migrationName}`
        : r.status === 'Error'
          ? `  ✗ FAILED ${r.migrationName}`
          : `  · skipped ${r.migrationName}`,
    );
  }
  if (!results?.length) console.log('  nothing to do, schema is up to date');

  if (error) {
    console.error('[migrate] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main().finally(closeDb);
