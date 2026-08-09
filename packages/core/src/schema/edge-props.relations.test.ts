import { describe, expect, it } from 'vitest';
import {
  ORG_RELATION_KINDS,
  PERSON_RELATIONS,
  knowsProps,
  orgRelatedProps,
} from './edge-props.js';

describe('person and org relation props', () => {
  it('accepts every PERSON_RELATIONS value on KNOWS', () => {
    for (const relation of PERSON_RELATIONS) {
      const parsed = knowsProps.parse({ relation, topics: [], favors: [] });
      expect(parsed.relation).toBe(relation);
    }
  });

  it('allows KNOWS without relation (backward compatible)', () => {
    const parsed = knowsProps.parse({ topics: [], favors: [] });
    expect(parsed.relation).toBeUndefined();
  });

  it('rejects unknown KNOWS relation', () => {
    expect(() => knowsProps.parse({ relation: 'bestie', topics: [], favors: [] })).toThrow();
  });

  it('requires ORG_RELATED.kind and accepts every kind', () => {
    expect(() => orgRelatedProps.parse({})).toThrow();
    for (const kind of ORG_RELATION_KINDS) {
      expect(orgRelatedProps.parse({ kind }).kind).toBe(kind);
    }
  });
});
