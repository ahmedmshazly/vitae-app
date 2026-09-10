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

/** Classic quadrants. Display names are a later preset, not this union. */
export const QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate'] as const;
export type Quadrant = (typeof QUADRANTS)[number];
export const quadrantSchema = z.enum(QUADRANTS);

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

/** Named now; collections land in Task 4. */
export const PRODUCTIVITY_COLLECTIONS = [
  'time_entries',
  'automation_rules',
  'idempotency_receipts',
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

export function isOpenStatus(status: VitaeTaskStatus): status is OpenStatus {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}
