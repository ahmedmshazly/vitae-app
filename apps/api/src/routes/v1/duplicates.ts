import { Router } from 'express';
import { z } from 'zod';
import { NODE_TYPES } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { searchIndex } from '../../db/search-index.js';
import {
  checkDuplicateDraft,
  deleteDedupAlias,
  dismissPair,
  invalidateDuplicateScan,
  listDedupAliases,
  listMerges,
  MergeConflictError,
  mergePair,
  scanDuplicateClusters,
  scanDuplicates,
  undoMerge,
} from '../../services/duplicates.js';

export const duplicatesRouter: Router = Router();

/** Candidate pairs (possible + probable), dismissed ones excluded. */
duplicatesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [pairs, clusters] = await Promise.all([scanDuplicates(), scanDuplicateClusters()]);
    res.json({ pairs, clusters });
  }),
);

duplicatesRouter.get(
  '/aliases',
  asyncHandler(async (_req, res) => {
    res.json({ aliases: await listDedupAliases() });
  }),
);

duplicatesRouter.delete(
  '/aliases/:id',
  asyncHandler(async (req, res) => {
    await deleteDedupAlias(req.params.id);
    res.json({ ok: true });
  }),
);

duplicatesRouter.post(
  '/rescan',
  asyncHandler(async (_req, res) => {
    await invalidateDuplicateScan();
    res.json({ clusters: await scanDuplicateClusters() });
  }),
);

const checkSchema = z.object({
  draft: z.object({
    type: z.enum(NODE_TYPES),
    title: z.string().min(1).max(500),
    subtitle: z.string().max(500).nullish(),
    props: z.record(z.string(), z.unknown()).optional(),
    identity_keys: z.array(z.string()).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  }),
  excludeId: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

/** Fast, read-only check used by live entity forms and diagnostics. */
duplicatesRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    const parsed = checkSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'VALIDATION', 'invalid duplicate check', parsed.error.issues);
    res.json(await checkDuplicateDraft(parsed.data.draft, { excludeId: parsed.data.excludeId, limit: parsed.data.limit }));
  }),
);

duplicatesRouter.post(
  '/dismiss',
  asyncHandler(async (req, res) => {
    const { aId, bId } = req.body ?? {};
    if (!aId || !bId) throw new HttpError(422, 'VALIDATION', 'aId and bId are required');
    await dismissPair(String(aId), String(bId));
    res.json({ ok: true });
  }),
);

duplicatesRouter.post(
  '/merge',
  asyncHandler(async (req, res) => {
    const { keepId, dropId, fields } = req.body ?? {};
    if (!keepId || !dropId) throw new HttpError(422, 'VALIDATION', 'keepId and dropId are required');
    const merge = await mergePair(String(keepId), String(dropId), (fields as Record<string, 'keep' | 'drop'>) ?? {}, {
      actor: req.user?.email,
    });
    searchIndex.markDirty();
    const { pre: _pre, ...summary } = merge;
    res.json({ merge: summary });
  }),
);

duplicatesRouter.get(
  '/merges',
  asyncHandler(async (_req, res) => {
    res.json({ merges: await listMerges() });
  }),
);

/**
 * Undo a merge. FR-003: a record edited since the merge makes undo a conflict
 * (409 MERGE_CONFLICT with the offending ids), never a silent overwrite.
 */
duplicatesRouter.post(
  '/merges/:id/undo',
  asyncHandler(async (req, res) => {
    try {
      await undoMerge(req.params.id, { actor: req.user?.email });
    } catch (err) {
      if (err instanceof MergeConflictError) {
        throw new HttpError(409, 'MERGE_CONFLICT', err.message, { conflicts: err.conflicts });
      }
      throw new HttpError(409, 'UNDO_FAILED', (err as Error).message);
    }
    searchIndex.markDirty();
    res.json({ ok: true });
  }),
);
