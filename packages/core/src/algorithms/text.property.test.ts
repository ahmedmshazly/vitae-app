import fc from 'fast-check';
import { describe, it } from 'vitest';
import { jaroWinkler, normalizeForMatch, stem, tokenize, trigramSimilarity } from './text.js';

describe('property: text utilities', () => {
  it('normalizeForMatch is idempotent', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 80 }), (s) => {
        const once = normalizeForMatch(s);
        return once === normalizeForMatch(once);
      }),
      { numRuns: 400 },
    );
  });

  it('tokenize never returns empty tokens', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 80 }), (s) => tokenize(s).every((t) => t.length > 0)),
      { numRuns: 400 },
    );
  });

  it('stem is idempotent on ASCII alpha words', () => {
    const alpha = fc
      .array(fc.integer({ min: 97, max: 122 }), { minLength: 1, maxLength: 20 })
      .map((codes) => String.fromCharCode(...codes));
    fc.assert(
      fc.property(alpha, (w) => stem(w) === stem(stem(w))),
      { numRuns: 200 },
    );
  });

  it('similarity metrics stay in [0, 1] and are reflexive', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const tw = trigramSimilarity(s, s);
        const jw = jaroWinkler(s, s);
        return tw >= 0 && tw <= 1 && jw >= 0 && jw <= 1 && (s.length === 0 || (tw === 1 && jw === 1));
      }),
      { numRuns: 200 },
    );
  });
});
