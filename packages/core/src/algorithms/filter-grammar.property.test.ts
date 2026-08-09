import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FILTER_FIELDS,
  astToQueryString,
  parseFilterQuery,
  type FilterClause,
  type FilterField,
} from './filter-grammar.js';

const hasValues = ['attachment', 'note', 'metric'] as const;
const isValues = ['archived', 'pinned', 'sensitive', 'draft', 'final', 'sent'] as const;

function valueFor(field: FilterField): fc.Arbitrary<string> {
  switch (field) {
    case 'before':
    case 'after':
      return fc
        .tuple(fc.integer({ min: 2000, max: 2035 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
        .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    case 'has':
      return fc.constantFrom(...hasValues);
    case 'is':
      return fc.constantFrom(...isValues);
    default:
      return fc
        .string({ minLength: 1, maxLength: 24 })
        .filter((s) => s.trim().length > 0 && !s.includes(':') && !s.includes('"'));
  }
}

const clauseArb: fc.Arbitrary<FilterClause> = fc
  .constantFrom(...FILTER_FIELDS)
  .chain((field) =>
    valueFor(field).map((value) => ({
      field,
      value: value.trim(),
      raw: /\s/.test(value.trim()) ? `${field}:"${value.trim()}"` : `${field}:${value.trim()}`,
    })),
  );

describe('property: filter grammar round-trip', () => {
  it('parse(serialize(ast)) preserves clauses and free text', () => {
    fc.assert(
      fc.property(
        fc.array(clauseArb, { minLength: 0, maxLength: 5 }),
        fc
          .string({ maxLength: 40 })
          .map((s) => s.replace(/[":]/g, ' ').replace(/\s+/g, ' ').trim())
          .filter((s) => !FILTER_FIELDS.some((f) => s.toLowerCase().startsWith(`${f}:`))),
        (clauses, text) => {
          // Deduplicate by field+value so serialize order is the only difference.
          const seen = new Set<string>();
          const unique = clauses.filter((c) => {
            const key = `${c.field}:${c.value.toLowerCase()}`;
            if (seen.has(key) || !c.value) return false;
            seen.add(key);
            return true;
          });
          const ast = { text, clauses: unique, invalid: [] as Array<{ raw: string; reason: string }> };
          const rebuilt = parseFilterQuery(astToQueryString(ast));
          const norm = (xs: FilterClause[]) =>
            [...xs]
              .map((c) => ({ field: c.field, value: c.value }))
              .sort((a, b) => a.field.localeCompare(b.field) || a.value.localeCompare(b.value));
          expect(norm(rebuilt.clauses)).toEqual(norm(unique));
          expect(rebuilt.text).toBe(text);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('tokenize/parse never throws on arbitrary unicode', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 80 }), (q) => {
        const ast = parseFilterQuery(q);
        return Array.isArray(ast.clauses) && typeof ast.text === 'string';
      }),
      { numRuns: 500 },
    );
  });
});
