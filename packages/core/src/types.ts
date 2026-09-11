/**
 * Canonical domain vocabulary for Vitae (SRS §4.3 node catalog, §4.4 edge
 * catalog). These string-literal unions are the single source of truth shared
 * by the Zod schemas, the API, and the web app.
 */

/** Career-core node types (SRS §4.3.1-12), shipped with bespoke UI. */
export const CAREER_NODE_TYPES = [
  'person',
  'organization',
  'role',
  'project',
  'repository',
  'skill',
  'education',
  'certification',
  'course',
  'publication',
  'talk',
  'award',
  'reference',
  'job_posting',
  'application',
  'interview',
] as const;

/** Life-core node types (SRS §4.3.13-21). */
export const LIFE_NODE_TYPES = [
  'event',
  'interaction',
  'task',
  'goal',
  'habit',
  'journal_entry',
  'idea',
  'link',
  'document',
  'subscription',
  // Social/professional content: a feed post, a long-form article, a comment on
  // one, or a reshare. One type with a `post_kind` discriminator rather than
  // four near-identical types, same idiom as event.kind / interaction.kind.
  'post',
] as const;

/** Proposed / long-tail node types (SRS §4.3.22-28), schema-only in this slice. */
export const PROPOSED_NODE_TYPES = [
  'location',
  'trip',
  'media_item',
  'highlight',
  'asset',
  'health_log',
  'account',
] as const;

export const NODE_TYPES = [
  ...CAREER_NODE_TYPES,
  ...LIFE_NODE_TYPES,
  ...PROPOSED_NODE_TYPES,
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** First-class relationship types (SRS §4.4, E1-E18). */
export const EDGE_TYPES = [
  'KNOWS',
  'HELD',
  'ROLE_AT',
  'WORKED_ON',
  'PART_OF',
  'USES_SKILL',
  'ATTENDED',
  'WITH',
  'ABOUT',
  'AUTHORED',
  'EARNED',
  'LOCATED_IN',
  'VISITED',
  'MENTIONS',
  'SHARED_BY',
  'REFERRED_BY',
  'APPLIED_TO',
  'RELATES_TO',
  'COMPLETED',
  'RECOMMENDS',
  'INTERVIEW_FOR',
  'REACTED_TO',
  'MEMBER_OF',
  'FOLLOWS',
  'STUDIED_AT',
  'FOUNDED',
  'REPORTS_TO',
  'ORG_RELATED',
  'INTRODUCED',
  'DEPENDS_ON',
  'SERVES_GOAL',
  'WAITING_ON',
  'FOR',
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

/** Provenance sources (SRS §4.2 `source`). */
export const SOURCE_TYPES = [
  'manual',
  'import_linkedin',
  'import_github',
  'import_vcard',
  'import_csv',
  'import_ics',
  'import_bookmarks',
  'parse_resume',
  'import_aperture',
  'system',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/** Revision operations (SRS §4.7). */
export const REVISION_OPS = [
  'create',
  'update',
  'append',
  'archive',
  'restore',
  'merge',
  'delete',
] as const;

export type RevisionOp = (typeof REVISION_OPS)[number];

export type Sensitivity = 'normal' | 'sensitive';
export type DatePrecision = 'day' | 'month' | 'year';

/** Interaction kinds and their tie-strength weights are defined in
 * `algorithms/constants.ts`; the enum lives with the person/interaction schema. */
export const INTERACTION_KINDS = [
  'meeting',
  'coffee',
  'call',
  'video',
  'message',
  'email',
  'comment',
  'encounter',
  'outreach',
] as const;

export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export function isNodeType(v: string): v is NodeType {
  return (NODE_TYPES as readonly string[]).includes(v);
}

export function isEdgeType(v: string): v is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(v);
}
