/**
 * Correspondence rollup (SRS FR-COMM-002): dormant-but-once-strong ties
 * ranked for reactivation, and the brokers introductions have flowed through.
 *
 * The reactivation ranking is deliberately zero new mathematics: a tie's
 * history is re-read with the same Hawkes kernel that scores it today —
 * `computeTieStrength` evaluated at each interaction instant — so the peak
 * and the present come from one model and two screens can never disagree
 * about what "strong" means. The organizational research this surfaces is
 * blunt: reconnected dormant ties outperform active ones, and people left to
 * choose reconnect with whoever feels comfortable instead of whoever would
 * help. A computed, explained ranking is the corrective (NFR-PRIV-003).
 */
import { CORRESPONDENCE } from './constants.js';
import {
  computeTieStrength,
  type InteractionEvent,
  type TieStrength,
} from './tie-strength.js';

export interface ReactivationTieInput {
  /** The person on the other end of the KNOWS edge. */
  personId: string;
  closeness?: number | null;
  cadenceTargetDays?: number | null;
  interactions: InteractionEvent[];
}

export interface ReactivationCandidate {
  personId: string;
  /** The tie as it stands now — status is 'dormant' for every candidate. */
  current: TieStrength;
  /** The tie at its historical best, same model, evaluated then. */
  peak: TieStrength;
  /** When the peak was reached (the interaction instant that produced it). */
  peakAt: string;
  /** Ranking score: what was lost — peak strength, discounted by nothing. */
  score: number;
}

export interface ReactivationRollup {
  candidates: ReactivationCandidate[];
  /** How many dormant ties were considered, so a cap cannot read as a census. */
  consideredDormant: number;
}

const MS = 1;

/**
 * Rank dormant ties by how strong they once were. A tie qualifies when its
 * current status is dormant and its historical peak strength reached
 * `minPeakStrength`; it ranks by that peak, then by how long it has been
 * quiet — the most valuable loss first, not the most comfortable.
 */
export function rankReactivation(
  ties: ReactivationTieInput[],
  opts: { now?: Date; minPeakStrength?: number; limit?: number } = {},
): ReactivationRollup {
  const now = opts.now ?? new Date();
  const minPeak = opts.minPeakStrength ?? CORRESPONDENCE.minPeakStrength;
  const limit = opts.limit ?? CORRESPONDENCE.maxCandidates;

  const candidates: ReactivationCandidate[] = [];
  let consideredDormant = 0;

  for (const tie of ties) {
    const current = computeTieStrength({
      closeness: tie.closeness,
      cadenceTargetDays: tie.cadenceTargetDays,
      interactions: tie.interactions,
      now,
    });
    if (current.status !== 'dormant') continue;
    consideredDormant += 1;

    // The peak is the same model read at each interaction instant (plus a
    // millisecond, so the event at that instant counts itself).
    let peak: TieStrength | null = null;
    let peakAt = '';
    for (const event of tie.interactions) {
      const at = event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
      if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) continue;
      const then = computeTieStrength({
        closeness: tie.closeness,
        cadenceTargetDays: tie.cadenceTargetDays,
        interactions: tie.interactions,
        now: new Date(at.getTime() + MS),
      });
      if (!peak || then.strength > peak.strength) {
        peak = then;
        peakAt = at.toISOString();
      }
    }
    if (!peak || peak.strength < minPeak) continue;

    candidates.push({ personId: tie.personId, current, peak, peakAt, score: peak.strength });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.current.daysSinceLast ?? 0) - (a.current.daysSinceLast ?? 0) ||
      a.personId.localeCompare(b.personId),
  );
  return { candidates: candidates.slice(0, limit), consideredDormant };
}

export interface BrokerTally {
  /** The met_via label as written on the relationship edges. */
  via: string;
  count: number;
}

/**
 * Who introductions have flowed through: a tally of the `met_via` labels the
 * relationship edges already carry. Free text by design — the broker a
 * person credits is a fact about the relationship, not a graph join.
 */
export function brokerTally(metVia: Array<string | null | undefined>): BrokerTally[] {
  const counts = new Map<string, number>();
  for (const raw of metVia) {
    const via = (raw ?? '').trim();
    if (!via) continue;
    counts.set(via, (counts.get(via) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([via, count]) => ({ via, count }))
    .sort((a, b) => b.count - a.count || a.via.localeCompare(b.via));
}
