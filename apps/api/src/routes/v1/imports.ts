import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { searchIndex } from '../../db/search-index.js';
import {
  commitImport,
  discardImport,
  getBatch,
  githubSync,
  ImportContentError,
  listBatches,
  rollbackImport,
  setRowDecision,
  stageImport,
} from '../../services/imports.js';

export const importsRouter: Router = Router();

// Files are read client-side (FileReader) and posted as text, no multipart.
// The 15 MB limit for this path is mounted in app.ts, ahead of the global 2 MB
// parser: a router-local parser runs too late to raise it (FR-010).

const stageSchema = z.object({
  kind: z.enum(['linkedin', 'contacts', 'calendar', 'bookmarks', 'resume', 'aperture']),
  filename: z.string().max(300).nullish(),
  content: z.string().min(1),
  mapping: z
    .object({ name: z.string(), email: z.string(), phone: z.string(), company: z.string(), city: z.string() })
    .partial()
    .optional(),
});

importsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ batches: await listBatches() });
  }),
);

/** Stage an upload: parse + dedupe-check, nothing written to the graph yet. */
importsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = stageSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'VALIDATION', 'kind and content are required', parsed.error.issues);
    let staged: Awaited<ReturnType<typeof stageImport>>;
    try {
      staged = await stageImport(parsed.data.kind, parsed.data.filename ?? null, parsed.data.content, parsed.data.mapping);
    } catch (error) {
      if (error instanceof ImportContentError) {
        throw new HttpError(422, 'INVALID_IMPORT_CONTENT', error.message);
      }
      throw error;
    }
    const { batch, rows } = staged;
    res.status(201).json({ batch, rows });
  }),
);

/** Direct GitHub sync: PAT comes from settings, never from the request. */
importsRouter.post(
  '/github/sync',
  asyncHandler(async (_req, res) => {
    const result = await githubSync();
    if (result.status === 'not_configured') throw new HttpError(400, 'NOT_CONFIGURED', 'Add a GitHub token in Settings first.');
    if (result.status === 'unauthorized') throw new HttpError(502, 'GITHUB_UNAUTHORIZED', 'GitHub rejected the token, it may be revoked or expired.');
    searchIndex.markDirty();
    res.json(result);
  }),
);

importsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const found = await getBatch(req.params.id);
    if (!found) throw new HttpError(404, 'NOT_FOUND', 'Import batch not found.');
    res.json(found);
  }),
);

/** Flip a staged row between accept/skip; optionally patch its payload. */
importsRouter.patch(
  '/:id/rows/:rowId',
  asyncHandler(async (req, res) => {
    const decision = req.body?.decision as 'accept' | 'skip' | undefined;
    if (decision && decision !== 'accept' && decision !== 'skip') throw new HttpError(422, 'VALIDATION', 'decision must be accept or skip');
    await setRowDecision(req.params.id, req.params.rowId, decision ?? 'accept', req.body?.payload as Record<string, unknown> | undefined);
    res.json({ ok: true });
  }),
);

importsRouter.post(
  '/:id/commit',
  asyncHandler(async (req, res) => {
    const result = await commitImport(req.params.id);
    searchIndex.markDirty();
    res.json(result);
  }),
);

importsRouter.post(
  '/:id/rollback',
  asyncHandler(async (req, res) => {
    const result = await rollbackImport(req.params.id);
    searchIndex.markDirty();
    res.json(result);
  }),
);

importsRouter.post(
  '/:id/discard',
  asyncHandler(async (req, res) => {
    await discardImport(req.params.id);
    res.json({ ok: true });
  }),
);
