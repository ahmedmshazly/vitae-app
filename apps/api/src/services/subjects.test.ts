/**
 * Ownership resolution, the logic every owner-aware view now depends on.
 *
 * Pure graph reasoning, so no Firestore: the index is built from nodes and
 * edges alone.
 */
import { describe, expect, it } from 'vitest';
import { buildOwnerIndex, ownedIdsFor, skillIdsFor, type OwnableGraph } from './subjects.js';

function graph(
  nodes: Array<[string, string]>,
  edges: Array<[string, string, string]>,
): OwnableGraph {
  return {
    nodesById: new Map(nodes.map(([id, type]) => [id, { id, type }])),
    edges: edges.map(([type, src, dst]) => ({ type, src, dst })),
  };
}

describe('buildOwnerIndex', () => {
  it('assigns each record to the person its subject edge names', () => {
    const g = graph(
      [
        ['me', 'person'],
        ['them', 'person'],
        ['r1', 'role'],
        ['r2', 'role'],
        ['edu1', 'education'],
      ],
      [
        ['HELD', 'me', 'r1'],
        ['HELD', 'them', 'r2'],
        ['ATTENDED', 'them', 'edu1'],
      ],
    );
    const index = buildOwnerIndex(g);
    expect(index.ownerOf.get('r1')).toBe('me');
    expect(index.ownerOf.get('r2')).toBe('them');
    expect(index.ownerOf.get('edu1')).toBe('them');
    expect([...ownedIdsFor('me', index)]).toEqual(['r1']);
    expect([...ownedIdsFor('them', index)].sort()).toEqual(['edu1', 'r2']);
  });

  it('ignores edges that are not the subject edge for that type', () => {
    // ROLE_AT and USES_SKILL touch these records but say nothing about whose
    // they are. Treating any incident edge as ownership would make every record
    // belong to everything it references.
    const g = graph(
      [
        ['me', 'person'],
        ['r1', 'role'],
        ['org1', 'organization'],
        ['s1', 'skill'],
      ],
      [
        ['ROLE_AT', 'r1', 'org1'],
        ['USES_SKILL', 'r1', 's1'],
      ],
    );
    const index = buildOwnerIndex(g);
    expect(index.ownerOf.size).toBe(0);
    expect(index.unowned).toContain('r1');
    // Organisations and skills belong to nobody, so they are never "unowned".
    expect(index.unowned).not.toContain('org1');
    expect(index.unowned).not.toContain('s1');
  });

  it('reports a record two people claim instead of silently picking one', () => {
    const g = graph(
      [
        ['me', 'person'],
        ['them', 'person'],
        ['r1', 'role'],
      ],
      [
        ['HELD', 'me', 'r1'],
        ['HELD', 'them', 'r1'],
      ],
    );
    const index = buildOwnerIndex(g);
    expect(index.contested).toEqual(['r1']);
    // First writer keeps it, so downstream reads stay deterministic.
    expect(index.ownerOf.get('r1')).toBe('me');
  });

  it("never treats an unowned record as the owner's", () => {
    // The whole point of the placeholder: "nobody said" must not collapse into
    // "mine", which is how other people's degrees reached the résumé.
    const g = graph(
      [
        ['me', 'person'],
        ['orphan', 'award'],
      ],
      [],
    );
    const index = buildOwnerIndex(g);
    expect(index.unowned).toEqual(['orphan']);
    expect([...ownedIdsFor('me', index)]).toEqual([]);
  });
});

describe('skillIdsFor', () => {
  const g = graph(
    [
      ['me', 'person'],
      ['them', 'person'],
      ['r-mine', 'role'],
      ['r-theirs', 'role'],
      ['claimed', 'skill'],
      ['evidenced', 'skill'],
      ['theirs', 'skill'],
      ['shared', 'skill'],
    ],
    [
      ['HELD', 'me', 'r-mine'],
      ['HELD', 'them', 'r-theirs'],
      ['USES_SKILL', 'me', 'claimed'],
      ['USES_SKILL', 'r-mine', 'evidenced'],
      ['USES_SKILL', 'r-theirs', 'theirs'],
      ['USES_SKILL', 'r-mine', 'shared'],
      ['USES_SKILL', 'r-theirs', 'shared'],
    ],
  );

  it('counts skills claimed directly and skills evidenced by an owned record', () => {
    const index = buildOwnerIndex(g);
    const mine = skillIdsFor('me', g, ownedIdsFor('me', index));
    expect([...mine].sort()).toEqual(['claimed', 'evidenced', 'shared']);
  });

  it("does not borrow a skill only someone else's record uses", () => {
    const index = buildOwnerIndex(g);
    expect(skillIdsFor('me', g, ownedIdsFor('me', index)).has('theirs')).toBe(false);
    // ...while a shared skill is legitimately both people's.
    expect(skillIdsFor('them', g, ownedIdsFor('them', index)).has('shared')).toBe(true);
  });
});
