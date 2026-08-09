import { Router } from 'express';
import { z } from 'zod';
import { parsedJdSchema, targetCreateSchema } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import {
  createTarget,
  getTarget,
  listTargets,
  setTargetDeleted,
  updateTarget,
  updateTargetDraft,
  updateTargetKeywords,
} from '../../services/resume.js';

export const targetsRouter: Router = Router();

/** All targets, newest activity first, the Tailor's session list. */
targetsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    let targets = await listTargets();
    if (!includeArchived) targets = targets.filter((target) => !target.deleted_at);
    if (status) targets = targets.filter((target) => target.status === status);
    if (q)
      targets = targets.filter((target) =>
        `${target.role_title ?? ''} ${target.company ?? ''}`.toLowerCase().includes(q),
      );
    res.json({ targets });
  }),
);

/** Paste a JD → parsed weighted keywords (SRS FR-RES-005). */
targetsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = targetCreateSchema.safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(422, 'VALIDATION', 'invalid target', parsed.error.issues);
    const target = await createTarget(parsed.data, req.user?.email);
    res.status(201).json({ target });
  }),
);

targetsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = targetCreateSchema
      .partial()
      .extend({
        company: targetCreateSchema.shape.company.nullable().optional(),
        jd_url: targetCreateSchema.shape.jd_url.nullable().optional(),
        status: z.enum(['saved', 'active', 'applied', 'closed']).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(422, 'VALIDATION', 'invalid target update', parsed.error.issues);
    if (!(await getTarget(req.params.id)))
      throw new HttpError(404, 'NOT_FOUND', 'target not found');
    const target = await updateTarget(req.params.id, parsed.data, req.user?.email);
    res.json({ target });
  }),
);

targetsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const target = await getTarget(req.params.id);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'target not found');
    res.json({ target });
  }),
);

/** Save the Tailor workspace draft (mode, selection, section config…). */
targetsRouter.patch(
  '/:id/draft',
  asyncHandler(async (req, res) => {
    const draft = req.body?.draft;
    if (!draft || typeof draft !== 'object')
      throw new HttpError(400, 'BAD_REQUEST', 'draft object required');
    if (!(await getTarget(req.params.id)))
      throw new HttpError(404, 'NOT_FOUND', 'target not found');
    await updateTargetDraft(req.params.id, draft as Record<string, unknown>);
    res.json({ ok: true });
  }),
);

/** Edit the parsed keyword set (add/remove/reweight: SRS FR-RES-006). */
targetsRouter.patch(
  '/:id/keywords',
  asyncHandler(async (req, res) => {
    const parsed = parsedJdSchema.safeParse(req.body?.parsed);
    if (!parsed.success)
      throw new HttpError(422, 'VALIDATION', 'invalid parsed keyword set', parsed.error.issues);
    if (parsed.data.keywords.length > 40)
      throw new HttpError(422, 'VALIDATION', 'a target may contain at most 40 keywords');
    if (parsed.data.keywords.some((keyword) => keyword.weight <= 0 || keyword.weight > 10)) {
      throw new HttpError(
        422,
        'VALIDATION',
        'keyword weights must be greater than 0 and no more than 10',
      );
    }
    await updateTargetKeywords(req.params.id, parsed.data, req.user?.email);
    res.json({ ok: true });
  }),
);

targetsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await getTarget(req.params.id)))
      throw new HttpError(404, 'NOT_FOUND', 'target not found');
    await setTargetDeleted(req.params.id, true, req.user?.email);
    res.json({ ok: true });
  }),
);

targetsRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    if (!(await getTarget(req.params.id)))
      throw new HttpError(404, 'NOT_FOUND', 'target not found');
    await setTargetDeleted(req.params.id, false, req.user?.email);
    res.json({ ok: true });
  }),
);
