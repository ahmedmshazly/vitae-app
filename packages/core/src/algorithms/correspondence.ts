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

/** One interaction as the profile sees it: an instant, an id, maybe a stated direction. */
export interface ProfileEvent {
  id: string;
  occurredAt: string | Date;
  /** Operator-stated; absent means unstated, never assumed. */
  initiatedBy?: 'me' | 'them' | null;
}

export interface ReplySample {
  fromId: string;
  toId: string;
  days: number;
}

export interface CorrespondenceProfile {
  /** The honesty header: how much of the history carries a direction at all. */
  coverage: { withDirection: number; total: number };
  reciprocity: {
    outbound: number;
    inbound: number;
    /** Share of directional events the operator initiated; null with no directional history. */
    ratio: number | null;
    outboundIds: string[];
    inboundIds: string[];
  };
  replyLatency: {
    mine: { medianDays: number | null; samples: ReplySample[] };
    theirs: { medianDays: number | null; samples: ReplySample[] };
  };
  unansweredInbound: { count: number; eventIds: string[] };
  contactDays: {
    totalDays: number;
    /** Trailing months, oldest first, zero-filled — chart-ready, no gaps. */
    months: Array<{ month: string; days: number }>;
  };
}

const DAY_MS = 86_400_000;

/** Calendar date in an optional IANA zone; UTC when none is named. */
function calendarDateIso(at: number, timeZone?: string): string {
  if (!timeZone) return new Date(at).toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

function yearMonthInZone(now: Date, timeZone?: string): { year: number; month: number } {
  if (!timeZone) return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
  };
}

function monthKey(now: Date, monthsBack: number, timeZone?: string): string {
  const { year, month } = yearMonthInZone(now, timeZone);
  const idx = year * 12 + (month - 1) - monthsBack;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The per-person correspondence profile (SRS FR-COMM-001): reciprocity,
 * per-direction reply latency, unanswered inbound, and the contact-day
 * distribution — every figure carrying the interaction ids that produced it
 * (NFR-PRIV-003).
 *
 * Reply pairs derive from direction alternation in the time-ordered
 * directional history: the last event of one run and the first event of the
 * next opposite run form a reply, unless the gap exceeds
 * `CORRESPONDENCE.replyPairMaxGapDays`. Events without a stated direction
 * are excluded from directional figures and reported in `coverage` — they
 * still count as contact.
 */
export function correspondenceProfile(
  events: ProfileEvent[],
  opts: { now?: Date; timeZone?: string } = {},
): CorrespondenceProfile {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone;
  const dated = events
    .map((event) => ({ ...event, at: new Date(event.occurredAt).getTime() }))
    .filter((event) => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const directional = dated.filter((e) => e.initiatedBy === 'me' || e.initiatedBy === 'them');
  const outbound = directional.filter((e) => e.initiatedBy === 'me');
  const inbound = directional.filter((e) => e.initiatedBy === 'them');

  const mine: ReplySample[] = [];
  const theirs: ReplySample[] = [];
  for (let i = 1; i < directional.length; i++) {
    const prev = directional[i - 1]!;
    const curr = directional[i]!;
    if (prev.initiatedBy === curr.initiatedBy) continue;
    const days = Math.round(((curr.at - prev.at) / DAY_MS) * 100) / 100;
    if (days > CORRESPONDENCE.replyPairMaxGapDays) continue;
    (curr.initiatedBy === 'me' ? mine : theirs).push({ fromId: prev.id, toId: curr.id, days });
  }

  const unansweredIds: string[] = [];
  for (let i = directional.length - 1; i >= 0; i--) {
    if (directional[i]!.initiatedBy !== 'them') break;
    unansweredIds.unshift(directional[i]!.id);
  }

  const dayKeys = new Set(dated.map((e) => calendarDateIso(e.at, timeZone)));
  const months: Array<{ month: string; days: number }> = [];
  for (let back = CORRESPONDENCE.contactWindowMonths - 1; back >= 0; back--) {
    const key = monthKey(now, back, timeZone);
    let days = 0;
    for (const dayKey of dayKeys) if (dayKey.startsWith(key)) days++;
    months.push({ month: key, days });
  }

  return {
    coverage: { withDirection: directional.length, total: dated.length },
    reciprocity: {
      outbound: outbound.length,
      inbound: inbound.length,
      ratio: directional.length === 0 ? null : Math.round((outbound.length / directional.length) * 100) / 100,
      outboundIds: outbound.map((e) => e.id),
      inboundIds: inbound.map((e) => e.id),
    },
    replyLatency: {
      mine: { medianDays: median(mine.map((s) => s.days)), samples: mine },
      theirs: { medianDays: median(theirs.map((s) => s.days)), samples: theirs },
    },
    unansweredInbound: { count: unansweredIds.length, eventIds: unansweredIds },
    contactDays: { totalDays: dayKeys.size, months },
  };
}

/** One recorded introduction: the connected pair, the credited broker, the edge. */
export interface IntroductionFact {
  edgeId: string;
  via?: string | null;
}

export interface RecordedBrokerTally {
  via: string;
  count: number;
  edgeIds: string[];
}

/**
 * Brokers by recorded introduction (SRS FR-COMM-003): a tally over INTRODUCED
 * edges' `via`, each count carrying the edges behind it. Distinct from
 * `brokerTally`, which counts free-text met-via credits — the two are
 * presented as separate labeled groups, never fuzzy-merged, because equating
 * a person id with a matching string would be a guess.
 */
export function introductionTally(intros: IntroductionFact[]): RecordedBrokerTally[] {
  const groups = new Map<string, string[]>();
  for (const intro of intros) {
    const via = (intro.via ?? '').trim();
    if (!via) continue;
    const list = groups.get(via) ?? [];
    list.push(intro.edgeId);
    groups.set(via, list);
  }
  return [...groups.entries()]
    .map(([via, edgeIds]) => ({ via, count: edgeIds.length, edgeIds: [...edgeIds].sort() }))
    .sort((a, b) => b.count - a.count || a.via.localeCompare(b.via));
}
