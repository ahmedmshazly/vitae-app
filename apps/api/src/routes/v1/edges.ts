import { Router } from 'express';
import { validateEdgeUpdate } from '@vitae/core';
import { repository, ValidationError } from '../../db/repository.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { recomputeAndPersistStrength } from '../../services/crm.js';
import { getSelf } from '../../services/self.js';

export const edgesRouter: Router = Router();

/** Recompute the derived tie strength after a KNOWS edge changes. */
async function recomputeKnows(edge: { type: string; src: string; dst: string }): Promise<void> {
  if (edge.type !== 'KNOWS') return;
  const self = await getSelf();
  const personId = self && edge.src === self.id ? edge.dst : edge.src;
  await recomputeAndPersistStrength(personId);
}

edgesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const edge = await repository.createEdge(req.body, { actor: req.user?.email });
    await recomputeKnows(edge);
    res.status(201).json({ edge });
  }),
);

edgesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const edge = await repository.getEdge(req.params.id, { includeDeleted: true });
    if (!edge) throw new HttpError(404, 'NOT_FOUND', 'edge not found');
    res.json({ edge });
  }),
);

edgesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await repository.getEdge(req.params.id, { includeDeleted: true });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'edge not found');
    const parsed = validateEdgeUpdate(existing.type, req.body);
    if (!parsed.ok) throw new ValidationError('invalid edge update', parsed.errors);
    const edge = await repository.updateEdge(req.params.id, parsed.value, { actor: req.user?.email });
    // Editing a KNOWS edge (e.g. closeness) can change the derived strength.
    await recomputeKnows(edge);
    res.json({ edge });
  }),
);

edgesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const edge = await repository.softDeleteEdge(req.params.id, { actor: req.user?.email });
    await recomputeKnows(edge);
    res.json({ edge });
  }),
);

edgesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const edge = await repository.restoreEdge(req.params.id, { actor: req.user?.email });
    await recomputeKnows(edge);
    res.json({ edge });
  }),
);
