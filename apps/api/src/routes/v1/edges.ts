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

/**
 * The live KNOWS edge for a pair, in whichever direction it was recorded.
 *
 * `edgesForNode` rather than the whole graph: this runs on every link.
 */
async function knowsBetween(src: string, dst: string) {
  const edges = await repository.edgesForNode(src);
  return edges.find(
    (e) => e.type === 'KNOWS' && (e.src === dst || e.dst === dst) && e.src !== e.dst,
  );
}

edgesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    // KNOWS is the relationship record for a pair, so there is one of it.
    // Linking two people who already knew each other used to write a second,
    // and every reader takes the first one the graph lists: a person page then
    // showed an empty favor ledger over real favors, and each intro path
    // through that pair came back twice, crowding out the longer paths. Fold
    // the new props into the edge that exists instead. Still 201, because the
    // link the caller asked for does now exist.
    const body = (req.body ?? {}) as { type?: unknown; src?: unknown; dst?: unknown; props?: unknown };
    if (body.type === 'KNOWS' && typeof body.src === 'string' && typeof body.dst === 'string') {
      const existing = await knowsBetween(body.src, body.dst);
      if (existing) {
        // Merged, not replaced: the caller sent the fields the dialog showed,
        // and dropping closeness or favors because a topic was added is the
        // data loss this whole branch exists to stop.
        const props = { ...(existing.props ?? {}), ...((body.props ?? {}) as Record<string, unknown>) };
        const parsed = validateEdgeUpdate(existing.type, { props });
        if (!parsed.ok) throw new ValidationError('invalid edge update', parsed.errors);
        const updated = await repository.updateEdge(existing.id, parsed.value, { actor: req.user?.email });
        await recomputeKnows(updated);
        return res.status(201).json({ edge: updated });
      }
    }
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
