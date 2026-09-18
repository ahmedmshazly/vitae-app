/**
 * Form descriptors for every edge type (SRS §4.4 E1-E18). Drives the generic
 * "Add connection" flow: the type picker filters by src/dst compatibility with
 * the node in hand, then renders the per-type props mini-form.
 */
import type { EdgeType } from '../types.js';
import { ORG_RELATION_KINDS, PERSON_RELATIONS } from '../schema/edge-props.js';
import type { EdgeFormDescriptor, FieldDescriptor, SelectOption } from './types.js';

function sel(...values: string[]): SelectOption[] {
  return values.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' '),
  }));
}

const knowsFields: FieldDescriptor[] = [
  {
    key: 'relation',
    label: 'Relation',
    widget: 'select',
    options: sel(...PERSON_RELATIONS),
    help: 'Friend, colleague, family, mentor, ...',
  },
  { key: 'closeness', label: 'Closeness', widget: 'rating', min: 1, max: 5 },
  {
    key: 'cadence_target_days',
    label: 'Reconnect cadence (days)',
    widget: 'number',
    mono: true,
    min: 1,
    help: 'Defaults by closeness: 5→30, 4→60, 3→120, 2→365.',
  },
  { key: 'met_via', label: 'Met via', widget: 'text', placeholder: "intro'd by Omar" },
  { key: 'met_on', label: 'Met on', widget: 'date', mono: true },
  { key: 'topics', label: 'Topics', widget: 'suggest-list', suggestKind: 'topic' },
  { key: 'do_not_ping', label: 'Do not ping', widget: 'checkbox' },
  {
    key: 'favors',
    label: 'Favors',
    widget: 'object-list',
    itemFields: [
      { key: 'direction', label: 'Direction', widget: 'select', options: sel('owed_to_me', 'owed_by_me'), required: true },
      { key: 'what', label: 'What', widget: 'text', required: true },
      { key: 'on', label: 'On', widget: 'date' },
      { key: 'settled', label: 'Settled', widget: 'checkbox' },
    ],
  },
];

export const EDGE_FORM_DESCRIPTORS: Record<EdgeType, EdgeFormDescriptor> = {
  KNOWS: {
    type: 'KNOWS',
    label: 'Knows',
    description: 'Person ↔ person, typed relationship (friend, colleague, family, ...).',
    srcTypes: ['person'],
    dstTypes: ['person'],
    fields: knowsFields,
  },
  HELD: {
    type: 'HELD',
    label: 'Held role',
    description: 'Person → role they held (title at a company).',
    srcTypes: ['person'],
    dstTypes: ['role'],
    fields: [],
  },
  ROLE_AT: {
    type: 'ROLE_AT',
    label: 'Role at org',
    description: 'Role → organization where that title lived.',
    srcTypes: ['role'],
    dstTypes: ['organization'],
    fields: [{ key: 'department', label: 'Department', widget: 'text' }],
  },
  WORKED_ON: {
    type: 'WORKED_ON',
    label: 'Worked on',
    description: 'Person → project they contributed to.',
    srcTypes: ['person'],
    dstTypes: ['project'],
    fields: [
      { key: 'my_role', label: 'Role', widget: 'text', placeholder: 'tech lead' },
      { key: 'involvement', label: 'Involvement', widget: 'select', options: sel('led', 'core', 'contributor', 'advisor') },
    ],
  },
  PART_OF: {
    type: 'PART_OF',
    label: 'Part of',
    description: 'Generic containment, repository → project, education → organization, project → role/org.',
    srcTypes: ['repository', 'education', 'project'],
    dstTypes: ['project', 'organization', 'role'],
    fields: [{ key: 'context', label: 'Context', widget: 'text', placeholder: '20% time' }],
  },
  USES_SKILL: {
    type: 'USES_SKILL',
    label: 'Uses skill',
    description: 'Person, role, project, or repository → skill.',
    srcTypes: ['person', 'role', 'project', 'repository'],
    dstTypes: ['skill'],
    fields: [
      { key: 'level', label: 'Level', widget: 'select', options: sel('learning', 'working', 'proficient', 'expert') },
      { key: 'centrality', label: 'Centrality', widget: 'select', options: sel('core', 'supporting') },
      { key: 'evidence_note', label: 'Evidence', widget: 'text' },
    ],
  },
  ATTENDED: {
    type: 'ATTENDED',
    label: 'Attended',
    description: 'Person → event (conferences, meetups). For school/programs prefer Studied at.',
    srcTypes: ['person'],
    dstTypes: ['event', 'education'],
    fields: [
      {
        key: 'role',
        label: 'Role',
        widget: 'select',
        options: sel('attendee', 'speaker', 'organizer', 'volunteer', 'student'),
      },
    ],
  },
  WITH: {
    type: 'WITH',
    label: 'With',
    description: 'Anything (interaction, trip, interview, event...) → person present.',
    srcTypes: '*',
    dstTypes: ['person'],
    fields: [],
  },
  ABOUT: {
    type: 'ABOUT',
    label: 'About',
    description: 'Content or activity → what it concerns. A comment points at its parent post this way.',
    srcTypes: [
      'interaction',
      'task',
      'idea',
      'journal_entry',
      'link',
      'highlight',
      'publication',
      'post',
    ],
    dstTypes: '*',
    fields: [
      { key: 'relevance', label: 'Relevance', widget: 'select', options: sel('primary', 'mention') },
    ],
  },
  AUTHORED: {
    type: 'AUTHORED',
    label: 'Authored',
    description: 'Person → publication, talk, repository, post, or media item.',
    srcTypes: ['person'],
    dstTypes: ['publication', 'talk', 'repository', 'media_item', 'post'],
    fields: [
      { key: 'author_position', label: 'Author position', widget: 'number', mono: true, min: 1 },
      { key: 'weight', label: 'Weight', widget: 'select', options: sel('sole', 'lead', 'co') },
    ],
  },
  EARNED: {
    type: 'EARNED',
    label: 'Earned credential',
    description: 'Person → education, certification, or award they hold.',
    srcTypes: ['person'],
    dstTypes: ['education', 'certification', 'award'],
    fields: [],
  },
  LOCATED_IN: {
    type: 'LOCATED_IN',
    label: 'Located in',
    description: 'Anything → location.',
    srcTypes: '*',
    dstTypes: ['location'],
    fields: [
      { key: 'precision', label: 'Precision', widget: 'select', options: sel('exact', 'approximate') },
    ],
  },
  VISITED: {
    type: 'VISITED',
    label: 'Visited',
    description: 'Trip or person → location.',
    srcTypes: ['trip', 'person'],
    dstTypes: ['location'],
    fields: [{ key: 'nights', label: 'Nights', widget: 'number', mono: true, min: 0 }],
  },
  MENTIONS: {
    type: 'MENTIONS',
    label: 'Mentions',
    description: 'Notes → what they @mention (usually auto-created).',
    srcTypes: '*',
    dstTypes: '*',
    fields: [{ key: 'span', label: 'Snippet', widget: 'text', mono: true }],
  },
  SHARED_BY: {
    type: 'SHARED_BY',
    label: 'Shared by',
    description: 'Link or media item → the person who shared it.',
    srcTypes: ['link', 'media_item'],
    dstTypes: ['person'],
    fields: [
      { key: 'shared_on', label: 'On', widget: 'date', mono: true },
      { key: 'channel', label: 'Channel', widget: 'text', placeholder: 'WhatsApp' },
    ],
  },
  REFERRED_BY: {
    type: 'REFERRED_BY',
    label: 'Referred by',
    description: 'Application → the person who referred you.',
    srcTypes: ['application'],
    dstTypes: ['person'],
    fields: [
      { key: 'asked_on', label: 'Asked on', widget: 'date', mono: true },
      { key: 'outcome', label: 'Outcome', widget: 'select', options: sel('agreed', 'declined', 'pending') },
    ],
  },
  APPLIED_TO: {
    type: 'APPLIED_TO',
    label: 'Applied to',
    description: 'Application or job posting → organization.',
    srcTypes: ['application', 'job_posting'],
    dstTypes: ['organization'],
    fields: [],
  },
  RELATES_TO: {
    type: 'RELATES_TO',
    label: 'Relates to',
    description: 'Typed catch-all link between any two records.',
    srcTypes: '*',
    dstTypes: '*',
    fields: [{ key: 'label', label: 'Label', widget: 'text', placeholder: 'issued by · inspired · blocks' }],
  },
  COMPLETED: {
    type: 'COMPLETED',
    label: 'Completed course',
    description: 'Person → course or program they finished.',
    srcTypes: ['person'],
    dstTypes: ['course', 'education'],
    fields: [
      { key: 'completed_on', label: 'Completed on', widget: 'date', mono: true },
      { key: 'grade', label: 'Grade', widget: 'text' },
    ],
  },
  RECOMMENDS: {
    type: 'RECOMMENDS',
    label: 'Recommends',
    description: 'Person or reference → who/what they vouch for.',
    srcTypes: ['person', 'reference'],
    dstTypes: ['person', 'application', 'organization', 'reference'],
    fields: [
      { key: 'relationship', label: 'Relationship', widget: 'text' },
      { key: 'strength', label: 'Strength', widget: 'rating', min: 1, max: 5 },
    ],
  },
  INTERVIEW_FOR: {
    type: 'INTERVIEW_FOR',
    label: 'Interview for',
    description: 'Interview → the application or posting it belongs to.',
    srcTypes: ['interview'],
    dstTypes: ['application', 'job_posting'],
    fields: [{ key: 'round_no', label: 'Round #', widget: 'number', mono: true, min: 1 }],
  },
  REACTED_TO: {
    type: 'REACTED_TO',
    label: 'Reacted to',
    description: 'Person → post they reacted to.',
    srcTypes: ['person'],
    dstTypes: ['post'],
    fields: [
      {
        key: 'reaction_kind',
        label: 'Reaction',
        widget: 'select',
        options: sel('like', 'celebrate', 'support', 'love', 'insightful', 'funny'),
      },
      { key: 'reacted_on', label: 'On', widget: 'date', mono: true },
    ],
  },
  MEMBER_OF: {
    type: 'MEMBER_OF',
    label: 'Member of',
    description: 'Person → a body they belong to (association, group, club), not school enrollment.',
    srcTypes: ['person'],
    dstTypes: ['organization'],
    fields: [
      { key: 'role', label: 'Role', widget: 'text', placeholder: 'Senior Member' },
      { key: 'since', label: 'Since', widget: 'date', mono: true },
    ],
  },
  FOLLOWS: {
    type: 'FOLLOWS',
    label: 'Follows',
    description: 'Person → organization or person they follow. Weaker than Knows, and one-way.',
    srcTypes: ['person'],
    dstTypes: ['organization', 'person'],
    fields: [{ key: 'followed_on', label: 'Since', widget: 'date', mono: true }],
  },
  STUDIED_AT: {
    type: 'STUDIED_AT',
    label: 'Studied at',
    description: 'Person → school/organization or education program they attended as a student.',
    srcTypes: ['person'],
    dstTypes: ['organization', 'education'],
    fields: [
      { key: 'degree', label: 'Degree', widget: 'text', placeholder: 'B.Sc.' },
      { key: 'field', label: 'Field', widget: 'text', placeholder: 'Computer Science' },
      { key: 'start_date', label: 'Started', widget: 'date', mono: true },
      { key: 'end_date', label: 'Ended', widget: 'date', mono: true },
    ],
  },
  FOUNDED: {
    type: 'FOUNDED',
    label: 'Founded',
    description: 'Person → organization they founded or co-founded.',
    srcTypes: ['person'],
    dstTypes: ['organization'],
    fields: [
      { key: 'role', label: 'Role', widget: 'select', options: sel('founder', 'co_founder', 'founding_member') },
      { key: 'since', label: 'Since', widget: 'date', mono: true },
    ],
  },
  REPORTS_TO: {
    type: 'REPORTS_TO',
    label: 'Reports to',
    description: 'Person → their manager (directed org-chart link; not the same as Knows).',
    srcTypes: ['person'],
    dstTypes: ['person'],
    fields: [{ key: 'title', label: 'Their title', widget: 'text', placeholder: 'Engineering Manager' }],
  },
  ORG_RELATED: {
    type: 'ORG_RELATED',
    label: 'Related org',
    description: 'Organization → organization (parent, partner, competitor, ...).',
    srcTypes: ['organization'],
    dstTypes: ['organization'],
    fields: [
      {
        key: 'kind',
        label: 'Kind',
        widget: 'select',
        options: sel(...ORG_RELATION_KINDS),
        required: true,
      },
      { key: 'note', label: 'Note', widget: 'text', placeholder: 'Optional context' },
    ],
  },
  INTRODUCED: {
    type: 'INTRODUCED',
    label: 'Introduced',
    description:
      'Person ↔ person who met through an introduction; `via` credits the broker (FR-COMM-003).',
    srcTypes: ['person'],
    dstTypes: ['person'],
    fields: [
      {
        key: 'via',
        label: 'Via',
        widget: 'text',
        placeholder: 'the broker',
        help: 'Person id when recorded from a profile; kept as written otherwise.',
      },
      { key: 'occurred_on', label: 'On', widget: 'date', mono: true },
      { key: 'context', label: 'Context', widget: 'text', placeholder: 'conference hallway, a thread, ...' },
    ],
  },
  DEPENDS_ON: {
    type: 'DEPENDS_ON',
    label: 'Depends on',
    description: 'Task → task that must finish first. Cycle detection is a pure check, not a DB constraint.',
    srcTypes: ['task'],
    dstTypes: ['task'],
    fields: [],
  },
  SERVES_GOAL: {
    type: 'SERVES_GOAL',
    label: 'Serves goal',
    description: 'Task or project → the goal it serves.',
    srcTypes: ['task', 'project'],
    dstTypes: ['goal'],
    fields: [],
  },
  WAITING_ON: {
    type: 'WAITING_ON',
    label: 'Waiting on',
    description: 'Task → the person or organization it is blocked on.',
    srcTypes: ['task'],
    dstTypes: ['person', 'organization'],
    fields: [],
  },
  FOR: {
    type: 'FOR',
    label: 'For',
    description: 'Task → the person, organization, or application it is for.',
    srcTypes: ['task'],
    dstTypes: ['person', 'organization', 'application'],
    fields: [],
  },
  IN_AREA: {
    type: 'IN_AREA',
    label: 'In life area',
    description: 'A goal, project, task, habit, event, account, subscription, or opportunity → its ongoing life responsibility.',
    srcTypes: ['goal', 'project', 'task', 'habit', 'event', 'account', 'subscription', 'opportunity'],
    dstTypes: ['area'],
    fields: [{ key: 'primary', label: 'Primary area', widget: 'checkbox' }],
  },
  PARTICIPATES_IN: {
    type: 'PARTICIPATES_IN',
    label: 'Participates in',
    description: 'Person or organization → a project, event, or opportunity they participate in.',
    srcTypes: ['person', 'organization'],
    dstTypes: ['project', 'event', 'opportunity'],
    fields: [{ key: 'role', label: 'Role', widget: 'text' }],
  },
  AFFILIATED_WITH: {
    type: 'AFFILIATED_WITH',
    label: 'Affiliated with',
    description: 'Person → organization affiliation that is not ownership, employment, or membership.',
    srcTypes: ['person'],
    dstTypes: ['organization'],
    fields: [{ key: 'role', label: 'Context', widget: 'text' }],
  },
};

export function edgeFormDescriptor(type: EdgeType): EdgeFormDescriptor {
  return EDGE_FORM_DESCRIPTORS[type];
}

/** Edge types whose src may be the given node type. */
export function edgeTypesFrom(nodeType: string): EdgeFormDescriptor[] {
  return Object.values(EDGE_FORM_DESCRIPTORS).filter(
    (d) => d.srcTypes === '*' || (d.srcTypes as string[]).includes(nodeType),
  );
}

/** Edge types whose dst may be the given node type. */
export function edgeTypesTo(nodeType: string): EdgeFormDescriptor[] {
  return Object.values(EDGE_FORM_DESCRIPTORS).filter(
    (d) => d.dstTypes === '*' || (d.dstTypes as string[]).includes(nodeType),
  );
}

/**
 * The shared edge endpoint matrix (SRS §4.4): may an edge of `type` run from a
 * `srcType` node to a `dstType` node? The API enforces this on create with the
 * exact rules the "Add connection" picker uses, so client and server can never
 * disagree about which relationships are representable.
 */
export function edgeEndpointsAllowed(
  type: EdgeType,
  srcType: string,
  dstType: string,
): { ok: true } | { ok: false; message: string } {
  const d = EDGE_FORM_DESCRIPTORS[type];
  if (type === 'PART_OF') {
    const pairs = new Set([
      'repository|project',
      'education|organization',
      'project|role',
      'project|organization',
    ]);
    if (!pairs.has(`${srcType}|${dstType}`)) {
      return {
        ok: false,
        message: `PART_OF cannot connect ${srcType} → ${dstType} (allowed: repository → project, education → organization, project → role/organization)`,
      };
    }
    return { ok: true };
  }
  if (d.srcTypes !== '*' && !(d.srcTypes as string[]).includes(srcType)) {
    return { ok: false, message: `${type} cannot start from a ${srcType} node (allowed: ${(d.srcTypes as string[]).join(', ')})` };
  }
  if (d.dstTypes !== '*' && !(d.dstTypes as string[]).includes(dstType)) {
    return { ok: false, message: `${type} cannot point to a ${dstType} node (allowed: ${(d.dstTypes as string[]).join(', ')})` };
  }
  return { ok: true };
}
