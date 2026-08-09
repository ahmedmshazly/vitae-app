/**
 * Retention purge (FR-006):  pnpm --filter @vitae/api purge [--dry-run]
 *
 * Hard-deletes trash older than the 30-day window in both data spaces. The API
 * also runs this daily while it is up; this script is the cron/manual path.
 */
import '../env.js';
import { runInSpace, type Space } from '../db/space.js';
import { purgeExpiredTrash } from '../services/retention.js';

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  for (const space of ['real', 'demo'] as Space[]) {
    const summary = await runInSpace(space, () => purgeExpiredTrash({ dryRun }));
    console.log(
      `[purge] ${space}${dryRun ? ' (dry run)' : ''}: ${summary.nodes} nodes, ${summary.edges} edges, ` +
        `${summary.revisions} revisions, ${summary.dependents} dependents older than ${summary.cutoff}`,
    );
  }
}

main().catch((err) => {
  console.error('[purge] failed:', err);
  process.exit(1);
});
