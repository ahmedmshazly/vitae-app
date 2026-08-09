import { FILTER_FIELDS, parseFilterQuery } from '@vitae/core';
import { describe, expect, it } from 'vitest';
import { SEARCH_GRAMMAR, dropToken, rowSubtitle, type Hit } from './SearchResults.js';

const hit = (over: Partial<Hit> = {}): Hit => ({
  id: 'n1',
  type: 'person',
  title: 'Sarah Chen',
  source: 'manual',
  confidence: 1,
  updated_at: '2026-08-07T18:34:38.342Z',
  _score: 1,
  ...over,
});

describe('search filter grammar help', () => {
  it('documents every field the parser accepts, and invents none', () => {
    expect(SEARCH_GRAMMAR.map((g) => g.field).sort()).toEqual([...FILTER_FIELDS].sort());
  });

  // The examples are one click away from becoming the user's query, so a stale
  // one ("is:wombat") would teach the grammar wrong from inside the product.
  it('offers examples that actually parse as the clause they advertise', () => {
    for (const g of SEARCH_GRAMMAR) {
      const ast = parseFilterQuery(g.example);
      expect(ast.invalid, `${g.example} was rejected by the parser`).toEqual([]);
      expect(ast.clauses.map((c) => c.field)).toEqual([g.field]);
      expect(ast.text).toBe('');
    }
  });
});

describe('dropToken', () => {
  it('removes the clause and leaves the free text', () => {
    expect(dropToken('type:person city:Berlin ml', 'city:Berlin')).toBe('type:person ml');
  });

  it('keeps quoted values whole', () => {
    expect(dropToken('org:"Nile Robotics" ml', 'org:"Nile Robotics"')).toBe('ml');
  });

  // Two identical clauses render two chips; clicking one of them must retire
  // one chip, not both.
  it('removes only the first of two identical clauses', () => {
    expect(dropToken('tag:ml tag:ml berlin', 'tag:ml')).toBe('tag:ml berlin');
  });

  it('is a no-op when the token is already gone', () => {
    expect(dropToken('type:person', 'city:Berlin')).toBe('type:person');
  });
});

describe('rowSubtitle', () => {
  it('prefers the record’s own subtitle', () => {
    expect(rowSubtitle(hit({ subtitle: 'Staff SWE' , props: { city: 'Berlin' } }))).toBe('Staff SWE');
  });

  // Two records with the same title are the case search exists to resolve, so
  // the second line has to carry whatever distinguishing facts there are.
  it('falls back to the distinguishing props', () => {
    expect(rowSubtitle(hit({ props: { headline: 'Staff SWE, ML platforms', city: 'Berlin' } }))).toBe(
      'Staff SWE, ML platforms · Berlin',
    );
  });

  it('never renders an empty line', () => {
    expect(rowSubtitle(hit({ type: 'media_item', props: {} }))).toBe('media item');
  });

  it('ignores non-string props rather than printing [object Object]', () => {
    expect(rowSubtitle(hit({ type: 'person', props: { headline: { a: 1 }, city: 'Berlin' } }))).toBe('Berlin');
  });
});
