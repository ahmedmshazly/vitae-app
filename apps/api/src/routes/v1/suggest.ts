import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { isSuggestKind, suggestValues } from '../../services/suggest.js';

export const suggestRouter: Router = Router();

/**
 * Existing values for a form field (FR-CAP-003). Two sources:
 *
 *   ?kind=city                         a curated pool that crosses types
 *   ?type=organization&prop=industry    this field's own previous values
 *
 * The second needs no curation, so every text field in the app gets suggestions
 * without anything being wired per field. `type` may name a node or an edge
 * type, the vocabularies are disjoint (`organization` vs `KNOWS`), so one
 * parameter is unambiguous.
 *
 * An unrecognised kind, or a field nothing has been typed into yet, returns an
 * empty list rather than an error: that is the ordinary first case, and the
 * input has to stay usable regardless.
 *
 * Scanning and caching live in services/suggest.ts, this route only parses.
 */
suggestRouter.get(
  '/values',
  asyncHandler(async (req, res) => {
    const kindParam = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const prop = typeof req.query.prop === 'string' ? req.query.prop : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : '';

    if (kindParam !== undefined && !isSuggestKind(kindParam)) {
      res.json({ kind: kindParam, values: [] });
      return;
    }

    const values = await suggestValues({ kind: kindParam, type, prop, q });
    res.json({ kind: kindParam ?? null, type: type ?? null, prop: prop ?? null, values });
  }),
);
