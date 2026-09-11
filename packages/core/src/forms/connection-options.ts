/**
 * Shared connection option math for Add Connection + create/edit composers.
 * Derived from EDGE_FORM_DESCRIPTORS + edgeEndpointsAllowed so client and API
 * never disagree about which relationships are representable.
 */
import { NODE_TYPES, type EdgeType, type NodeType } from '../types.js';
import {
  ORG_RELATION_KINDS,
  PERSON_RELATIONS,
  type OrgRelationKind,
  type PersonRelation,
} from '../schema/edge-props.js';
import { EDGE_FORM_DESCRIPTORS, edgeEndpointsAllowed } from './edge-forms.js';
import type { EdgeFormDescriptor } from './types.js';

export type ConnectionOptionGroup =
  | 'Career'
  | 'Education'
  | 'Social'
  | 'Content'
  | 'Location'
  | 'Other';

export interface ConnectionOption {
  key: string;
  descriptor: EdgeFormDescriptor;
  /** `out`: the entity in hand is src; `in`: it is dst. */
  direction: 'out' | 'in';
  targetTypes: NodeType[];
}

const GROUP_BY_TYPE: Partial<Record<EdgeType, ConnectionOptionGroup>> = {
  HELD: 'Career',
  ROLE_AT: 'Career',
  WORKED_ON: 'Career',
  USES_SKILL: 'Career',
  FOUNDED: 'Career',
  REPORTS_TO: 'Career',
  APPLIED_TO: 'Career',
  INTERVIEW_FOR: 'Career',
  REFERRED_BY: 'Career',
  MEMBER_OF: 'Career',
  ORG_RELATED: 'Career',
  STUDIED_AT: 'Education',
  ATTENDED: 'Education',
  EARNED: 'Education',
  COMPLETED: 'Education',
  PART_OF: 'Education',
  KNOWS: 'Social',
  WITH: 'Social',
  FOLLOWS: 'Social',
  RECOMMENDS: 'Social',
  AUTHORED: 'Content',
  ABOUT: 'Content',
  SHARED_BY: 'Content',
  MENTIONS: 'Content',
  REACTED_TO: 'Content',
  LOCATED_IN: 'Location',
  VISITED: 'Location',
  RELATES_TO: 'Other',
  DEPENDS_ON: 'Other',
  SERVES_GOAL: 'Other',
  WAITING_ON: 'Other',
  FOR: 'Other',
};

const GROUP_ORDER: ConnectionOptionGroup[] = [
  'Career',
  'Education',
  'Social',
  'Content',
  'Location',
  'Other',
];

/** Legal options for a node, derived from the API matrix rather than approximating it. */
export function connectionOptionsFor(nodeType: NodeType): ConnectionOption[] {
  const options: ConnectionOption[] = [];

  for (const descriptor of Object.values(EDGE_FORM_DESCRIPTORS)) {
    const outboundTargets = NODE_TYPES.filter((targetType) =>
      edgeEndpointsAllowed(descriptor.type, nodeType, targetType).ok,
    );
    if (outboundTargets.length > 0) {
      options.push({
        key: `${descriptor.type}:out`,
        descriptor,
        direction: 'out',
        targetTypes: [...outboundTargets],
      });
    }

    // Fully symmetric catch-alls only need one direction in the picker.
    if (descriptor.srcTypes === '*' && descriptor.dstTypes === '*') continue;
    const inboundTargets = NODE_TYPES.filter((targetType) =>
      edgeEndpointsAllowed(descriptor.type, targetType, nodeType).ok,
    );
    if (inboundTargets.length > 0) {
      options.push({
        key: `${descriptor.type}:in`,
        descriptor,
        direction: 'in',
        targetTypes: [...inboundTargets],
      });
    }
  }

  return sortConnectionOptions(options);
}

export function connectionOptionGroup(option: ConnectionOption): ConnectionOptionGroup {
  return GROUP_BY_TYPE[option.descriptor.type] ?? 'Other';
}

/** Natural-language label for the relationship picker (directional). */
export function connectionOptionLabel(option: ConnectionOption): string {
  const { type } = option.descriptor;
  const base = option.descriptor.label;
  if (option.direction === 'out') {
    switch (type) {
      case 'REPORTS_TO':
        return 'Reports to';
      case 'STUDIED_AT':
        return 'Studied at';
      case 'FOUNDED':
        return 'Founded';
      case 'WITH':
        return 'With (includes person)';
      case 'ORG_RELATED':
        return 'Related org';
      default:
        return base;
    }
  }
  switch (type) {
    case 'REPORTS_TO':
      return 'Manages (they report to this person)';
    case 'STUDIED_AT':
      return 'Student of';
    case 'FOUNDED':
      return 'Founded by';
    case 'KNOWS':
      return 'Knows (inbound)';
    case 'HELD':
      return 'Held by';
    case 'WORKED_ON':
      return 'Worked on by';
    case 'USES_SKILL':
      return 'Used by';
    case 'ATTENDED':
      return 'Attended by';
    case 'WITH':
      return 'Present in';
    case 'AUTHORED':
      return 'Authored by';
    case 'EARNED':
      return 'Earned by';
    case 'MEMBER_OF':
      return 'Has member';
    case 'FOLLOWS':
      return 'Followed by';
    case 'COMPLETED':
      return 'Completed by';
    case 'ORG_RELATED':
      return 'Related from';
    default:
      return `← ${base}`;
  }
}

/** Human label for a KNOWS.relation value. */
export function personRelationLabel(relation: string | null | undefined): string | null {
  if (!relation) return null;
  if (!(PERSON_RELATIONS as readonly string[]).includes(relation)) {
    return relation.charAt(0).toUpperCase() + relation.slice(1).replace(/_/g, ' ');
  }
  return relation.charAt(0).toUpperCase() + relation.slice(1).replace(/_/g, ' ');
}

/** Human label for an ORG_RELATED.kind value. */
export function orgRelationKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  if (!(ORG_RELATION_KINDS as readonly string[]).includes(kind)) {
    return kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, ' ');
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, ' ');
}

export function isPersonRelation(v: string): v is PersonRelation {
  return (PERSON_RELATIONS as readonly string[]).includes(v);
}

export function isOrgRelationKind(v: string): v is OrgRelationKind {
  return (ORG_RELATION_KINDS as readonly string[]).includes(v);
}

/**
 * Graph / peek label: prefer typed relation/kind when present, else edge type.
 */
export function edgeDisplayLabel(
  type: string,
  direction: 'out' | 'in' = 'out',
  meta?: { relation?: string | null; kind?: string | null },
): string {
  if (type === 'KNOWS') {
    const rel = personRelationLabel(meta?.relation ?? undefined);
    if (rel) return rel;
  }
  if (type === 'ORG_RELATED') {
    const kind = orgRelationKindLabel(meta?.kind ?? undefined);
    if (kind) return kind;
  }
  return edgeTypeLabel(type, direction);
}

/** Select option text: "Education · Studied at". */
export function connectionOptionSelectLabel(option: ConnectionOption): string {
  return `${connectionOptionGroup(option)} · ${connectionOptionLabel(option)}`;
}

export function edgeTypeLabel(type: string, direction: 'out' | 'in' = 'out'): string {
  const descriptor = EDGE_FORM_DESCRIPTORS[type as EdgeType];
  if (!descriptor) return type.replace(/_/g, ' ');
  return connectionOptionLabel({
    key: `${type}:${direction}`,
    descriptor,
    direction,
    targetTypes: [],
  });
}

export function edgeTypeGroup(type: string): ConnectionOptionGroup {
  return GROUP_BY_TYPE[type as EdgeType] ?? 'Other';
}

function sortConnectionOptions(options: ConnectionOption[]): ConnectionOption[] {
  return [...options].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(connectionOptionGroup(a));
    const gb = GROUP_ORDER.indexOf(connectionOptionGroup(b));
    if (ga !== gb) return ga - gb;
    return connectionOptionLabel(a).localeCompare(connectionOptionLabel(b));
  });
}
