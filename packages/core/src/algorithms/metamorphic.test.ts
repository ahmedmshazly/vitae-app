/**
 * Metamorphic properties for deterministic §10.7 algorithms.
 * These assert that known input transforms leave observable results unchanged
 * (or change them only in the documented direction).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareEntities, comparePersons, scorePair } from './dedup.js';
import { astToQueryString, parseFilterQuery } from './filter-grammar.js';
import { escapeLatex } from './latex-escape.js';
import { rankReconnect, type ReconnectInput } from './reconnect.js';
import { whoToCall, type CandidatePerson } from './who-to-call.js';

const basePeople: CandidatePerson[] = [
  {
    id: 'a',
    title: 'Ada',
    affiliation: 'current',
    strength: 0.8,
    graphScore: 0.5,
    evidence: [{ label: 'e', text: 'reinforcement learning robotics' }],
    lastInteractionAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'b',
    title: 'Bea',
    affiliation: 'past',
    strength: 0.4,
    graphScore: 0.2,
    evidence: [{ label: 'e', text: 'frontend systems' }],
    lastInteractionAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'c',
    title: 'Cid',
    affiliation: null,
    strength: 0.3,
    evidence: [{ label: 'e', text: 'reinforcement learning' }],
    lastInteractionAt: '2026-04-01T00:00:00Z',
  },
];

describe('metamorphic: whoToCall', () => {
  it('reordering candidates does not change ranked ids or scores', () => {
    const intent = { terms: ['reinforcement learning'] };
    const forward = whoToCall(basePeople, intent);
    const reversed = whoToCall([...basePeople].reverse(), intent);
    expect(reversed.map((r) => ({ id: r.id, score: r.score }))).toEqual(
      forward.map((r) => ({ id: r.id, score: r.score })),
    );
  });

  it('adding an unrelated candidate does not change relative order of the originals', () => {
    const intent = { terms: ['reinforcement learning'] };
    const baseline = whoToCall(basePeople, intent).map((r) => r.id);
    const withNoise = whoToCall(
      [
        ...basePeople,
        {
          id: 'noise',
          title: 'Noise',
          evidence: [{ label: 'x', text: 'gardening tomatoes' }],
        },
      ],
      intent,
    )
      .map((r) => r.id)
      .filter((id) => id !== 'noise');
    expect(withNoise).toEqual(baseline);
  });
});

describe('metamorphic: dedup', () => {
  it('compareEntities is symmetric in verdict and score', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 40 }),
          emails: fc.array(fc.emailAddress(), { maxLength: 2 }),
        }),
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 40 }),
          emails: fc.array(fc.emailAddress(), { maxLength: 2 }),
        }),
        (left, right) => {
          const a = { type: 'person' as const, title: left.title, props: { emails: left.emails } };
          const b = { type: 'person' as const, title: right.title, props: { emails: right.emails } };
          const ab = compareEntities(a, b);
          const ba = compareEntities(b, a);
          return ab.verdict === ba.verdict && ab.score === ba.score;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('scorePair breakdown always sums to the reported weight', () => {
    const comps = comparePersons(
      { title: 'Sarah Chen', emails: ['s@x.com'], orgDomains: ['x.com'] },
      { title: 'Sara Chen', emails: ['s@x.com'], orgDomains: ['x.com'] },
    );
    const r = scorePair(comps);
    expect(r.breakdown.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(r.weight, 6);
  });
});

describe('metamorphic: filter grammar', () => {
  it('clause reordering yields an equivalent AST after serialize/parse', () => {
    const q1 = 'type:person city:Berlin tag:ml machine learning';
    const q2 = 'tag:ml city:Berlin type:person machine learning';
    const a = parseFilterQuery(astToQueryString(parseFilterQuery(q1)));
    const b = parseFilterQuery(astToQueryString(parseFilterQuery(q2)));
    expect(a.clauses).toEqual(b.clauses);
    expect(a.text).toBe(b.text);
  });
});

describe('metamorphic: reconnect ranking', () => {
  it('input shuffle preserves ranked id order', () => {
    const inputs: ReconnectInput[] = [
      { id: 'close-dormant', closeness: 5, intensity: 0.1 },
      { id: 'weak-active', closeness: 1, intensity: 2.5 },
      { id: 'mid', closeness: 3, intensity: 1.0 },
    ];
    const a = rankReconnect(inputs).map((r) => r.id);
    const b = rankReconnect([...inputs].reverse()).map((r) => r.id);
    expect(b).toEqual(a);
  });
});

describe('metamorphic: latex escape', () => {
  it('malicious TeX fragments never leave active specials after escape', () => {
    const payloads = [
      '\\write18{rm -rf /}',
      '100% #fail $x_',
      'a~b^c',
      '}{inject',
    ];
    for (const p of payloads) {
      const out = escapeLatex(p);
      const stripped = out
        .replace(/\\textbackslash\{\}/g, '')
        .replace(/\\textasciitilde\{\}/g, '')
        .replace(/\\textasciicircum\{\}/g, '')
        .replace(/\\textendash\{\}/g, '')
        .replace(/\\textemdash\{\}/g, '')
        .replace(/\\textperiodcentered\{\}/g, '')
        .replace(/\\textbullet\{\}/g, '')
        .replace(/\\[&%$#_{}]/g, '');
      expect(stripped).not.toMatch(/[&%$#_~^\\{}]/);
    }
  });
});
