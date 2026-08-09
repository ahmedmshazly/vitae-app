import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';

export const viewsRouter: Router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().min(1).max(500),
});

/** Saved views, named filter queries pinned to the nav (SRS FR-ORG-005). */
viewsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await repository.docList<Record<string, unknown>>('saved_views');
    const views = rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    res.json({ views });
  }),
);

viewsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID', 'A view needs a name and a query.');
    const view = { id: newId(), ...parsed.data, created_at: nowIso() };
    await repository.docPut('saved_views', view.id, view as unknown as Record<string, unknown>);
    res.status(201).json({ view });
  }),
);

viewsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await repository.docDelete('saved_views', req.params.id);
    res.json({ ok: true });
  }),
);
