/**
 * The dossier vocabulary the browser owns: phrasing a grammar the server sent,
 * and editing the operator's own selection. The grammar itself is never built
 * here, so these prove only that a published rule is stated accurately and that
 * an edit produces a selection the server would accept.
 */
import { describe, expect, it } from 'vitest';
import { NODE_TYPES, type DossierSection, type DossierSectionGrammar } from '@vitae/core';
import {
  admitsSentence,
  admittedTypes,
  audiencePhrase,
  citationsSentence,
  claimsSentence,
  newClaimId,
  withClaimAdded,
  withClaimRemoved,
} from './DossierGrammar.js';

function grammar(over: Partial<DossierSectionGrammar> = {}): DossierSectionGrammar {
  return {
    id: 'impact',
    heading: 'Impact',
    purpose: 'What changed because of the work.',
    admits: ['project', 'repository'],
    admitsAtoms: true,
    minClaims: 2,
    maxClaims: 12,
    minCitationsPerClaim: 1,
    maxCitationsPerClaim: null,
    required: true,
    ...over,
  };
}

const claim = (id: string) => ({ id, text: `entry ${id}`, cites: [] });

describe('dossier phrasing', () => {
  it('says an audience the way the server says it in its own messages', () => {
    expect(audiencePhrase('promotion_review')).toBe('Promotion review');
    expect(audiencePhrase('petition_exhibits')).toBe('Petition exhibits');
  });

  it('offers the whole catalog to a section that admits any record', () => {
    expect(admittedTypes(grammar({ admits: 'any' }))).toHaveLength(NODE_TYPES.length);
    expect(admittedTypes(grammar())).toEqual(['project', 'repository']);
  });

  it('states the atom stance either way, so a refusal is not found out after saving', () => {
    expect(admitsSentence(grammar({ admitsAtoms: true }))).toContain('atoms count here too');
    const refuses = admitsSentence(grammar({ admitsAtoms: false }));
    expect(refuses).toContain('do not count here');
    expect(refuses).toContain('project or repository records');
  });

  it('says a section takes any record when the grammar admits every type', () => {
    expect(admitsSentence(grammar({ admits: 'any' }))).toContain('a record of any type');
  });
});

describe('dossier limits, in words', () => {
  it('reads a bounded range, an open top, and a floor of nothing', () => {
    expect(claimsSentence(grammar({ minClaims: 2, maxClaims: 12 }))).toBe('Between 2 and 12 entries.');
    expect(claimsSentence(grammar({ minClaims: 1, maxClaims: null }))).toBe('At least 1 entry.');
    expect(claimsSentence(grammar({ minClaims: 0, maxClaims: 8 }))).toBe('Up to 8 entries.');
    expect(claimsSentence(grammar({ minClaims: 0, maxClaims: null }))).toBe('Any number of entries.');
    expect(claimsSentence(grammar({ minClaims: 3, maxClaims: 3 }))).toBe('Exactly 3 entries.');
  });

  it('states the one record per exhibit rule as a rule and not a range', () => {
    expect(
      citationsSentence(grammar({ minCitationsPerClaim: 1, maxCitationsPerClaim: 1 })),
    ).toBe('Exactly 1 record per entry.');
    expect(
      citationsSentence(grammar({ minCitationsPerClaim: 1, maxCitationsPerClaim: null })),
    ).toBe('At least 1 record per entry.');
    expect(
      citationsSentence(grammar({ minCitationsPerClaim: 0, maxCitationsPerClaim: null })),
    ).toBe('Evidence is optional on an entry here.');
  });
});

describe('editing the selection', () => {
  it('creates the section when the dossier has none, so a claim has somewhere to live', () => {
    const next = withClaimAdded([], 'impact', claim('c1'));
    expect(next).toEqual([{ grammar_id: 'impact', claims: [claim('c1')] }]);
  });

  it('appends to the right section and leaves the others alone', () => {
    const before: DossierSection[] = [
      { grammar_id: 'scope', claims: [claim('c1')] },
      { grammar_id: 'impact', claims: [claim('c2')] },
    ];
    const next = withClaimAdded(before, 'impact', claim('c3'));

    expect(next[0]).toBe(before[0]);
    expect(next[1]?.claims.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('drops a section the removal emptied, so nothing compiles to a bare heading', () => {
    const before: DossierSection[] = [
      { grammar_id: 'scope', claims: [claim('c1')] },
      { grammar_id: 'impact', claims: [claim('c2')] },
    ];

    expect(withClaimRemoved(before, 'impact', 'c2')).toEqual([before[0]]);
    expect(withClaimRemoved(before, 'scope', 'c9')).toEqual(before);
  });

  it('gives every claim its own id', () => {
    expect(newClaimId()).not.toBe(newClaimId());
  });
});
