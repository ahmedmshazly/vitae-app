/**
 * Retention purge (FR-006):  pnpm --filter @vitae/api purge [--dry-run]
 *
 * Hard-deletes trash older than the retention window. Cloud mode enumerates
 * server-owned workspaces; self-host mode retains its real/demo script path.
 */
import '../env.js';
import { runInSpace, runInWorkspace, type Space } from '../db/space.js';
import { purgeExpiredTrash } from '../services/retention.js';
import { activeWorkspaceIds } from '../services/control-plane.js';
import { cloudEnabled } from '../cloud/config.js';

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  if (cloudEnabled()) {
    for (const workspaceId of await activeWorkspaceIds()) {
      const summary = await runInWorkspace(workspaceId, () => purgeExpiredTrash({ dryRun }));
      console.log(
        `[purge] workspace ${workspaceId}${dryRun ? ' (dry run)' : ''}: ${summary.nodes} nodes, ${summary.edges} edges, ` +
          `${summary.revisions} revisions, ${summary.dependents} dependents older than ${summary.cutoff}`,
      );
    }
    return;
  }
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
