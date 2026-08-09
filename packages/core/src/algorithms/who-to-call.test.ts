import { describe, expect, it } from 'vitest';
import { whoToCall, type CandidatePerson } from './who-to-call.js';

const people: CandidatePerson[] = [
  {
    id: 'sarah',
    title: 'Sarah Chen',
    affiliation: 'current',
    strength: 0.74,
    graphScore: 0.6,
    evidence: [
      { label: 'PerceptionBench', text: 'reinforcement learning perception robotics' },
      { label: 'coffee 2026-03', text: 'RL hiring at Nile' },
    ],
    favors: [{ direction: 'owed_to_me', settled: false }],
    lastInteractionAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'omar',
    title: 'Omar Khaled',
    affiliation: null,
    strength: 0.4,
    graphScore: 0.2,
    evidence: [{ label: 'notes', text: 'frontend design systems' }],
    lastInteractionAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'dnc',
    title: 'Do Not Contact',
    affiliation: 'current',
    strength: 0.9,
    doNotContact: true,
    evidence: [{ label: 'x', text: 'reinforcement learning' }],
  },
];

describe('whoToCall (SRS §10.4-A / §10.7.3)', () => {
  const ranked = whoToCall(people, { need: 'referral', terms: ['reinforcement learning', 'RL'] });

  it('ranks the topical, affiliated, strong contact first', () => {
    expect(ranked[0]!.id).toBe('sarah');
  });

  it('excludes do_not_contact people entirely', () => {
    expect(ranked.find((r) => r.id === 'dnc')).toBeUndefined();
  });

  it('decomposes the score exactly into factor chips (FR-CON-006)', () => {
    const sarah = ranked.find((r) => r.id === 'sarah')!;
    const sum = sarah.chips.reduce((a, c) => a + c.weighted, 0);
    expect(sum).toBeCloseTo(sarah.score, 3);
    const factors = sarah.chips.map((c) => c.factor);
    expect(factors).toEqual(expect.arrayContaining(['affiliation', 'topic', 'strength', 'graph', 'reciprocity']));
  });

  it('shows evidence for the topic factor', () => {
    const sarah = ranked.find((r) => r.id === 'sarah')!;
    const topic = sarah.chips.find((c) => c.factor === 'topic')!;
    expect(topic.detail).toMatch(/PerceptionBench|coffee/);
  });

  it('is deterministic, identical inputs give identical order', () => {
    const a = whoToCall(people, { terms: ['reinforcement learning'] });
    const b = whoToCall(people, { terms: ['reinforcement learning'] });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it('scores same-city geo above same-country when both match intent', () => {
    const ranked = whoToCall(
      [
        {
          id: 'city',
          title: 'City Match',
          city: 'Cairo',
          country: 'Egypt',
          evidence: [{ label: 'e', text: 'robotics' }],
        },
        {
          id: 'country',
          title: 'Country Match',
          city: 'Alexandria',
          country: 'Egypt',
          evidence: [{ label: 'e', text: 'robotics' }],
        },
      ],
      { terms: ['robotics'], city: 'Cairo', country: 'Egypt' },
    );
    const cityChip = ranked.find((r) => r.id === 'city')!.chips.find((c) => c.factor === 'geo')!;
    const countryChip = ranked.find((r) => r.id === 'country')!.chips.find((c) => c.factor === 'geo')!;
    expect(cityChip.raw).toBeGreaterThan(countryChip.raw);
  });

  it('applies a pinned boost and respects limit', () => {
    const ranked = whoToCall(
      [
        { id: 'plain', title: 'Plain', strength: 0.1 },
        { id: 'pin', title: 'Pinned', strength: 0.1, pinned: true },
      ],
      { terms: [] },
      { limit: 1 },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe('pin');
    expect(ranked[0]!.chips.some((c) => c.factor === 'pinned')).toBe(true);
  });

  it('penalizes asked-recently reciprocity', () => {
    const ranked = whoToCall(
      [
        {
          id: 'fresh',
          title: 'Fresh Ask',
          strength: 0.5,
          askedRecentlyDays: 2,
          evidence: [{ label: 'e', text: 'ml' }],
        },
      ],
      { terms: ['ml'] },
    );
    const rec = ranked[0]!.chips.find((c) => c.factor === 'reciprocity');
    expect(rec).toBeDefined();
    expect(rec!.raw).toBeLessThan(0);
  });
});
