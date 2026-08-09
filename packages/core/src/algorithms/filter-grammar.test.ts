import { describe, expect, it } from 'vitest';
import { astToQueryString, parseFilterQuery } from './filter-grammar.js';

describe('parseFilterQuery (SRS FR-SRCH-002)', () => {
  it('parses composable clauses + free text', () => {
    const ast = parseFilterQuery('type:link shared_by:"Omar" after:2025-01-01 transformer');
    expect(ast.clauses).toEqual(
      expect.arrayContaining([
        { field: 'type', value: 'link', raw: 'type:link' },
        { field: 'shared_by', value: 'Omar', raw: 'shared_by:"Omar"' },
        { field: 'after', value: '2025-01-01', raw: 'after:2025-01-01' },
      ]),
    );
    expect(ast.text).toBe('transformer');
  });

  it('degrades an invalid date to text with a hint', () => {
    const ast = parseFilterQuery('after:notadate hello');
    expect(ast.clauses).toHaveLength(0);
    expect(ast.invalid).toHaveLength(1);
    expect(ast.text).toContain('notadate');
  });

  it('validates has: and is: enums', () => {
    expect(parseFilterQuery('has:attachment').clauses).toHaveLength(1);
    expect(parseFilterQuery('has:bogus').invalid).toHaveLength(1);
    expect(parseFilterQuery('is:archived').clauses).toHaveLength(1);
  });

  it('treats unknown fields as free text', () => {
    const ast = parseFilterQuery('color:blue');
    expect(ast.clauses).toHaveLength(0);
    expect(ast.text).toContain('color:blue');
  });

  it('round-trips stably through a query string (shareable views)', () => {
    const q = 'type:person tag:ml city:Berlin machine learning';
    const ast = parseFilterQuery(q);
    const rebuilt = parseFilterQuery(astToQueryString(ast));
    expect(rebuilt.clauses).toEqual(expect.arrayContaining(ast.clauses));
    expect(rebuilt.text).toBe(ast.text);
  });

  // The round-trip above only ever used values without spaces, which is the one
  // case that never needed quoting, so it passed while the quoted form, the
  // only form `astToQueryString` actually emits quotes for, did not parse back.
  it('keeps a quoted value with a space in it whole', () => {
    const ast = parseFilterQuery('org:"Nile Robotics" city:"New York" ml');
    expect(ast.clauses).toEqual([
      { field: 'org', value: 'Nile Robotics', raw: 'org:"Nile Robotics"' },
      { field: 'city', value: 'New York', raw: 'city:"New York"' },
    ]);
    expect(ast.text).toBe('ml');
  });

  it('round-trips a value that has to be quoted', () => {
    const ast = parseFilterQuery('org:"Nile Robotics" machine learning');
    const rebuilt = parseFilterQuery(astToQueryString(ast));
    expect(rebuilt.clauses).toEqual(ast.clauses);
    expect(rebuilt.text).toBe(ast.text);
  });

  it('treats a bare quoted phrase as free text, quotes stripped', () => {
    const ast = parseFilterQuery('"machine learning" type:person');
    expect(ast.clauses).toHaveLength(1);
    expect(ast.text).toBe('machine learning');
  });
});
