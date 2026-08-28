/**
 * Normalized schema-catalog model for the public explorer and printable atlas.
 *
 * The JSON catalog carries the complete persistence details (including hidden
 * and system fields). Core descriptors add the labels and interaction metadata
 * used by the product. Coverage tests keep both representations in lockstep.
 */
import {
  EDGE_FORM_DESCRIPTORS,
  EDGE_TYPES,
  NODE_FORM_DESCRIPTORS,
  NODE_TYPES,
  ORG_RELATION_KINDS,
  PERSON_RELATIONS,
  type EdgeType,
  type FieldDescriptor,
  type NodeType,
} from '@vitae/core';
import rawCatalog from '../../../../../docs/entity-catalog.template.json';
import { NEW_ENTITY_MENU_GROUPS } from '../../features/forms/NewEntityMenu.js';

export type CatalogGroup = (typeof NEW_ENTITY_MENU_GROUPS)[number]['label'];

interface RawField {
  type: string;
  required?: boolean;
  nullable?: boolean;
  default?: unknown;
  enum?: Array<string | number>;
  enum_ref?: string;
  min?: number;
  max?: number;
  length?: number;
  items?: string | RawField;
  fields?: Record<string, RawField>;
  note?: string;
}

interface RawSubject {
  edge: EdgeType;
  direction: 'in' | 'out';
  required: boolean;
  default_to_self: boolean;
}

interface RawFormEdge {
  edge: EdgeType;
  direction: 'in' | 'out';
  targets: NodeType[] | '*';
  cardinality: 'one' | 'many';
}

interface RawEntity {
  group: CatalogGroup;
  props: Record<string, RawField>;
  create_subject: RawSubject | null;
  form_edges: RawFormEdge[];
  envelope_dates?: boolean;
  notes?: string;
}

interface RawRelation {
  label: string;
  src?: NodeType[] | '*';
  dst?: NodeType[] | '*';
  allowed_pairs?: Array<[NodeType, NodeType]>;
  props: Record<string, RawField>;
  notes?: string;
}

interface RawEnvelope {
  description: string;
  create_fields: Record<string, RawField>;
  system_fields: Record<string, RawField>;
}

interface RawCatalog {
  format: string;
  schema_version: number;
  description: string;
  node_envelope: RawEnvelope;
  edge_envelope: RawEnvelope;
  entities: Record<NodeType, RawEntity>;
  relations: {
    description: string;
    edges: Record<EdgeType, RawRelation>;
    PERSON_RELATIONS: string[];
    ORG_RELATION_KINDS: string[];
  };
}

const catalog = rawCatalog as unknown as RawCatalog;

export interface CatalogField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  nullable: boolean;
  defaultValue: unknown;
  enumValues: Array<string | number>;
  enumRef: string | null;
  min: number | null;
  max: number | null;
  length: number | null;
  note: string | null;
  children: CatalogField[];
}

export interface CatalogSubject {
  edgeType: EdgeType;
  direction: 'in' | 'out';
  required: boolean;
  defaultToSelf: boolean;
  label: string;
}

export interface CatalogFormEdge {
  edgeType: EdgeType;
  direction: 'in' | 'out';
  targets: NodeType[] | '*';
  cardinality: 'one' | 'many';
  label: string;
}

export interface CatalogEntity {
  kind: 'entity';
  id: `entity:${NodeType}`;
  type: NodeType;
  group: CatalogGroup;
  titleLabel: string;
  subtitleLabel: string | null;
  fields: CatalogField[];
  subject: CatalogSubject | null;
  formEdges: CatalogFormEdge[];
  envelopeDates: boolean;
  notes: string | null;
}

export interface CatalogRelation {
  kind: 'relation';
  id: `relation:${EdgeType}`;
  type: EdgeType;
  label: string;
  description: string;
  sources: NodeType[] | '*';
  targets: NodeType[] | '*';
  allowedPairs: Array<[NodeType, NodeType]>;
  fields: CatalogField[];
  notes: string | null;
}

export type CatalogSelection = CatalogEntity | CatalogRelation | CatalogAny;

export interface CatalogAny {
  kind: 'any';
  id: 'any';
  label: 'Any entity';
}

export interface CatalogGraphNode {
  id: CatalogSelection['id'];
  kind: CatalogSelection['kind'];
  label: string;
  group: CatalogGroup | 'Relations' | 'Universal';
  type: NodeType | EdgeType | 'any';
  structuredX: number;
  structuredY: number;
}

export interface CatalogGraphLink {
  source: CatalogGraphNode['id'];
  target: CatalogGraphNode['id'];
  relationId: CatalogRelation['id'];
  role: 'source' | 'target';
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function fieldDescriptorMap(fields: FieldDescriptor[]): Map<string, FieldDescriptor> {
  return new Map(fields.map((field) => [field.key, field]));
}

function normalizeField(key: string, field: RawField, descriptor?: FieldDescriptor): CatalogField {
  const nested = field.fields ?? (typeof field.items === 'object' ? field.items.fields : undefined);
  const itemType =
    typeof field.items === 'string'
      ? field.items
      : typeof field.items === 'object'
        ? field.items.type
        : null;
  return {
    key,
    label: descriptor?.label ?? labelFromKey(key),
    type: itemType ? `${field.type}<${itemType}>` : field.type,
    required: field.required ?? descriptor?.required ?? false,
    nullable: field.nullable ?? false,
    defaultValue: Object.prototype.hasOwnProperty.call(field, 'default') ? field.default : undefined,
    enumValues: field.enum ?? descriptor?.options?.map((option) => option.value) ?? [],
    enumRef: field.enum_ref ?? null,
    min: field.min ?? descriptor?.min ?? null,
    max: field.max ?? descriptor?.max ?? null,
    length: field.length ?? null,
    note: field.note ?? descriptor?.help ?? null,
    children: nested
      ? Object.entries(nested).map(([childKey, child]) => normalizeField(childKey, child))
      : [],
  };
}

function normalizeFields(
  fields: Record<string, RawField>,
  descriptors: FieldDescriptor[] = [],
): CatalogField[] {
  const descriptorByKey = fieldDescriptorMap(descriptors);
  return Object.entries(fields).map(([key, field]) =>
    normalizeField(key, field, descriptorByKey.get(key)),
  );
}

export const ENTITY_GROUPS: ReadonlyArray<{ label: CatalogGroup; types: readonly NodeType[] }> =
  NEW_ENTITY_MENU_GROUPS;

export const CATALOG_ENTITIES: CatalogEntity[] = ENTITY_GROUPS.flatMap((group) =>
  group.types.map((type) => {
    const raw = catalog.entities[type];
    const descriptor = NODE_FORM_DESCRIPTORS[type];
    return {
      kind: 'entity' as const,
      id: `entity:${type}` as const,
      type,
      group: group.label,
      titleLabel: descriptor.titleLabel,
      subtitleLabel: descriptor.subtitleLabel ?? null,
      fields: normalizeFields(raw.props, descriptor.fields),
      subject: raw.create_subject
        ? {
            edgeType: raw.create_subject.edge,
            direction: raw.create_subject.direction,
            required: raw.create_subject.required,
            defaultToSelf: raw.create_subject.default_to_self,
            label: descriptor.subject?.label ?? 'Record subject',
          }
        : null,
      formEdges: raw.form_edges.map((edge) => ({
        edgeType: edge.edge,
        direction: edge.direction,
        targets: edge.targets,
        cardinality: edge.cardinality,
        label:
          descriptor.edges.find(
            (candidate) =>
              candidate.edgeType === edge.edge && candidate.direction === edge.direction,
          )?.label ?? EDGE_FORM_DESCRIPTORS[edge.edge].label,
      })),
      envelopeDates: raw.envelope_dates ?? descriptor.envelope.dates,
      notes: raw.notes ?? null,
    };
  }),
);

export const CATALOG_RELATIONS: CatalogRelation[] = EDGE_TYPES.map((type) => {
  const raw = catalog.relations.edges[type];
  const descriptor = EDGE_FORM_DESCRIPTORS[type];
  const pairSources = raw.allowed_pairs?.map(([source]) => source) ?? [];
  const pairTargets = raw.allowed_pairs?.map(([, target]) => target) ?? [];
  return {
    kind: 'relation',
    id: `relation:${type}`,
    type,
    label: raw.label ?? descriptor.label,
    description: descriptor.description,
    sources: raw.src ?? [...new Set(pairSources)],
    targets: raw.dst ?? [...new Set(pairTargets)],
    allowedPairs: raw.allowed_pairs ?? [],
    fields: normalizeFields(raw.props, descriptor.fields),
    notes: raw.notes && raw.notes !== descriptor.description ? raw.notes : null,
  };
});

export const ANY_ENTITY: CatalogAny = { kind: 'any', id: 'any', label: 'Any entity' };

export const NODE_ENVELOPE = {
  description: catalog.node_envelope.description,
  createFields: normalizeFields(catalog.node_envelope.create_fields),
  systemFields: normalizeFields(catalog.node_envelope.system_fields),
} as const;

export const EDGE_ENVELOPE = {
  description: catalog.edge_envelope.description,
  createFields: normalizeFields(catalog.edge_envelope.create_fields),
  systemFields: normalizeFields(catalog.edge_envelope.system_fields),
} as const;

export const CATALOG_COUNTS = {
  nodes: NODE_TYPES.length,
  edges: EDGE_TYPES.length,
  personRelations: PERSON_RELATIONS.length,
  orgRelationKinds: ORG_RELATION_KINDS.length,
} as const;

export const CATALOG_META = {
  format: catalog.format,
  schemaVersion: catalog.schema_version,
  description: catalog.description,
} as const;

export const ENTITY_BY_ID = new Map(CATALOG_ENTITIES.map((entity) => [entity.id, entity]));
export const RELATION_BY_ID = new Map(
  CATALOG_RELATIONS.map((relation) => [relation.id, relation]),
);

const GROUP_CENTERS: Record<CatalogGroup, readonly [number, number]> = {
  Career: [-540, -250],
  Content: [-540, 190],
  'Job search': [520, -300],
  Life: [540, 80],
  'Long tail': [120, 350],
};

function entityPosition(entity: CatalogEntity, indexInGroup: number): [number, number] {
  const [centerX, centerY] = GROUP_CENTERS[entity.group];
  const groupSize = ENTITY_GROUPS.find((group) => group.label === entity.group)?.types.length ?? 1;
  const columns = groupSize > 7 ? 3 : 2;
  const column = indexInGroup % columns;
  const row = Math.floor(indexInGroup / columns);
  return [
    centerX + (column - (columns - 1) / 2) * 145,
    centerY + (row - Math.floor((groupSize - 1) / columns) / 2) * 88,
  ];
}

export function buildCatalogGraph(): {
  nodes: CatalogGraphNode[];
  links: CatalogGraphLink[];
} {
  const nodes: CatalogGraphNode[] = [];
  for (const group of ENTITY_GROUPS) {
    const entities = CATALOG_ENTITIES.filter((entity) => entity.group === group.label);
    entities.forEach((entity, index) => {
      const [structuredX, structuredY] = entityPosition(entity, index);
      nodes.push({
        id: entity.id,
        kind: entity.kind,
        label: entity.type,
        group: entity.group,
        type: entity.type,
        structuredX,
        structuredY,
      });
    });
  }

  CATALOG_RELATIONS.forEach((relation, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    nodes.push({
      id: relation.id,
      kind: relation.kind,
      label: relation.type,
      group: 'Relations',
      type: relation.type,
      structuredX: -225 + column * 150,
      structuredY: -290 + row * 82,
    });
  });

  nodes.push({
    id: ANY_ENTITY.id,
    kind: ANY_ENTITY.kind,
    label: ANY_ENTITY.label,
    group: 'Universal',
    type: 'any',
    structuredX: 0,
    structuredY: -350,
  });

  const links: CatalogGraphLink[] = [];
  const seen = new Set<string>();
  const addLink = (
    source: CatalogGraphNode['id'],
    target: CatalogGraphNode['id'],
    relationId: CatalogRelation['id'],
    role: CatalogGraphLink['role'],
  ) => {
    const key = `${source}|${target}|${relationId}|${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source, target, relationId, role });
  };

  for (const relation of CATALOG_RELATIONS) {
    const sources = relation.sources === '*' ? ['any' as const] : relation.sources;
    const targets = relation.targets === '*' ? ['any' as const] : relation.targets;
    for (const source of sources) {
      addLink(
        source === 'any' ? 'any' : `entity:${source}`,
        relation.id,
        relation.id,
        'source',
      );
    }
    for (const target of targets) {
      addLink(
        relation.id,
        target === 'any' ? 'any' : `entity:${target}`,
        relation.id,
        'target',
      );
    }
  }

  return { nodes, links };
}

export const CATALOG_GRAPH = buildCatalogGraph();

export function selectionForId(id: string | null): CatalogSelection | null {
  if (!id) return null;
  if (id === 'any') return ANY_ENTITY;
  return ENTITY_BY_ID.get(id as CatalogEntity['id']) ?? RELATION_BY_ID.get(id as CatalogRelation['id']) ?? null;
}

export function endpointText(endpoint: NodeType[] | '*'): string {
  return endpoint === '*' ? 'Any entity' : endpoint.join(' · ');
}

export function fieldSummary(field: CatalogField): string {
  const parts = [field.type];
  if (field.required) parts.push('required');
  if (field.nullable) parts.push('nullable');
  if (field.enumRef) parts.push(field.enumRef);
  if (field.enumValues.length > 0) parts.push(field.enumValues.join(' | '));
  if (field.min != null || field.max != null) {
    parts.push(`${field.min ?? '−∞'}...${field.max ?? '∞'}`);
  }
  if (field.length != null) parts.push(`length ${field.length}`);
  if (field.defaultValue !== undefined) parts.push(`default ${JSON.stringify(field.defaultValue)}`);
  return parts.join(' · ');
}

export { NODE_TYPES, EDGE_TYPES, PERSON_RELATIONS, ORG_RELATION_KINDS };
