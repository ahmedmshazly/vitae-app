import { describe, expect, it } from 'vitest';
import { computeTieStrength } from './tie-strength.js';

const NOW = new Date('2026-07-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('computeTieStrength (Hawkes kernel, SRS §10.7.1)', () => {
  it('is closeness-only with no interactions', () => {
    const r = computeTieStrength({ closeness: 5, interactions: [], now: NOW });
    expect(r.intensity).toBe(0);
    expect(r.strength).toBeCloseTo(0.45 * (5 / 5), 5); // 0.45
    expect(r.status).toBe('active');
    expect(r.lastInteractionAt).toBeNull();
  });

  it('recent interaction raises strength above closeness-only', () => {
    const base = computeTieStrength({ closeness: 3, interactions: [], now: NOW });
    const withMeeting = computeTieStrength({
      closeness: 3,
      interactions: [{ kind: 'meeting', occurredAt: daysAgo(1) }],
      now: NOW,
    });
    expect(withMeeting.strength).toBeGreaterThan(base.strength);
    expect(withMeeting.intensity).toBeGreaterThan(0);
  });

  it('decays with age, an old meeting contributes less than a recent one', () => {
    const recent = computeTieStrength({
      interactions: [{ kind: 'meeting', occurredAt: daysAgo(1) }],
      now: NOW,
    });
    const old = computeTieStrength({
      interactions: [{ kind: 'meeting', occurredAt: daysAgo(180) }],
      now: NOW,
    });
    expect(recent.intensity).toBeGreaterThan(old.intensity);
  });

  it('weights meetings above messages (SRS kind weights)', () => {
    const meeting = computeTieStrength({
      interactions: [{ kind: 'meeting', occurredAt: daysAgo(2) }],
      now: NOW,
    });
    const message = computeTieStrength({
      interactions: [{ kind: 'message', occurredAt: daysAgo(2) }],
      now: NOW,
    });
    expect(meeting.intensity).toBeGreaterThan(message.intensity);
  });

  it('temporal-regularity multiplier rewards distinct contact days', () => {
    // 12 messages on one day vs 12 messages across 12 distinct days.
    const oneDay = computeTieStrength({
      interactions: Array.from({ length: 12 }, () => ({ kind: 'message', occurredAt: daysAgo(3) })),
      now: NOW,
    });
    const spread = computeTieStrength({
      interactions: Array.from({ length: 12 }, (_, i) => ({ kind: 'message', occurredAt: daysAgo(3 + i) })),
      now: NOW,
    });
    expect(spread.distinctContactDays).toBe(12);
    expect(oneDay.distinctContactDays).toBe(1);
    expect(spread.regularityMultiplier).toBeGreaterThan(oneDay.regularityMultiplier);
  });

  it('flags a tie as decaying past the adaptive threshold', () => {
    // Regular monthly contact then a long silence → decaying.
    const r = computeTieStrength({
      closeness: 4,
      interactions: [
        { kind: 'call', occurredAt: daysAgo(400) },
        { kind: 'call', occurredAt: daysAgo(370) },
        { kind: 'call', occurredAt: daysAgo(340) },
        { kind: 'call', occurredAt: daysAgo(310) }, // ~30-day gaps; silent 310d now
      ],
      now: NOW,
    });
    expect(r.medianGapDays).toBeCloseTo(30, 0);
    expect(r.status).toBe('dormant'); // 310 > 8×30
  });

  it('ignores future-dated interactions', () => {
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    const r = computeTieStrength({ interactions: [{ kind: 'meeting', occurredAt: future }], now: NOW });
    expect(r.intensity).toBe(0);
  });

  it('clamps strength to [0,1]', () => {
    const r = computeTieStrength({
      closeness: 5,
      interactions: Array.from({ length: 50 }, (_, i) => ({ kind: 'meeting', occurredAt: daysAgo(i % 10) })),
      now: NOW,
    });
    expect(r.strength).toBeLessThanOrEqual(1);
    expect(r.strength).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic, identical inputs give identical output', () => {
    const input = {
      closeness: 4,
      interactions: [{ kind: 'coffee', occurredAt: daysAgo(10) }],
      now: NOW,
    };
    expect(computeTieStrength(input)).toEqual(computeTieStrength(input));
  });
});
