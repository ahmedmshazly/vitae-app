/**
 * Correspondence rollup: a dormant tie that was once strong ranks for
 * reactivation by its peak, computed with the same kernel that scores it
 * today; an active tie and a never-strong tie both stay out; brokers tally
 * the met_via labels as written.
 */
import { describe, expect, it } from 'vitest';
import { brokerTally, correspondenceProfile, introductionTally, rankReactivation } from './correspondence.js';

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

describe('correspondenceProfile (FR-COMM-001)', () => {
  const at = (n: number, id: string, initiatedBy?: 'me' | 'them') => ({
    id,
    occurredAt: day(n),
    ...(initiatedBy ? { initiatedBy } : {}),
  });

  it('returns the empty profile for no events, with nulls rather than zeros-as-facts', () => {
    const p = correspondenceProfile([], { now: NOW });
    expect(p.coverage).toEqual({ withDirection: 0, total: 0 });
    expect(p.reciprocity.ratio).toBeNull();
    expect(p.replyLatency.mine.medianDays).toBeNull();
    expect(p.replyLatency.theirs.medianDays).toBeNull();
    expect(p.unansweredInbound).toEqual({ count: 0, eventIds: [] });
    expect(p.contactDays.totalDays).toBe(0);
  });

  it('tallies a conversation: reciprocity, per-direction medians, and the ids behind each figure', () => {
    const p = correspondenceProfile(
      [at(10, 'a', 'them'), at(9, 'b', 'me'), at(5, 'c', 'them'), at(2, 'd', 'me')],
      { now: NOW },
    );
    expect(p.coverage).toEqual({ withDirection: 4, total: 4 });
    expect(p.reciprocity).toMatchObject({ outbound: 2, inbound: 2, ratio: 0.5 });
    expect(p.reciprocity.inboundIds).toEqual(['a', 'c']);
    // My replies: a→b (1 day), c→d (3 days) → median 2. Theirs: b→c (4 days).
    expect(p.replyLatency.mine.medianDays).toBe(2);
    expect(p.replyLatency.mine.samples).toEqual([
      { fromId: 'a', toId: 'b', days: 1 },
      { fromId: 'c', toId: 'd', days: 3 },
    ]);
    expect(p.replyLatency.theirs.medianDays).toBe(4);
    expect(p.unansweredInbound.count).toBe(0);
  });

  it('counts the trailing inbound run as unanswered, by id', () => {
    const p = correspondenceProfile(
      [at(20, 'a', 'me'), at(10, 'b', 'them'), at(8, 'c', 'them')],
      { now: NOW },
    );
    expect(p.unansweredInbound).toEqual({ count: 2, eventIds: ['b', 'c'] });
    // Their reply a→b (10 days) is still a reply; the run after it is the debt.
    expect(p.replyLatency.theirs.medianDays).toBe(10);
  });

  it('excludes directionless events from directional figures but never from contact', () => {
    const p = correspondenceProfile(
      [at(15, 'a'), at(10, 'b', 'them'), at(9, 'c', 'me'), at(4, 'd'), at(3, 'e')],
      { now: NOW },
    );
    expect(p.coverage).toEqual({ withDirection: 2, total: 5 });
    expect(p.reciprocity).toMatchObject({ outbound: 1, inbound: 1 });
    expect(p.contactDays.totalDays).toBe(5);
  });

  it('does not read a months-later direction change as a reply', () => {
    const p = correspondenceProfile([at(300, 'a', 'them'), at(2, 'b', 'me')], { now: NOW });
    expect(p.replyLatency.mine.medianDays).toBeNull();
    expect(p.replyLatency.mine.samples).toEqual([]);
    // The old inbound was answered late, not never: the trailing run is mine.
    expect(p.unansweredInbound.count).toBe(0);
  });

  it('buckets distinct contact days into the trailing twelve months', () => {
    const p = correspondenceProfile(
      [at(3, 'a', 'me'), at(3.2, 'b', 'them'), at(40, 'c', 'me'), at(400, 'd', 'me')],
      { now: NOW },
    );
    expect(p.contactDays.months).toHaveLength(12);
    expect(p.contactDays.months[11]!.month).toBe('2026-07');
    const counted = p.contactDays.months.reduce((sum, m) => sum + m.days, 0);
    // Day 400 sits outside the window; days 3 and 3.2 share a calendar day.
    expect(counted).toBe(2);
    expect(p.contactDays.totalDays).toBe(3);
  });

  it('buckets contact days in the request timezone, not UTC (FR-COMM-001, FR-025)', () => {
    // 02:00 UTC on 1 August is still 31 July in Los Angeles, so the event sits
    // inside the trailing-twelve-months window only when the request timezone
    // is used. UTC would drop it from July's bucket.
    const boundary = {
      id: 'b',
      occurredAt: '2026-08-01T02:00:00.000Z',
      initiatedBy: 'me' as const,
    };
    const utc = correspondenceProfile([boundary], { now: NOW });
    const la = correspondenceProfile([boundary], { now: NOW, timeZone: 'America/Los_Angeles' });
    const counted = (p: typeof utc) => p.contactDays.months.reduce((sum, m) => sum + m.days, 0);
    expect(counted(utc)).toBe(0);
    expect(counted(la)).toBe(1);
    expect(la.contactDays.months.find((m) => m.month === '2026-07')?.days).toBe(1);
  });
});

describe('introductionTally', () => {
  it('tallies recorded introductions by broker, carrying the edges behind each count', () => {
    expect(
      introductionTally([
        { edgeId: 'e2', via: 'person-nadia' },
        { edgeId: 'e1', via: 'person-nadia' },
        { edgeId: 'e3', via: 'person-amr' },
        { edgeId: 'e4', via: '  ' },
        { edgeId: 'e5' },
      ]),
    ).toEqual([
      { via: 'person-nadia', count: 2, edgeIds: ['e1', 'e2'] },
      { via: 'person-amr', count: 1, edgeIds: ['e3'] },
    ]);
  });
});
