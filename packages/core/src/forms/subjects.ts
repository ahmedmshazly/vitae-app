/**
 * Whose record is this?
 *
 * `NODE_FORM_DESCRIPTORS[type].subject` already declares the edge that ties a
 * record to the person it belongs to, but only the *forms* layer read it, so
 * ownership existed at creation time and was forgotten at query time. Every
 * read model therefore treated "every node of this type" as "every node of this
 * type that is mine", which is only true in a graph holding exactly one person.
 *
 * These helpers make the same declaration usable on the read path. They derive
 * from the descriptors rather than restating them, so a new subject-bearing type
 * is picked up automatically and the two can never drift.
 */
import { NODE_TYPES, type NodeType } from '../types.js';
import { NODE_FORM_DESCRIPTORS } from './node-forms.js';
import type { SubjectDescriptor } from './types.js';

/**
 * The subject edge for a type, or null when the type belongs to nobody
 * (organization, skill, location, these are shared vocabulary, not property).
 */
export function subjectEdgeFor(type: NodeType): SubjectDescriptor | null {
  return NODE_FORM_DESCRIPTORS[type]?.subject ?? null;
}

/** Types that are meaningless without an owner. */
export const SUBJECT_BEARING_TYPES: readonly NodeType[] = (NODE_TYPES as readonly NodeType[]).filter(
  (t) => subjectEdgeFor(t) !== null,
);

const SUBJECT_BEARING = new Set<string>(SUBJECT_BEARING_TYPES);

export function isSubjectBearing(type: string): boolean {
  return SUBJECT_BEARING.has(type);
}

/**
 * Given an edge, the record it assigns and the person it assigns it to, or
 * null when this edge is not a subject edge for the record's type.
 *
 * `direction: 'in'` means the edge runs person → record (HELD, EARNED,
 * ATTENDED …), so the record is `dst`. 'out' runs record → person.
 * Callers pass a type lookup because an edge only carries ids.
 */
export function subjectAssignment(
  edge: { type: string; src: string; dst: string },
  typeOf: (nodeId: string) => string | undefined,
): { recordId: string; personId: string } | null {
  for (const [recordId, personId, direction] of [
    [edge.dst, edge.src, 'in'],
    [edge.src, edge.dst, 'out'],
  ] as const) {
    const recordType = typeOf(recordId);
    if (!recordType || !isSubjectBearing(recordType)) continue;
    if (typeOf(personId) !== 'person') continue;
    const subject = subjectEdgeFor(recordType as NodeType);
    if (subject && subject.edgeType === edge.type && subject.direction === direction) {
      return { recordId, personId };
    }
  }
  return null;
}

/** Identity key of the reserved person that owns records nobody claimed. */
export const PLACEHOLDER_IDENTITY_KEY = 'vitae:system:unattributed';
export const PLACEHOLDER_TITLE = 'Unattributed';
