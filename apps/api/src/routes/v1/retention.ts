import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { purgeExpiredTrash, TRASH_RETENTION_DAYS } from '../../services/retention.js';
import { searchIndex } from '../../db/search-index.js';

export const retentionRouter: Router = Router();

/** What the next purge would remove (FR-006), powers the Trash retention notice. */
retentionRouter.get(
  '/preview',
  asyncHandler(async (_req, res) => {
    const summary = await purgeExpiredTrash({ dryRun: true });
    res.json({ retentionDays: TRASH_RETENTION_DAYS, ...summary });
  }),
);

/** Purge on demand. Idempotent; the scheduler calls the same code path. */
retentionRouter.post(
  '/purge',
  asyncHandler(async (_req, res) => {
    const summary = await purgeExpiredTrash();
    searchIndex.markDirty();
    res.json({ retentionDays: TRASH_RETENTION_DAYS, ...summary });
  }),
);
