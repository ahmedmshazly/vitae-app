/**
 * Cover letters: CRUD (SRS FR-RES-020) and compilation (FR-RES-021).
 *
 * `/compile` previews and `/finalize` stores the artifact pair, the same split
 * the résumé routes have. Both answer 200 with `offline: true` and the full
 * .tex when the build service cannot be reached, because a compiler that is
 * down must not take the rest of the flow with it (FR-RES-013 / REL-005).
 */
import { Router } from 'express';
import { repository } from '../../db/repository.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import {
  compileLetter,
  createLetter,
  finalizeLetter,
  getLetter,
  listLetters,
  setLetterDeleted,
  updateLetter,
  type LetterCompileResult,
} from '../../services/letters.js';
import { storage } from '../../services/storage/cloudinary.js';

/** One response shape for both compile and finalize, so the screen reads one thing. */
function compileResponse(result: LetterCompileResult) {
  const { compile } = result;
  return {
    ok: compile.ok,
    pages: compile.pages ?? null,
    offline: compile.offline ?? false,
    error: compile.error ?? null,
    logTail: compile.logTail ?? null,
    pdfBase64: compile.pdfBase64 ?? null,
    tex: result.tex,
    template: `${result.template.key}@${result.template.version}`,
    letter: result.letter,
  };
}

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

/** Render + compile for preview. Stores nothing (FR-RES-021). */
lettersRouter.post(
  '/:id/compile',
  asyncHandler(async (req, res) => {
    res.json(compileResponse(await compileLetter(req.params.id)));
  }),
);

/** Compile and keep the PDF + source as this letter's artifacts (FR-RES-021). */
lettersRouter.post(
  '/:id/finalize',
  asyncHandler(async (req, res) => {
    res.json(compileResponse(await finalizeLetter(req.params.id, req.user?.email)));
  }),
);

/**
 * A short-lived signed URL for one stored artifact, mirroring the résumé route.
 * The 409 is the honest answer for a letter that was finalized while storage
 * was unreachable: the record exists, the file does not.
 */
lettersRouter.get(
  '/:id/artifacts/:kind',
  asyncHandler(async (req, res) => {
    if (!['pdf', 'tex'].includes(req.params.kind)) {
      throw new HttpError(404, 'NOT_FOUND', 'artifact not found');
    }
    const letter = await getLetter(req.params.id);
    if (!letter || letter.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'letter not found');
    const artifactId = (letter.artifact_ids as Record<string, string> | undefined)?.[req.params.kind];
    const artifact = artifactId
      ? await repository.docGet<Record<string, unknown>>('attachments', artifactId)
      : null;
    if (!artifact?.storage_key) {
      throw new HttpError(
        409,
        'ARTIFACT_UNAVAILABLE',
        'This letter has no stored artifact. Finalize it again to rebuild the PDF and source.',
      );
    }
    res.json({
      url: await storage.signedUrl(String(artifact.storage_key), 300, String(artifact.mime)),
      expiresIn: 300,
      filename: artifact.filename,
      sha256: artifact.sha256,
    });
  }),
);
