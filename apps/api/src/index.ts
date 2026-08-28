/** Vitae API server entrypoint. */
import { env } from './env.js';
import { createApp } from './app.js';
import { setReady } from './middleware/health.js';
import { runInSpace, runInWorkspace, type Space } from './db/space.js';
import { purgeExpiredTrash } from './services/retention.js';
import { cloudEnabled } from './cloud/config.js';
import { activeWorkspaceIds } from './services/control-plane.js';

const app = createApp();
const port = env.API_PORT;

const server = app.listen(port, () => {
  setReady(true);
  console.log(`\n  ▲ Vitae API  ·  http://localhost:${port}/api/v1`);
  console.log(`     env: ${env.NODE_ENV}  ·  emulators: ${env.usingEmulators}  ·  owner: ${env.OWNER_EMAIL}`);
  console.log(`     dev-login: ${env.AUTH_ENABLE_DEV_LOGIN ? 'enabled' : 'disabled'}\n`);
});

// FR-006: the 30-day trash promise needs something that actually purges. Daily
// while the process is up; `pnpm --filter @vitae/api purge` covers cron/manual.
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
let purgeJob: Promise<void> | null = null;
function runPurge(): Promise<void> {
  if (purgeJob) return purgeJob;
  purgeJob = (async () => {
    if (cloudEnabled()) {
      for (const workspaceId of await activeWorkspaceIds()) {
        try {
          const summary = await runInWorkspace(workspaceId, () => purgeExpiredTrash());
          if (summary.nodes || summary.edges) {
            console.log(`[purge] workspace ${workspaceId}: ${summary.nodes} nodes, ${summary.edges} edges past retention`);
          }
        } catch (err) {
          console.error(`[purge] workspace ${workspaceId} failed:`, err);
        }
      }
      return;
    }
    for (const space of ['real', 'demo'] as Space[]) {
      try {
        const summary = await runInSpace(space, () => purgeExpiredTrash());
        if (summary.nodes || summary.edges) {
          console.log(`[purge] ${space}: ${summary.nodes} nodes, ${summary.edges} edges past retention`);
        }
      } catch (err) {
        console.error(`[purge] ${space} failed:`, err);
      }
    }
  })().finally(() => {
    purgeJob = null;
  });
  return purgeJob;
}
void runPurge();
const purgeTimer = setInterval(() => void runPurge(), PURGE_INTERVAL_MS);
purgeTimer.unref();

// FR-026: stop taking traffic, then let in-flight requests finish before exit.
// a deploy should never drop a compile or an import mid-write.
const SHUTDOWN_GRACE_MS = 65_000;
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal}, draining...`);
  setReady(false); // /ready starts failing so the LB stops routing here
  clearInterval(purgeTimer);

  const force = setTimeout(() => {
    console.error('[api] drain timed out, forcing exit');
    server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();

  server.close(async (err) => {
    if (err) {
      console.error('[api] shutdown error:', err);
      process.exit(1);
    }
    if (purgeJob) await purgeJob.catch(() => undefined);
    console.log('[api] requests and background jobs drained cleanly');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
