import { Router } from 'express';
import { parseCapture } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { commitCapture } from '../../services/capture.js';

export const captureRouter: Router = Router();

/** Live preview, parse only, no writes (drives the ⌘K chip preview). */
captureRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const raw = String(req.body?.raw ?? '');
    res.json({ plan: parseCapture(raw) });
  }),
);

/** Commit a capture line into linked records (SRS FR-CAP-001). */
captureRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = String(req.body?.raw ?? '').trim();
    if (!raw) throw new HttpError(400, 'EMPTY', 'Nothing to capture.');
    const result = await commitCapture(raw, { lastViewedId: req.body?.lastViewedId });
    res.status(201).json(result);
  }),
);
