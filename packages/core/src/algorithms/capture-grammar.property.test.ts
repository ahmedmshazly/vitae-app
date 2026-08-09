import fc from 'fast-check';
import { describe, it } from 'vitest';
import { parseCapture, parseDateToken } from './capture-grammar.js';

const NOW = new Date('2026-07-11T12:00:00Z');

describe('property: capture grammar', () => {
  it('parseCapture never throws and always returns a plan shape', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 120 }), (raw) => {
        const plan = parseCapture(raw, NOW);
        return (
          typeof plan.primaryType === 'string' &&
          typeof plan.title === 'string' &&
          Array.isArray(plan.chips) &&
          Array.isArray(plan.tags) &&
          Array.isArray(plan.people) &&
          Array.isArray(plan.orgs)
        );
      }),
      { numRuns: 500 },
    );
  });

  it('leading type keys produce a matching primaryType', () => {
    const cases: Array<[string, string]> = [
      ['p', 'person'],
      ['t', 'task'],
      ['g', 'goal'],
      ['h', 'habit'],
      ['int', 'interaction'],
      ['n', 'note_append'],
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...cases),
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.trim().length > 0 && !/[@#^!>]/.test(s)),
        ([key, kind], title) => {
          const plan = parseCapture(`${key} ${title.trim()}`, NOW);
          return plan.primaryType === kind;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('parseDateToken is total over arbitrary tokens', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (token) => {
        const result = parseDateToken(token, NOW);
        return result === null || (/^\d{4}-\d{2}-\d{2}$/.test(result.iso) && result.label.length > 0);
      }),
      { numRuns: 300 },
    );
  });
});
