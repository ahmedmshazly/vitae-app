/**
 * Productivity read models. Derived `quadrant` and `open` are not persisted.
 * A Placement cannot be constructed without a reason.
 */
import { z } from 'zod';
import { sensitivitySchema } from '../schema/envelope.js';
import {
  dateOnlySchema,
  historyCompletenessSchema,
  importanceSchema,
  quadrantSchema,
  reasonKeySchema,
  vitaePrioritySchema,
  vitaeTaskStatusSchema,
} from './contracts.js';

export const reasonParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));
export type ReasonParams = z.infer<typeof reasonParamsSchema>;

export const placementSchema = z.object({
  quadrant: quadrantSchema,
  reason: reasonKeySchema,
  params: reasonParamsSchema.default({}),
});
export type Placement = z.infer<typeof placementSchema>;

export const taskReadModelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: vitaeTaskStatusSchema,
  rev: z.number().int().nonnegative(),
  due: dateOnlySchema.optional(),
  target: dateOnlySchema.optional(),
  scheduled: dateOnlySchema.optional(),
  follow_up: dateOnlySchema.optional(),
  priority: vitaePrioritySchema.optional(),
  importance: importanceSchema.optional(),
  sensitivity: sensitivitySchema.optional(),
  project_id: z.string().min(1).optional(),
  /** Fourfold source status. Provenance only; never written back to `status`. */
  source_status: z.string().min(1).optional(),
  /** Derived: status in `{inbox, next, doing}`. Not persisted. */
  open: z.boolean().optional(),
  /** Derived. Not persisted. Prefer `placement.quadrant` when a reason exists. */
  quadrant: quadrantSchema.optional(),
  placement: placementSchema.optional(),
});
export type TaskReadModel = z.infer<typeof taskReadModelSchema>;

export const analyticsFigureSchema = z.object({
  history_completeness: historyCompletenessSchema,
  window_start: dateOnlySchema,
  window_end: dateOnlySchema,
  time_zone: z.string().min(1),
});
export type AnalyticsFigure = z.infer<typeof analyticsFigureSchema>;
