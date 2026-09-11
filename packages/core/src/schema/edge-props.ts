/**
 * Per-type edge `props` schemas (SRS §4.4). KNOWS is the richest, it *is* the
 * relationship (met-context, closeness, cadence, topics, favors).
 */
import { z } from 'zod';
import { EDGE_TYPES, type EdgeType } from '../types.js';
import { isoDate } from './envelope.js';

/** Default reconnect cadence (days) by closeness: SRS E1. */
export const CADENCE_BY_CLOSENESS: Record<number, number | null> = {
  5: 30,
  4: 60,
  3: 120,
  2: 365,
  1: null,
};

/** Person↔person relation kinds on KNOWS (self's view of the other person). */
export const PERSON_RELATIONS = [
  'friend',
  'colleague',
  'classmate',
  'mentor',
  'mentee',
  'sibling',
  'parent',
  'child',
  'family',
  'partner',
  'spouse',
  'neighbor',
  'acquaintance',
  'other',
] as const;

export type PersonRelation = (typeof PERSON_RELATIONS)[number];

/** Org↔org relation kinds on ORG_RELATED (src = org in hand). */
export const ORG_RELATION_KINDS = [
  'parent',
  'subsidiary',
  'partner',
  'competitor',
  'affiliate',
  'investor',
  'portfolio',
  'customer',
  'vendor',
  'member',
  'other',
] as const;

export type OrgRelationKind = (typeof ORG_RELATION_KINDS)[number];

export const knowsProps = z.object({
  /** Typed relationship kind, optional so existing KNOWS edges stay valid. */
  relation: z.enum(PERSON_RELATIONS).optional(),
  met_via: z.string().optional(),
  met_at: z.string().optional(), // → event node id
  met_on: isoDate.optional(),
  closeness: z.number().int().min(1).max(5).optional(),
  cadence_target_days: z.number().int().positive().nullable().optional(),
  topics: z.array(z.string()).default([]),
  // `id` and `created_at` are what the favor ledger settles individual favors
  // by; they are part of the canonical shape, not a route-local addition.
  favors: z
    .array(
      z.object({
        id: z.string().optional(),
        direction: z.enum(['owed_to_me', 'owed_by_me']),
        what: z.string().min(1),
        on: isoDate.optional(),
        settled: z.boolean().default(false),
        created_at: z.string().optional(),
      }),
    )
    .default([]),
  intro_path: z.string().optional(),
  do_not_ping: z.boolean().optional(),
  // Derived nightly (SRS §10.3), persisted for fast reads.
  last_interaction_at: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
});

export const orgRelatedProps = z.object({
  kind: z.enum(ORG_RELATION_KINDS),
  note: z.string().optional(),
});

export const usesSkillProps = z.object({
  level: z.enum(['learning', 'working', 'proficient', 'expert']).optional(),
  centrality: z.enum(['core', 'supporting']).optional(),
  evidence_note: z.string().optional(),
});

export const workedOnProps = z.object({
  my_role: z.string().optional(),
  involvement: z.enum(['led', 'core', 'contributor', 'advisor']).optional(),
});

export const attendedProps = z.object({
  role: z.enum(['attendee', 'speaker', 'organizer', 'volunteer', 'student']).optional(),
});

export const aboutProps = z.object({
  relevance: z.enum(['primary', 'mention']).default('primary'),
});

export const authoredProps = z.object({
  author_position: z.number().int().optional(),
  weight: z.enum(['sole', 'lead', 'co']).optional(),
});

export const sharedByProps = z.object({
  shared_on: isoDate.optional(),
  channel: z.string().optional(),
});

export const referredByProps = z.object({
  asked_on: isoDate.optional(),
  outcome: z.enum(['agreed', 'declined', 'pending']).optional(),
});

export const relatesToProps = z.object({ label: z.string().optional() });

export const completedProps = z.object({
  completed_on: isoDate.optional(),
  grade: z.string().optional(),
});

export const recommendsProps = z.object({
  relationship: z.string().optional(),
  strength: z.number().int().min(1).max(5).optional(),
});

export const interviewForProps = z.object({
  round_no: z.number().int().positive().optional(),
});

/** A reaction is a relationship, not a record, it has no life of its own. */
export const reactedToProps = z.object({
  reaction_kind: z
    .enum(['like', 'celebrate', 'support', 'love', 'insightful', 'funny'])
    .optional(),
  reacted_on: isoDate.optional(),
});

/** Membership of a body, professional association, group, club. */
export const memberOfProps = z.object({
  role: z.string().optional(),
  since: isoDate.optional(),
});

/** A following/interest link. Weaker than KNOWS, and not reciprocal. */
export const followsProps = z.object({
  followed_on: isoDate.optional(),
});

export const studiedAtProps = z.object({
  degree: z.string().optional(),
  field: z.string().optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
});

export const foundedProps = z.object({
  role: z.enum(['founder', 'co_founder', 'founding_member']).optional(),
  since: isoDate.optional(),
});

export const reportsToProps = z.object({
  title: z.string().optional(),
});

/**
 * An introduction as a first-class fact (SRS FR-COMM-003): the edge connects
 * the two people who now know each other; `via` names the broker: a person
 * id when recorded from a profile, tolerated as written otherwise. The
 * warm-path search already treats the edge as a connection hop.
 */
export const introducedProps = z.object({
  via: z.string().optional(),
  occurred_on: isoDate.optional(),
  context: z.string().optional(),
});

const emptyProps = z.record(z.string(), z.unknown());

/* Every schema is `.passthrough()` so unknown keys (derived fields written by
 * services, imports) round-trip through validate → PATCH without being
 * silently stripped. */
export const EDGE_PROPS_SCHEMAS = {
  KNOWS: knowsProps.passthrough(),
  HELD: emptyProps,
  ROLE_AT: z.object({ department: z.string().optional() }).passthrough(),
  WORKED_ON: workedOnProps.passthrough(),
  PART_OF: z.object({ context: z.string().optional() }).passthrough(),
  USES_SKILL: usesSkillProps.passthrough(),
  ATTENDED: attendedProps.passthrough(),
  WITH: emptyProps,
  ABOUT: aboutProps.passthrough(),
  AUTHORED: authoredProps.passthrough(),
  EARNED: emptyProps,
  LOCATED_IN: z.object({ precision: z.enum(['exact', 'approximate']).optional() }).passthrough(),
  VISITED: z.object({ nights: z.number().int().optional() }).passthrough(),
  MENTIONS: z.object({ span: z.string().optional() }).passthrough(),
  SHARED_BY: sharedByProps.passthrough(),
  REFERRED_BY: referredByProps.passthrough(),
  APPLIED_TO: emptyProps,
  RELATES_TO: relatesToProps.passthrough(),
  COMPLETED: completedProps.passthrough(),
  RECOMMENDS: recommendsProps.passthrough(),
  INTERVIEW_FOR: interviewForProps.passthrough(),
  REACTED_TO: reactedToProps.passthrough(),
  MEMBER_OF: memberOfProps.passthrough(),
  FOLLOWS: followsProps.passthrough(),
  STUDIED_AT: studiedAtProps.passthrough(),
  FOUNDED: foundedProps.passthrough(),
  REPORTS_TO: reportsToProps.passthrough(),
  ORG_RELATED: orgRelatedProps.passthrough(),
  INTRODUCED: introducedProps.passthrough(),
  DEPENDS_ON: emptyProps,
  SERVES_GOAL: emptyProps,
  WAITING_ON: emptyProps,
  FOR: emptyProps,
} satisfies Record<EdgeType, z.ZodType>;

export function edgePropsSchemaFor(type: EdgeType): z.ZodType {
  return EDGE_PROPS_SCHEMAS[type] ?? emptyProps;
}

/** Runtime guard used by validation error messages. */
export const EDGE_TYPE_SET = new Set<string>(EDGE_TYPES);
