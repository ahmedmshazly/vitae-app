import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { env } from '../../env.js';
import { storage } from '../../services/storage/cloudinary.js';
import * as buildsvc from '../../services/buildsvc-client.js';

export const statusRouter: Router = Router();

/**
 * /status health page (SRS FR-SET-006): DB, storage, build-svc, counts.
 *
 * FR-005: counts come from aggregate queries, not from loading both tables. The
 * Shell polls this every 60s, so the original implementation read the entire
 * database once a minute per open client, at the stated ceiling, ~300k
 * documents/minute.
 */
statusRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, { ok: boolean; detail?: unknown }> = {};

    try {
      // A write, not a read: fail if the database is up but read-only
      // (failed-over replica, full volume), not only when it is unreachable.
      await repository.docPut('meta', 'ping', { at: new Date().toISOString() });
      checks.database = { ok: true, detail: 'postgres' };
    } catch (e) {
      checks.database = { ok: false, detail: String(e) };
    }
    checks.storage = { ok: await storage.healthy().catch(() => false), detail: 'cloudinary' };
    checks.buildsvc = await buildsvc.healthz();

    const counts = await repository.liveCounts();
    res.json({
      ok: Object.values(checks).every((c) => c.ok),
      checks,
      counts,
      env: { node: process.version, emulators: env.usingEmulators, devLogin: env.AUTH_ENABLE_DEV_LOGIN },
    });
  }),
);
