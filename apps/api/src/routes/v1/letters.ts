/**
 * Cover-letter CRUD (SRS FR-RES-020). Blocks are stored as structured drafts;
 * LaTeX/PDF compile is deferred until letter templates exist.
 */
import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import {
  createLetter,
  getLetter,
  listLetters,
  setLetterDeleted,
  updateLetter,
} from '../../services/letters.js';

export const lettersRouter: Router = Router();

lettersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const letters = await listLetters({
      includeDeleted: req.query.includeDeleted === 'true',
      targetId: typeof req.query.targetId === 'string' ? req.query.targetId : undefined,
      resumeId: typeof req.query.resumeId === 'string' ? req.query.resumeId : undefined,
    });
    res.json({ letters });
  }),
);

lettersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const letter = await createLetter(req.body, req.user?.email);
    res.status(201).json({ letter });
  }),
);

lettersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const letter = await getLetter(req.params.id);
    if (!letter || (letter.deleted_at && req.query.includeDeleted !== 'true')) {
      throw new HttpError(404, 'NOT_FOUND', 'letter not found');
    }
    res.json({ letter });
  }),
);

lettersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const letter = await updateLetter(req.params.id, req.body, req.user?.email);
    res.json({ letter });
  }),
);

lettersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const letter = await setLetterDeleted(req.params.id, true, req.user?.email);
    res.json({ letter });
  }),
);

lettersRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const letter = await setLetterDeleted(req.params.id, false, req.user?.email);
    res.json({ letter });
  }),
);
