import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareEntities } from '../../algorithms/dedup.js';
import { whoToCall, type CandidatePerson, type Intent } from '../../algorithms/who-to-call.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, name), 'utf8')) as T;
}

describe('golden corpus: whoToCall', () => {
  const fixture = loadJson<{
    intent: Intent;
    candidates: CandidatePerson[];
    expect: { orderPrefix: string[]; excludedIds: string[]; sarahFactors: string[] };
  }>('who-to-call.json');

  it('keeps the reviewed ranking order and factor chips', () => {
    const ranked = whoToCall(fixture.candidates, fixture.intent);
    const ids = ranked.map((r) => r.id);
    expect(ids.slice(0, fixture.expect.orderPrefix.length)).toEqual(fixture.expect.orderPrefix);
    for (const excluded of fixture.expect.excludedIds) {
      expect(ids).not.toContain(excluded);
    }
    const sarah = ranked.find((r) => r.id === 'sarah')!;
    expect(sarah.chips.map((c) => c.factor)).toEqual(
      expect.arrayContaining(fixture.expect.sarahFactors),
    );
    const chipSum = sarah.chips.reduce((a, c) => a + c.weighted, 0);
    expect(chipSum).toBeCloseTo(sarah.score, 3);
  });
});

describe('golden corpus: dedup pairs', () => {
  const fixture = loadJson<{
    pairs: Array<{
      id: string;
      a: { type: string; title: string; props?: Record<string, unknown>; identity_keys?: string[] };
      b: { type: string; title: string; props?: Record<string, unknown>; identity_keys?: string[] };
      expectVerdict: 'non_match' | 'possible' | 'probable';
    }>;
  }>('dedup-pairs.json');

  it('matches reviewed verdicts for each pair', () => {
    for (const pair of fixture.pairs) {
      const result = compareEntities(pair.a as never, pair.b as never);
      expect(result.verdict, pair.id).toBe(pair.expectVerdict);
    }
  });
});
