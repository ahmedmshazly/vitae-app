import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { correspondenceRollup } from '../../services/crm.js';

export const correspondenceRouter: Router = Router();

/**
 * The correspondence rollup (SRS FR-COMM-002): dormant-but-once-strong ties
 * ranked for reactivation, with the evidence for each — peak strength and
 * when it stood, current strength, quiet days, and the factor decomposition
 * the interface shows (NFR-PRIV-003) — plus the brokers the relationship
 * edges credit for introductions. Reciprocity and reply latency live on the
 * per-person profile at /people/:id/correspondence (FR-COMM-001), computed
 * from operator-stated directions and never from a guess.
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
      // FR-COMM-003: brokers by recorded INTRODUCED edges — a separate labeled
      // group from the free-text met-via credits above, never merged.
      introduced_brokers: rollup.introducedBrokers.map((b) => ({
        via: b.via,
        person_id: b.personId,
        label: b.label,
        count: b.count,
        edge_ids: b.edgeIds,
      })),
      // Reciprocity imbalance at rollup scale, from the same profile function
      // as the per-person panel (FR-COMM-001).
      out_of_balance: rollup.outOfBalance.map((row) => ({
        person: { id: row.person.id, title: row.person.title, type: row.person.type },
        ratio: row.ratio,
        outbound: row.outbound,
        inbound: row.inbound,
        unanswered_inbound: row.unansweredInbound,
      })),
    });
  }),
);
