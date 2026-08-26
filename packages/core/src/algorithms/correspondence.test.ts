/**
 * Correspondence rollup: a dormant tie that was once strong ranks for
 * reactivation by its peak, computed with the same kernel that scores it
 * today; an active tie and a never-strong tie both stay out; brokers tally
 * the met_via labels as written.
 */
import { describe, expect, it } from 'vitest';
import { brokerTally, rankReactivation } from './correspondence.js';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** A burst of meetings `endDaysAgo`..`endDaysAgo+count` days back, one per day. */
function burst(endDaysAgo: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'meeting',
    occurredAt: day(endDaysAgo + i),
  }));
}

describe('rankReactivation', () => {
  it('ranks a dormant-but-once-strong tie by its peak, and explains both ends', () => {
    const rollup = rankReactivation(
      [
        // Ten meetings ending 400 days ago: strong then, long dormant now.
        { personId: 'lost-ally', closeness: 4, interactions: burst(400, 10) },
        // Three meetings this week: active, not a candidate.
        { personId: 'current-friend', closeness: 4, interactions: burst(1, 3) },
        // Two messages around a year ago: dormant, but never strong. (A
        // single interaction can never be dormant — the adaptive threshold
        // needs a gap history — which is itself the model behaving.)
        {
          personId: 'faint-contact',
          closeness: 1,
          interactions: [
            { kind: 'message', occurredAt: day(400) },
            { kind: 'message', occurredAt: day(370) },
          ],
        },
      ],
      { now: NOW },
    );

    expect(rollup.candidates.map((c) => c.personId)).toEqual(['lost-ally']);
    expect(rollup.consideredDormant).toBe(2);
    const only = rollup.candidates[0]!;
    expect(only.current.status).toBe('dormant');
    expect(only.peak.strength).toBeGreaterThan(only.current.strength);
    expect(only.peakAt.slice(0, 4)).toBe('2025');
    expect(only.score).toBe(only.peak.strength);
  });

  it('is deterministic and honours the candidate cap while counting the rest', () => {
    const ties = Array.from({ length: 6 }, (_, i) => ({
      personId: `p${i}`,
      closeness: 5,
      interactions: burst(300 + i, 8),
    }));
    const a = rankReactivation(ties, { now: NOW, limit: 3 });
    const b = rankReactivation(ties, { now: NOW, limit: 3 });
    expect(a.candidates.map((c) => c.personId)).toEqual(b.candidates.map((c) => c.personId));
    expect(a.candidates).toHaveLength(3);
    expect(a.consideredDormant).toBe(6);
  });

  it('ignores future-dated and unparseable interaction times', () => {
    const rollup = rankReactivation(
      [
        {
          personId: 'odd-data',
          closeness: 4,
          interactions: [
            ...burst(300, 8),
            { kind: 'meeting', occurredAt: day(-30) },
            { kind: 'meeting', occurredAt: 'not a date' },
          ],
        },
      ],
      { now: NOW },
    );
    expect(rollup.candidates).toHaveLength(1);
    expect(rollup.candidates[0]!.peakAt.slice(0, 4)).toBe('2025');
  });
});

describe('brokerTally', () => {
  it('tallies labels as written, ties broken alphabetically', () => {
    expect(
      brokerTally(['Nadia', 'Nadia', '  ', null, undefined, 'DevFest', 'Amr', 'DevFest']),
    ).toEqual([
      { via: 'DevFest', count: 2 },
      { via: 'Nadia', count: 2 },
      { via: 'Amr', count: 1 },
    ]);
  });
});
