import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EDGE_TYPES, NODE_TYPES } from '../types.js';
import { APPLICATION_STATUSES } from '../schema/application.js';
import { NODE_PROPS_SCHEMAS } from '../schema/node-props.js';
import { EDGE_PROPS_SCHEMAS } from '../schema/edge-props.js';
import { NODE_FORM_DESCRIPTORS, nodeFormDescriptor } from './node-forms.js';
import { EDGE_FORM_DESCRIPTORS, edgeEndpointsAllowed } from './edge-forms.js';
import {
  SUBJECT_BEARING_TYPES,
  isSubjectBearing,
  subjectAssignment,
  subjectEdgeFor,
} from './subjects.js';

/** Keys of a props schema when it is an object schema; null for records. */
function shapeKeys(schema: z.ZodType): Set<string> | null {
  if (schema instanceof z.ZodObject) return new Set(Object.keys(schema.shape));
  return null; // ZodRecord passthrough, anything goes.
}

describe('form descriptors stay honest against the Zod schemas', () => {
  it('every node type has a descriptor', () => {
    for (const type of NODE_TYPES) {
      expect(NODE_FORM_DESCRIPTORS[type], type).toBeDefined();
      expect(NODE_FORM_DESCRIPTORS[type].sections.length, type).toBeGreaterThan(0);
    }
  });

  it('every edge type has a descriptor', () => {
    for (const type of EDGE_TYPES) {
      expect(EDGE_FORM_DESCRIPTORS[type], type).toBeDefined();
    }
  });

  it("every node descriptor field exists in that type's props schema", () => {
    for (const type of NODE_TYPES) {
      const keys = shapeKeys(NODE_PROPS_SCHEMAS[type]);
      if (!keys) continue;
      for (const field of NODE_FORM_DESCRIPTORS[type].fields) {
        expect(keys.has(field.key), `${type}.props.${field.key}`).toBe(true);
      }
    }
  });

  it("every edge descriptor field exists in that edge's props schema", () => {
    for (const type of EDGE_TYPES) {
      const keys = shapeKeys(EDGE_PROPS_SCHEMAS[type]);
      if (!keys) continue;
      for (const field of EDGE_FORM_DESCRIPTORS[type].fields) {
        expect(keys.has(field.key), `${type}.props.${field.key}`).toBe(true);
      }
    }
  });

  it("every field's section id is declared in the descriptor's sections", () => {
    for (const type of NODE_TYPES) {
      const d = NODE_FORM_DESCRIPTORS[type];
      const sectionIds = new Set(d.sections.map((s) => s.id));
      for (const field of d.fields) {
        if (field.section) expect(sectionIds.has(field.section), `${type}.${field.key}`).toBe(true);
      }
    }
  });

  it('edge sub-editors reference valid edge types and inline props', () => {
    for (const type of NODE_TYPES) {
      for (const sub of NODE_FORM_DESCRIPTORS[type].edges) {
        expect(EDGE_TYPES).toContain(sub.edgeType);
        const keys = shapeKeys(EDGE_PROPS_SCHEMAS[sub.edgeType]);
        if (!keys || !sub.inlineProps) continue;
        for (const f of sub.inlineProps) {
          expect(keys.has(f.key), `${type} sub-editor ${sub.edgeType}.${f.key}`).toBe(true);
        }
      }
    }
  });

  /** FR-013 (review 2026-07-13): the API enforces this matrix on edge create. */
  it('the endpoint matrix accepts every relationship the product actually creates', () => {
    const real: Array<[Parameters<typeof edgeEndpointsAllowed>[0], string, string]> = [
      ['KNOWS', 'person', 'person'],
      ['HELD', 'person', 'role'],
      ['ROLE_AT', 'role', 'organization'],
      ['WORKED_ON', 'person', 'project'],
      ['PART_OF', 'repository', 'project'],
      ['USES_SKILL', 'role', 'skill'],
      ['USES_SKILL', 'repository', 'skill'],
      ['ATTENDED', 'person', 'event'],
      ['ATTENDED', 'person', 'education'], // LinkedIn education import
      ['WITH', 'interaction', 'person'],
      ['WITH', 'interview', 'person'],
      ['ABOUT', 'highlight', 'media_item'],
      ['AUTHORED', 'person', 'publication'],
      ['EARNED', 'person', 'certification'],
      ['LOCATED_IN', 'person', 'location'],
      ['VISITED', 'person', 'location'],
      ['MENTIONS', 'link', 'project'],
      ['SHARED_BY', 'media_item', 'person'],
      ['REFERRED_BY', 'application', 'person'],
      ['APPLIED_TO', 'application', 'organization'],
      ['APPLIED_TO', 'job_posting', 'organization'],
      ['RELATES_TO', 'application', 'job_posting'],
      ['RELATES_TO', 'goal', 'publication'],
      ['COMPLETED', 'person', 'course'],
      ['RECOMMENDS', 'person', 'reference'],
      ['INTERVIEW_FOR', 'interview', 'application'],
      ['STUDIED_AT', 'person', 'organization'],
      ['STUDIED_AT', 'person', 'education'],
      ['FOUNDED', 'person', 'organization'],
      ['REPORTS_TO', 'person', 'person'],
      ['MEMBER_OF', 'person', 'organization'],
      ['REACTED_TO', 'person', 'post'],
      ['ORG_RELATED', 'organization', 'organization'],
      ['DEPENDS_ON', 'task', 'task'],
      ['SERVES_GOAL', 'task', 'goal'],
      ['SERVES_GOAL', 'project', 'goal'],
      ['WAITING_ON', 'task', 'person'],
      ['WAITING_ON', 'task', 'organization'],
      ['FOR', 'task', 'person'],
      ['FOR', 'task', 'organization'],
      ['FOR', 'task', 'application'],
    ];
    for (const [type, src, dst] of real) {
      expect(edgeEndpointsAllowed(type, src, dst).ok, `${type}: ${src} → ${dst}`).toBe(true);
    }
  });

  it('the endpoint matrix rejects semantically invalid relationships', () => {
    const nonsense: Array<[Parameters<typeof edgeEndpointsAllowed>[0], string, string]> = [
      ['KNOWS', 'person', 'organization'], // you know people, not companies
      ['HELD', 'organization', 'role'],
      ['ROLE_AT', 'person', 'organization'], // must go through a role
      ['USES_SKILL', 'person', 'organization'],
      ['APPLIED_TO', 'person', 'organization'],
      ['INTERVIEW_FOR', 'person', 'application'],
      ['PART_OF', 'repository', 'organization'],
      ['STUDIED_AT', 'organization', 'person'],
      ['FOUNDED', 'organization', 'person'],
      ['REPORTS_TO', 'person', 'organization'],
      ['ORG_RELATED', 'person', 'organization'],
      ['ORG_RELATED', 'organization', 'person'],
      ['DEPENDS_ON', 'task', 'goal'],
      ['SERVES_GOAL', 'task', 'task'],
      ['WAITING_ON', 'task', 'task'],
      ['FOR', 'person', 'task'],
    ];
    for (const [type, src, dst] of nonsense) {
      const result = edgeEndpointsAllowed(type, src, dst);
      expect(result.ok, `${type}: ${src} → ${dst}`).toBe(false);
      if (!result.ok) expect(result.message).toContain(type);
    }
  });

  /**
   * The guarantee that any subject-bearing record can be attached to *any*
   * person, me, someone already in the graph, or someone new. If a future node
   * type declares a subject the endpoint matrix would reject, this fails rather
   * than shipping a form whose submit can only 400.
   */
  it('every declared subject edge is legal person ↔ node under the endpoint matrix', () => {
    for (const type of NODE_TYPES) {
      const subject = NODE_FORM_DESCRIPTORS[type].subject;
      if (!subject) continue;
      const [src, dst] = subject.direction === 'in' ? ['person', type] : [type, 'person'];
      const result = edgeEndpointsAllowed(subject.edgeType, src, dst);
      expect(result.ok, `${type} subject ${subject.edgeType}: ${src} → ${dst}`).toBe(true);
    }
  });

  it('a subject edge is never also declared as a single-value sub-editor', () => {
    // Duplicating it would render two pickers writing the same edge. Sub-editors
    // for the same edge with cardinality 'many' are fine, those are additional
    // people (co-authors, collaborators), a different question from "whose is this".
    for (const type of NODE_TYPES) {
      const d = NODE_FORM_DESCRIPTORS[type];
      if (!d.subject) continue;
      const clash = d.edges.find(
        (e) =>
          e.edgeType === d.subject!.edgeType &&
          e.direction === d.subject!.direction &&
          e.cardinality === 'one',
      );
      expect(clash, `${type} duplicates its subject edge as a sub-editor`).toBeUndefined();
    }
  });

  it('every record type that belongs to a person declares a subject', () => {
    // Guards the original defect: these types were creatable with no owner edge
    // at all, leaving them silently orphaned in the graph.
    const mustHaveSubject = [
      'role',
      'education',
      'certification',
      'course',
      'award',
      'publication',
      'talk',
      'project',
      'repository',
      'reference',
      'post',
    ] as const;
    for (const type of mustHaveSubject) {
      expect(NODE_FORM_DESCRIPTORS[type].subject, type).toBeDefined();
    }
  });

  it('the read-path subject map agrees with the descriptors it derives from', () => {
    // Ownership is read at query time, not only when rendering forms. If these two
    // ever diverge, a record silently changes owner between the editor and the
    // résumé, which is exactly the class of bug this map exists to close.
    for (const type of NODE_TYPES) {
      expect(subjectEdgeFor(type), type).toBe(NODE_FORM_DESCRIPTORS[type].subject ?? null);
      expect(isSubjectBearing(type), type).toBe(Boolean(NODE_FORM_DESCRIPTORS[type].subject));
    }
    expect(SUBJECT_BEARING_TYPES).toContain('role');
    expect(SUBJECT_BEARING_TYPES).toContain('education');
    // Shared vocabulary belongs to nobody.
    expect(SUBJECT_BEARING_TYPES).not.toContain('organization');
    expect(SUBJECT_BEARING_TYPES).not.toContain('skill');
  });

  it('resolves who a subject edge assigns a record to, and ignores other edges', () => {
    const typeOf = (id: string): string | undefined =>
      ({ me: 'person', them: 'person', r1: 'role', org1: 'organization', skill1: 'skill' })[id];

    // HELD person -> role: direction 'in', so the role is the dst.
    expect(subjectAssignment({ type: 'HELD', src: 'me', dst: 'r1' }, typeOf)).toEqual({
      recordId: 'r1',
      personId: 'me',
    });
    // ROLE_AT role -> organization is not a subject edge.
    expect(subjectAssignment({ type: 'ROLE_AT', src: 'r1', dst: 'org1' }, typeOf)).toBeNull();
    // USES_SKILL person -> skill: skills carry no subject.
    expect(subjectAssignment({ type: 'USES_SKILL', src: 'me', dst: 'skill1' }, typeOf)).toBeNull();
    // Right edge type, wrong direction.
    expect(subjectAssignment({ type: 'HELD', src: 'r1', dst: 'me' }, typeOf)).toBeNull();
  });

  it('select widgets always carry options', () => {
    const all = [
      ...Object.values(NODE_FORM_DESCRIPTORS).flatMap((d) => d.fields),
      ...Object.values(EDGE_FORM_DESCRIPTORS).flatMap((d) => d.fields),
    ];
    for (const f of all) {
      if (f.widget === 'select') expect(f.options?.length, f.key).toBeGreaterThan(0);
      if (f.widget === 'object-list') expect(f.itemFields?.length, f.key).toBeGreaterThan(0);
      if (f.widget === 'suggest-list') expect(f.suggestKind, f.key).toBeTruthy();
    }
  });

  it('an existing application form offers only legal next statuses, not the full enum', () => {
    const create = nodeFormDescriptor('application');
    const createStatus = create.fields.find((f) => f.key === 'status');
    expect(createStatus?.options?.map((o) => o.value)).toEqual([...APPLICATION_STATUSES]);

    const interview = nodeFormDescriptor('application', { applicationStatus: 'interview' });
    const interviewStatus = interview.fields.find((f) => f.key === 'status');
    expect(interviewStatus?.options?.map((o) => o.value)).toEqual([
      'interview',
      'offer',
      'accepted',
      'rejected',
      'withdrawn',
    ]);
    expect(interviewStatus?.options?.map((o) => o.value)).not.toContain('draft');
    expect(interviewStatus?.help).toMatch(/Correct status/);

    const rejected = nodeFormDescriptor('application', { applicationStatus: 'rejected' });
    expect(rejected.fields.find((f) => f.key === 'status')?.options?.map((o) => o.value)).toEqual([
      'rejected',
    ]);
  });
});
