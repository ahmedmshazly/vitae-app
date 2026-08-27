/**
 * Dossiers: the selection, and the document it compiles to (SRS FR-DOS-001,
 * FR-DOS-002).
 *
 * `/compile` is a GET because it writes nothing. The document and its
 * provenance appendix are derived from the stored selection and the live graph
 * every time they are asked for, so there is no compiled copy to go stale, and
 * nothing here has a side effect worth a POST. Typesetting one to PDF through
 * the build service is a separate, later step for the same reason the résumé
 * routes split preview from finalize.
 *
 * `/audiences` publishes the section grammars rather than making the browser
 * carry its own copy of them. The Career workspace's pipeline ordering used to
 * live in the browser and drifted from the server for exactly that reason.
 */
import { DOSSIER_AUDIENCES, DOSSIER_GRAMMAR } from '@vitae/core';
import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import {
  compileDossier,
  createDossier,
  deleteDossier,
  getDossier,
  listDossiers,
  updateDossier,
} from '../../services/dossier.js';
import { HttpError } from '../../middleware/error.js';

export const dossiersRouter: Router = Router();

dossiersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const dossiers = await listDossiers({
      includeDeleted: req.query.includeDeleted === 'true',
      subjectNode: typeof req.query.subjectNode === 'string' ? req.query.subjectNode : undefined,
    });
    res.json({ dossiers });
  }),
);

// Declared before `/:id`, or express reads "audiences" as a dossier id and the
// grammar endpoint answers 404 for the rest of its life.
dossiersRouter.get('/audiences', (_req, res) => {
  res.json({
    audiences: DOSSIER_AUDIENCES.map((audience) => ({
      audience,
      sections: DOSSIER_GRAMMAR[audience],
    })),
  });
});

dossiersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json({ dossier: await createDossier(req.body) });
  }),
);

dossiersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const dossier = await getDossier(req.params.id);
    if (!dossier || dossier.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'dossier not found');
    res.json({ dossier });
  }),
);

dossiersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ dossier: await updateDossier(req.params.id, req.body) });
  }),
);

dossiersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ dossier: await deleteDossier(req.params.id) });
  }),
);

dossiersRouter.get(
  '/:id/compile',
  asyncHandler(async (req, res) => {
    // Answered whole even when it does not satisfy its grammar. The violations
    // are the reason an operator opened this screen, and returning an error
    // instead would hide the half of the packet that is already right.
    res.json(await compileDossier(req.params.id));
  }),
);
