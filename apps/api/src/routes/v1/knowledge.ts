import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import {
  decideAssertion,
  evidenceFor,
  knowledgeSummary,
  listKnowledge,
  listSourceRecords,
  putAssertion,
  putRun,
  putSource,
  putSourceIdentity,
  putSourceRecord,
  rollbackRun,
} from '../../services/knowledge.js';

export const knowledgeRouter: Router = Router();

knowledgeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [knowledge, summary] = await Promise.all([listKnowledge(), knowledgeSummary()]);
    res.json({ ...knowledge, summary });
  }),
);
knowledgeRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => res.json({ summary: await knowledgeSummary() })),
);
knowledgeRouter.post(
  '/sources',
  asyncHandler(async (req, res) => res.status(201).json({ source: await putSource(req.body) })),
);
knowledgeRouter.post(
  '/runs',
  asyncHandler(async (req, res) => res.status(201).json({ run: await putRun(req.body) })),
);
knowledgeRouter.post(
  '/records',
  asyncHandler(async (req, res) =>
    res.status(201).json({ record: await putSourceRecord(req.body) }),
  ),
);
knowledgeRouter.get(
  '/records',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        source_id: z.string().max(200).optional(),
        run_id: z.string().max(200).optional(),
        direction: z.enum(['in', 'out', 'self', 'unknown']).optional(),
        category: z.string().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    res.json(await listSourceRecords(query));
  }),
);
knowledgeRouter.post(
  '/identities',
  asyncHandler(async (req, res) =>
    res.status(201).json({ identity: await putSourceIdentity(req.body) }),
  ),
);
knowledgeRouter.post(
  '/assertions',
  asyncHandler(async (req, res) =>
    res.status(201).json({ assertion: await putAssertion(req.body) }),
  ),
);
knowledgeRouter.get(
  '/entities/:id/evidence',
  asyncHandler(async (req, res) => res.json(await evidenceFor(req.params.id))),
);
knowledgeRouter.post(
  '/assertions/:id/decision',
  asyncHandler(async (req, res) => {
    const parsed = z.object({ choice: z.enum(['apply', 'reject', 'defer']) }).safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(400, 'VALIDATION_ERROR', 'choice must be apply, reject, or defer');
    try {
      res.json(await decideAssertion(req.params.id, parsed.data.choice, req.user?.email));
    } catch (error) {
      if (error instanceof Error && error.message === 'assertion not found')
        throw new HttpError(404, 'NOT_FOUND', error.message);
      throw error;
    }
  }),
);
knowledgeRouter.post(
  '/runs/:id/rollback',
  asyncHandler(async (req, res) => res.json(await rollbackRun(req.params.id, req.user?.email))),
);
