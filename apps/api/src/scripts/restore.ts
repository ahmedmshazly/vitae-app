/**
 * Privileged restore command (runbook: docs/runbooks/restore-drill.md).
 *
 *   pnpm --filter @vitae/api restore <extracted-bundle-dir> [--force]
 *
 * Point the API env at the target Postgres database, extract the export ZIP,
 * and pass the directory. Record IDs are preserved exactly;
 * `--force` allows writing into a non-empty database.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import '../env.js';
import { restoreBundle, RestoreError } from '../services/restore.js';

function collectFiles(root: string): Record<string, string | Buffer> {
  const files: Record<string, string | Buffer> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const name = relative(root, full);
        const data = readFileSync(full);
        files[name] = name.startsWith('blobs/') ? data : data.toString('utf8');
      }
    }
  };
  walk(root);
  return files;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const dir = args[0];
  if (!dir) {
    console.error('usage: restore <extracted-bundle-dir> [--force]');
    process.exit(2);
  }

  const files = collectFiles(dir);
  const summary = await restoreBundle(files, { force });
  console.log('[restore] complete:');
  for (const [name, count] of Object.entries(summary.collections)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(`  total documents: ${summary.total}`);
}

main().catch((err) => {
  if (err instanceof RestoreError) console.error(`[restore] ${err.message}`);
  else console.error('[restore] failed:', err);
  process.exit(1);
});
