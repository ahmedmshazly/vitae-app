import {
  EDGE_FORM_DESCRIPTORS,
  EDGE_PROPS_SCHEMAS,
  EDGE_TYPES,
  NODE_PROPS_SCHEMAS,
  NODE_TYPES,
  ORG_RELATION_KINDS,
  PERSON_RELATIONS,
} from '@vitae/core';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_ENTITIES,
  CATALOG_GRAPH,
  CATALOG_RELATIONS,
  ENTITY_GROUPS,
  selectionForId,
} from './entityCatalogModel.js';

function objectShapeKeys(schema: unknown): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) {
    const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
    if (typeName === 'ZodRecord') return [];
    throw new Error(`Expected a Zod object schema, received ${typeName ?? 'unknown'}`);
  }
  return Object.keys(shape).sort();
}

describe('entity catalog model', () => {
  it('covers every canonical node and relation type exactly once', () => {
    expect(CATALOG_ENTITIES.map((entity) => entity.type).sort()).toEqual([...NODE_TYPES].sort());
    expect(CATALOG_RELATIONS.map((relation) => relation.type).sort()).toEqual([...EDGE_TYPES].sort());
    expect(new Set(CATALOG_ENTITIES.map((entity) => entity.id)).size).toBe(NODE_TYPES.length);
    expect(new Set(CATALOG_RELATIONS.map((relation) => relation.id)).size).toBe(EDGE_TYPES.length);
  });

  it('keeps complete property-key coverage with the canonical Zod schemas', () => {
    for (const entity of CATALOG_ENTITIES) {
      expect(
        entity.fields.map((field) => field.key).sort(),
        `${entity.type} catalog props drifted from its Zod schema`,
      ).toEqual(objectShapeKeys(NODE_PROPS_SCHEMAS[entity.type]));
    }
    for (const relation of CATALOG_RELATIONS) {
      expect(
        relation.fields.map((field) => field.key).sort(),
        `${relation.type} catalog props drifted from its Zod schema`,
      ).toEqual(objectShapeKeys(EDGE_PROPS_SCHEMAS[relation.type]));
    }
  });

  it('keeps endpoint rules aligned with core descriptors', () => {
    for (const relation of CATALOG_RELATIONS) {
      const descriptor = EDGE_FORM_DESCRIPTORS[relation.type];
      if (relation.type === 'PART_OF') {
        expect(relation.allowedPairs).toEqual([
          ['repository', 'project'],
          ['education', 'organization'],
          ['project', 'role'],
          ['project', 'organization'],
        ]);
        continue;
      }
      expect(relation.sources).toEqual(descriptor.srcTypes);
      expect(relation.targets).toEqual(descriptor.dstTypes);
    }
  });

  it('builds one graph node per type plus the wildcard hub without duplicate links', () => {
    expect(CATALOG_GRAPH.nodes).toHaveLength(NODE_TYPES.length + EDGE_TYPES.length + 1);
    expect(CATALOG_GRAPH.nodes.some((node) => node.id === 'any')).toBe(true);
    expect(new Set(CATALOG_GRAPH.links.map((link) =>
      `${link.source}|${link.target}|${link.relationId}|${link.role}`,
    )).size).toBe(CATALOG_GRAPH.links.length);
    expect(CATALOG_GRAPH.links).toContainEqual({
      source: 'any',
      target: 'relation:MENTIONS',
      relationId: 'relation:MENTIONS',
      role: 'source',
    });
    expect(CATALOG_GRAPH.links).toContainEqual({
      source: 'relation:MENTIONS',
      target: 'any',
      relationId: 'relation:MENTIONS',
      role: 'target',
    });
  });

  it('preserves menu coverage, enum vocabulary, and shareable selection ids', () => {
    const groupedTypes = ENTITY_GROUPS.flatMap((group) => [...group.types]);
    expect(groupedTypes.sort()).toEqual([...NODE_TYPES].sort());
    expect(PERSON_RELATIONS).toHaveLength(14);
    expect(ORG_RELATION_KINDS).toHaveLength(11);
    expect(selectionForId('entity:person')).toMatchObject({ kind: 'entity', type: 'person' });
    expect(selectionForId('relation:KNOWS')).toMatchObject({ kind: 'relation', type: 'KNOWS' });
    expect(selectionForId('any')).toMatchObject({ kind: 'any' });
    expect(selectionForId('unknown')).toBeNull();
  });
});
