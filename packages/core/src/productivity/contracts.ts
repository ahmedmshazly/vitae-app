/**
 * Shared unions for the Fourfold-to-Vitae productivity contract.
 *
 * Types and Zod only. No placement, recurrence, HTTP, database, or clock.
 * Importance, quadrants, and reason keys match Fourfold; Vitae priority stays
 * `p1`–`p4` (see docs/specs/productivity-compatibility.md).
 */
import { z } from 'zod';
import { isoDate } from '../schema/envelope.js';

/** Fourfold / Vitae importance assertion. Do not invent a fourth value. */
export const IMPORTANCE = ['none', 'important', 'critical'] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const importanceSchema = z.enum(IMPORTANCE);

/** Fourfold `ENERGY_LEVELS`. Optional on persisted task props. */
export const ENERGY_LEVELS = ['low', 'medium', 'high'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];
export const energySchema = z.enum(ENERGY_LEVELS);

/** Classic quadrants. Display names are a later preset, not this union. */
export const QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate'] as const;
export type Quadrant = (typeof QUADRANTS)[number];
export const quadrantSchema = z.enum(QUADRANTS);

/**
 * Command write token for an override. The person names a quadrant; the
 * handler stamps `set_at`. Do not send the persisted object on a command.
 */
export const quadrantOverrideTokenSchema = quadrantSchema;
export type QuadrantOverrideToken = Quadrant;

/**
 * Persisted / placement / read-model override. `set_at` is a calendar date
 * in the workspace timezone (ADR 0010).
 */
export const quadrantOverrideSchema = z.object({
  quadrant: quadrantSchema,
  set_at: isoDate,
});
export type QuadrantOverride = z.infer<typeof quadrantOverrideSchema>;

/**
 * Why a card sits in a quadrant. Copied from Fourfold `placement.ts` so Task 3
 * can implement `placeItem` against the same keys the fixtures already name.
 */
export const REASON_KEYS = [
  'due_within_window',
  'due_past',
  'target_within_window',
  'target_past',
  'follow_up_due',
  'waiting_patience_exceeded',
  'stage_patience_exceeded',
  'importance_asserted',
  'project_default',
  'serves_goal',
  'placed_by_you',
  'no_signal',
] as const;
export type ReasonKey = (typeof REASON_KEYS)[number];
export const reasonKeySchema = z.enum(REASON_KEYS);

/** Persisted Vitae task status. Fourfold `open` is a read-model union of the first three. */
export const VITAE_TASK_STATUSES = [
  'inbox',
  'next',
  'doing',
  'waiting',
  'done',
  'dropped',
] as const;
export type VitaeTaskStatus = (typeof VITAE_TASK_STATUSES)[number];
export const vitaeTaskStatusSchema = z.enum(VITAE_TASK_STATUSES);

/** Statuses that Fourfold `open` maps onto in read models only. */
export const OPEN_STATUSES = ['inbox', 'next', 'doing'] as const;
export type OpenStatus = (typeof OPEN_STATUSES)[number];

/** Intra-list tie-break. Existing Vitae field; not importance. */
export const VITAE_PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;
export type VitaePriority = (typeof VITAE_PRIORITIES)[number];
export const vitaePrioritySchema = z.enum(VITAE_PRIORITIES);

/** Fourfold priority vocabulary, for provenance / import mapping only. */
export const FOURFOLD_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;
export type FourfoldPriority = (typeof FOURFOLD_PRIORITIES)[number];
export const fourfoldPrioritySchema = z.enum(FOURFOLD_PRIORITIES);

export const RECURRENCE_MODES = ['fixed', 'from_completion'] as const;
export type RecurrenceMode = (typeof RECURRENCE_MODES)[number];
export const recurrenceModeSchema = z.enum(RECURRENCE_MODES);

export const recurrenceSchema = z.object({
  rrule: z.string().min(1).max(500),
  mode: recurrenceModeSchema,
  exceptions: z.array(isoDate).default([]),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const HISTORY_COMPLETENESS = ['complete', 'sparse', 'unknown'] as const;
export type HistoryCompleteness = (typeof HISTORY_COMPLETENESS)[number];
export const historyCompletenessSchema = z.enum(HISTORY_COMPLETENESS);

export const PRODUCTIVITY_ROUTES = [
  '/today/tasks',
  '/today/waiting',
  '/today/review',
  '/today/analytics',
  '/today/automation',
  '/today/task-templates',
] as const;
export type ProductivityRoute = (typeof PRODUCTIVITY_ROUTES)[number];

export const UNCHANGED_TODAY_ROUTES = ['/today', '/today/planner', '/today/ledger'] as const;

export const PRODUCTIVITY_API_FLAG = 'VITAE_PRODUCTIVITY_ENABLED';
export const PRODUCTIVITY_WEB_FLAG = 'VITE_PUBLIC_PRODUCTIVITY_ENABLED';

/** Named now; added to EDGE_TYPES in Task 3. */
export const PRODUCTIVITY_EDGE_TYPES = ['DEPENDS_ON', 'SERVES_GOAL', 'WAITING_ON', 'FOR'] as const;

/** Persisted in migration 012 as document tables. */
export const PRODUCTIVITY_COLLECTIONS = [
  'time_entries',
  'automation_rules',
  'productivity_receipts',
] as const;

/**
 * Versioned command envelope. `expected_revision` is omitted on create and
 * compared to the head revision on every racing mutation, including undo.
 */
export const commandEnvelopeSchema = z.object({
  version: z.literal(1),
  operation_id: z.string().min(1),
  expected_revision: z.number().int().nonnegative().optional(),
});
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export const dateOnlySchema = isoDate;

/**
 * Fourfold `PREDICATE_OPERATORS` from `rules/condition.ts`. Do not invent more.
 */
export const PREDICATE_OPERATORS = [
  'eq',
  'neq',
  'is_set',
  'is_not_set',
  'contains',
  'before',
  'after',
] as const;
export type PredicateOperator = (typeof PREDICATE_OPERATORS)[number];
export const predicateOperatorSchema = z.enum(PREDICATE_OPERATORS);

/**
 * Vitae names for Fourfold `MATCH_FIELDS`. Date columns use the compatibility
 * map (`due_at` → `due`, `target_at` → `target`). Composition is `all` / `any`
 * / `not` only.
 */
export const MATCH_FIELDS = [
  'title',
  'type',
  'importance',
  'priority',
  'status',
  'due',
  'target',
  'scheduled',
  'follow_up',
  'waiting_since',
  'completed_at',
  'project_id',
  'waiting_on',
  'waiting_patience_days',
  'effort_min',
  'quadrant_override',
  'quadrant',
] as const;
export type MatchField = (typeof MATCH_FIELDS)[number];
export const matchFieldSchema = z.enum(MATCH_FIELDS);

/**
 * Values a rule action actually writes in Fourfold tests: scalars, null, or
 * `{ days }` for `before` / `after`.
 */
export const ruleActionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ days: z.number() }),
]);
export type RuleActionValue = z.infer<typeof ruleActionValueSchema>;

export const ruleActionSchema = z.object({
  field: z.string().min(1).max(120),
  value: ruleActionValueSchema,
});
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const predicateConditionSchema = z.object({
  kind: z.literal('predicate'),
  field: matchFieldSchema,
  operator: predicateOperatorSchema,
  value: ruleActionValueSchema.optional(),
});

export type RuleCondition =
  | z.infer<typeof predicateConditionSchema>
  | { kind: 'all'; conditions: RuleCondition[] }
  | { kind: 'any'; conditions: RuleCondition[] }
  | { kind: 'not'; condition: RuleCondition };

export const ruleConditionSchema: z.ZodType<RuleCondition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    predicateConditionSchema,
    z.object({
      kind: z.literal('all'),
      conditions: z.array(ruleConditionSchema),
    }),
    z.object({
      kind: z.literal('any'),
      conditions: z.array(ruleConditionSchema),
    }),
    z.object({
      kind: z.literal('not'),
      condition: ruleConditionSchema,
    }),
  ]),
);

/** Fourfold's unauthored default (`{}`) matches nothing. */
export const storedRuleConditionSchema = z.union([
  ruleConditionSchema,
  z.object({}).strict(),
]);

export function isOpenStatus(status: VitaeTaskStatus): status is OpenStatus {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}
