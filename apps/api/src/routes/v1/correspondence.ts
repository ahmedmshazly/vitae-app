import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { correspondenceRollup } from '../../services/crm.js';

export const correspondenceRouter: Router = Router();

/**
 * The correspondence rollup (SRS FR-COMM-002): dormant-but-once-strong ties
 * ranked for reactivation, with the evidence for each — peak strength and
 * when it stood, current strength, quiet days, and the factor decomposition
 * the interface shows (NFR-PRIV-003) — plus the brokers the relationship
 * edges credit for introductions. Reciprocity and reply latency belong to
 * FR-COMM-001 and wait on directional interaction data by design.
 */
correspondenceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rollup = await correspondenceRollup();
    res.json({
      candidates: rollup.candidates.map((c) => ({
        person: { id: c.person.id, title: c.person.title, type: c.person.type },
        score: c.score,
        peak_strength: c.peakStrength,
        peak_at: c.peakAt,
        current_strength: c.currentStrength,
        days_since_last: c.daysSinceLast,
        factors: c.factors,
      })),
      considered_dormant: rollup.consideredDormant,
      brokers: rollup.brokers,
    });
  }),
);
