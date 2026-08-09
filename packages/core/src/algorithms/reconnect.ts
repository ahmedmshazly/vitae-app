/**
 * Reconnect scheduling (SRS §10.7.2).
 *
 * Relationship decay under silence is the Ebbinghaus forgetting curve; the
 * MEMORIZE result [Tabibian 2019] proves the optimal review intensity under
 * exponential forgetting is proportional to (1 − recall probability). Transferred
 * to ties:
 *
 *     reconnect_priority = (closeness / 5) · (1 − min(R / 3, 1))
 *
 * The most valuable AND most-decayed ties surface first; a freshly-contacted
 * close friend drops off the lane automatically. Both terms are shown as chips.
 */
import { TIE_STRENGTH } from './constants.js';

export interface ReconnectInput {
  id: string;
  closeness?: number | null;
  /** Hawkes intensity R from computeTieStrength. */
  intensity: number;
  status?: 'active' | 'decaying' | 'dormant';
  daysSinceLast?: number | null;
}

export interface ReconnectScore {
  id: string;
  priority: number;
  valueTerm: number; // closeness/5
  decayTerm: number; // 1 − min(R/3, 1)
}

export function reconnectPriority(input: ReconnectInput): ReconnectScore {
  const closeness = Math.min(5, Math.max(1, input.closeness ?? 2));
  const valueTerm = closeness / 5;
  const decayTerm = 1 - Math.min(input.intensity / TIE_STRENGTH.rNorm, 1);
  const priority = valueTerm * decayTerm;
  return {
    id: input.id,
    priority: round(priority),
    valueTerm: round(valueTerm),
    decayTerm: round(decayTerm),
  };
}

/** Rank ties for the dashboard Reconnect lane (SRS FR-CON-004), highest first. */
export function rankReconnect(inputs: ReconnectInput[]): ReconnectScore[] {
  return inputs
    .map(reconnectPriority)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
