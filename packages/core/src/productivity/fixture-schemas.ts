/**
 * Zod row schemas for Fourfold-adapted fixture tables. Task 3 executes the
 * rows; this task only proves they are well-formed.
 */
import { z } from 'zod';
import {
  dateOnlySchema,
  historyCompletenessSchema,
  importanceSchema,
  quadrantSchema,
  reasonKeySchema,
  recurrenceModeSchema,
  vitaePrioritySchema,
  vitaeTaskStatusSchema,
} from './contracts.js';

const optionalDate = dateOnlySchema.nullable().optional();

export const placementCaseSchema = z.object({
  id: z.string().min(1),
  now: dateOnlySchema,
  urgency_window_days: z.number().int().positive(),
  waiting_patience_days: z.number().int().positive().optional(),
  waiting_on_name: z.string().optional(),
  input: z.object({
    due: optionalDate,
    target: optionalDate,
    follow_up: optionalDate,
    scheduled: optionalDate,
    importance: importanceSchema.optional(),
    status: vitaeTaskStatusSchema.optional(),
    waiting_on: z.string().nullable().optional(),
    waiting_since: optionalDate,
    waiting_patience_days: z.number().int().positive().nullable().optional(),
    quadrant_override: z
      .object({
        quadrant: quadrantSchema,
        set_at: dateOnlySchema,
      })
      .nullable()
      .optional(),
  }),
  expected: z.object({
    quadrant: quadrantSchema,
    reason: reasonKeySchema,
  }),
});
export type PlacementCase = z.infer<typeof placementCaseSchema>;

export const captureCaseSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    text: z.string(),
    now: z.string().min(1),
  }),
  expected: z.object({
    title: z.string(),
    fields: z.record(z.string(), z.unknown()),
  }),
});
export type CaptureCase = z.infer<typeof captureCaseSchema>;

export const recurrenceCaseSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    rrule: z.string().min(1),
    mode: recurrenceModeSchema,
    from: dateOnlySchema,
    count: z.number().int().positive(),
    exceptions: z.array(dateOnlySchema).default([]),
  }),
  expected: z.object({
    dates: z.array(dateOnlySchema),
  }),
});
export type RecurrenceCase = z.infer<typeof recurrenceCaseSchema>;

export const rulesCaseSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    rule: z.object({
      enabled: z.boolean(),
      condition: z.record(z.string(), z.unknown()),
      actions: z.array(
        z.object({
          field: z.string().min(1),
          value: z.unknown(),
        }),
      ),
    }),
    item: z.object({
      status: vitaeTaskStatusSchema.optional(),
      due: optionalDate,
      priority: vitaePrioritySchema.nullable().optional(),
    }),
  }),
  expected: z.object({
    matches: z.boolean(),
    patch: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type RulesCase = z.infer<typeof rulesCaseSchema>;

export const analyticsCaseSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    window_start: dateOnlySchema,
    window_end: dateOnlySchema,
    time_zone: z.string().min(1),
    history_completeness: historyCompletenessSchema,
    completions: z.number().int().nonnegative(),
  }),
  expected: z.object({
    completions: z.number().int().nonnegative(),
    history_completeness: historyCompletenessSchema,
  }),
});
export type AnalyticsCase = z.infer<typeof analyticsCaseSchema>;

export const placementCasesSchema = z.array(placementCaseSchema).min(8);
export const captureCasesSchema = z.array(captureCaseSchema).min(3);
export const recurrenceCasesSchema = z.array(recurrenceCaseSchema).min(3);
export const rulesCasesSchema = z.array(rulesCaseSchema).min(3);
export const analyticsCasesSchema = z.array(analyticsCaseSchema).min(3);
