/**
 * Relationship tie-strength (SRS §10.3, upgraded per §10.7.1).
 *
 * Tie strength is two-dimensional [Marsden & Campbell 1984; Gilbert &
 * Karahalios 2009]: self-reported *closeness* plus interaction *intensity*. The
 * intensity term is the conditional intensity of a Hawkes-type self-exciting
 * point process with an exponential kernel, the standard model for bursty
 * human communication [Masuda 2012; Halpin & De Boeck 2013]:
 *
 *     R(t) = Σᵢ w(kindᵢ) · exp( −(t − tᵢ) / τ )              (τ = 90 days)
 *
 * scaled by a temporal-regularity multiplier (distinct contact days beat raw
 * volume [Ureña-Carrión 2020]) and combined with closeness:
 *
 *     strength = clamp( 0.45·(closeness/5) + 0.55·min(R/3, 1), 0, 1 )
 *
 * Decay uses per-tie adaptive thresholds (multiples of the tie's own median
 * inter-contact gap [Navarro 2017]), with the user's cadence_target as an
 * override. Everything here is deterministic and fully decomposed into the
 * `factors` object shown on the person page.
 */
import { TIE_STRENGTH } from './constants.js';

export interface InteractionEvent {
  kind: string;
  /** When it happened. Future-dated events are ignored. */
  occurredAt: Date | string;
}

export interface TieInput {
  /** Self-reported closeness 1-5 (SRS E1). Absent ⇒ treated as 2. */
  closeness?: number | null;
  interactions: InteractionEvent[];
  /** User override; when set, replaces the adaptive decaying threshold. */
  cadenceTargetDays?: number | null;
  /** Reference "now" for reproducibility (defaults to Date.now()). */
  now?: Date;
}

export type TieStatus = 'active' | 'decaying' | 'dormant';

export interface TieStrength {
  strength: number;
  intensity: number;
  regularityMultiplier: number;
  distinctContactDays: number;
  lastInteractionAt: string | null;
  daysSinceLast: number | null;
  medianGapDays: number | null;
  status: TieStatus;
  /** The two additive contributions to `strength`, for factor chips. */
  factors: { closeness: number; intensity: number };
}

const MS_PER_DAY = 86_400_000;

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function kindWeight(kind: string): number {
  return TIE_STRENGTH.kindWeights[kind] ?? TIE_STRENGTH.kindWeights.message!;
}

function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 === 0
    ? (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2
    : sortedAsc[mid]!;
}

/** Compute the full tie-strength decomposition for one relationship. */
export function computeTieStrength(input: TieInput): TieStrength {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const closeness = clamp(input.closeness ?? 2, 1, 5);

  // Past interactions only, ascending by time.
  const events = input.interactions
    .map((e) => ({ kind: e.kind, at: toDate(e.occurredAt) }))
    .filter((e) => !Number.isNaN(e.at.getTime()) && e.at.getTime() <= nowMs)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const { tauDays, rNorm, closenessWeight, intensityWeight } = TIE_STRENGTH;

  // Hawkes exponential-kernel intensity R(t).
  let R = 0;
  for (const e of events) {
    const ageDays = (nowMs - e.at.getTime()) / MS_PER_DAY;
    R += kindWeight(e.kind) * Math.exp(-ageDays / tauDays);
  }

  // Temporal-regularity multiplier from distinct contact days in the window.
  const windowStart = nowMs - TIE_STRENGTH.regularityWindowDays * MS_PER_DAY;
  const distinctDays = new Set(
    events
      .filter((e) => e.at.getTime() >= windowStart)
      .map((e) => Math.floor(e.at.getTime() / MS_PER_DAY)),
  ).size;
  const regularityMultiplier =
    1 +
    TIE_STRENGTH.regularityCoeff *
      Math.min(distinctDays / TIE_STRENGTH.regularityDistinctDaysTarget, 1);
  R *= regularityMultiplier;

  const closenessTerm = closenessWeight * (closeness / 5);
  const intensityTerm = intensityWeight * Math.min(R / rNorm, 1);
  const strength = clamp(closenessTerm + intensityTerm, 0, 1);

  // Decay analysis from inter-contact gaps.
  const gaps: number[] = [];
  for (let i = 1; i < events.length; i++) {
    gaps.push((events[i]!.at.getTime() - events[i - 1]!.at.getTime()) / MS_PER_DAY);
  }
  const medianGapDays = median([...gaps].sort((a, b) => a - b));

  const last = events.at(-1) ?? null;
  const lastInteractionAt = last ? last.at.toISOString() : null;
  const daysSinceLast = last ? (nowMs - last.at.getTime()) / MS_PER_DAY : null;

  const status = classifyStatus(
    daysSinceLast,
    medianGapDays,
    input.cadenceTargetDays ?? null,
  );

  return {
    strength: round(strength),
    intensity: round(R),
    regularityMultiplier: round(regularityMultiplier),
    distinctContactDays: distinctDays,
    lastInteractionAt,
    daysSinceLast: daysSinceLast === null ? null : round(daysSinceLast),
    medianGapDays: medianGapDays === null ? null : round(medianGapDays),
    status,
    factors: { closeness: round(closenessTerm), intensity: round(intensityTerm) },
  };
}

function classifyStatus(
  daysSinceLast: number | null,
  medianGapDays: number | null,
  cadenceTargetDays: number | null,
): TieStatus {
  if (daysSinceLast === null) return 'active';

  if (medianGapDays !== null && medianGapDays > 0) {
    if (daysSinceLast > TIE_STRENGTH.dormantGapMultiplier * medianGapDays) return 'dormant';
    const adaptive = TIE_STRENGTH.decayingGapMultiplier * medianGapDays;
    const threshold = cadenceTargetDays ? Math.min(cadenceTargetDays, adaptive) : adaptive;
    if (daysSinceLast > threshold) return 'decaying';
    return 'active';
  }

  // Not enough history for an adaptive threshold, fall back to cadence only.
  if (cadenceTargetDays && daysSinceLast > cadenceTargetDays) return 'decaying';
  return 'active';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
