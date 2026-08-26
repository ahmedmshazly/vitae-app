import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';

export const ledgerRouter: Router = Router();

/**
 * What changed since the operator last looked (SRS FR-PROV-002). Every
 * mutation already writes a revision in the same transaction; this reads
 * that history back as a feed. Each entry names the operation, the subject,
 * and the fields its diff touched, and labels itself from its own snapshot —
 * a stored title cannot go stale the way a join against the live record can,
 * and it still names records that have since been deleted.
 */
ledgerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : undefined;

    // One extra row answers "is there another page" without a count query.
    const rows = await repository.ledger(limit + 1, before);
    const page = rows.slice(0, limit);

    const entries = page.map((r) => {
      const snapshot = (r.snapshot ?? {}) as Record<string, unknown>;
      const diff = (r.diff ?? {}) as Record<string, unknown>;
      return {
        id: String(r.id ?? ''),
        at: String(r.at ?? ''),
        op: String(r.op ?? ''),
        source: String(r.source ?? 'manual'),
        subject_kind: String(r.subject_kind ?? 'node'),
        subject_id: String(r.subject_id ?? ''),
        rev: Number(r.rev ?? 0),
        title:
          typeof snapshot.title === 'string' && snapshot.title
            ? snapshot.title
            : typeof snapshot.note === 'string' && snapshot.note
              ? snapshot.note
              : null,
        type: typeof snapshot.type === 'string' ? snapshot.type : null,
        changed: Object.keys(diff),
      };
    });

    const last = page[page.length - 1] as Record<string, unknown> | undefined;
    res.json({
      entries,
      next_before: rows.length > limit && last ? String(last.at ?? '') : null,
    });
  }),
);
