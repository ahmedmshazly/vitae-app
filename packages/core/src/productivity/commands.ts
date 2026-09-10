/**
 * Versioned productivity commands. Schema only; handlers land in later tasks.
 */
import { z } from 'zod';
import { isoDateTime, sensitivitySchema } from '../schema/envelope.js';
import {
  commandEnvelopeSchema,
  dateOnlySchema,
  importanceSchema,
  quadrantSchema,
  recurrenceSchema,
  vitaePrioritySchema,
  vitaeTaskStatusSchema,
} from './contracts.js';

const provenanceSchema = z.object({
  /** Fourfold source status, stored only as provenance. Never inferred back. */
  source_status: z.string().min(1).max(64).optional(),
  source: z.string().min(1).max(64).optional(),
});

const taskFieldsSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: vitaeTaskStatusSchema.optional(),
  due: dateOnlySchema.optional(),
  target: dateOnlySchema.optional(),
  scheduled: dateOnlySchema.optional(),
  follow_up: dateOnlySchema.optional(),
  priority: vitaePrioritySchema.optional(),
  importance: importanceSchema.optional(),
  notes_md: z.string().optional(),
  sensitivity: sensitivitySchema.optional(),
  project_id: z.string().min(1).optional(),
  effort_min: z.number().int().positive().optional(),
  quadrant_override: quadrantSchema.optional(),
  provenance: provenanceSchema.optional(),
});

const createTaskPayload = taskFieldsSchema.extend({
  title: z.string().min(1).max(500),
});

const idPayload = z.object({ id: z.string().min(1) });

export const createTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('create_task'),
  payload: createTaskPayload,
});

export const updateTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('update_task'),
  payload: idPayload.extend({ patch: taskFieldsSchema }),
});

export const completeTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('complete_task'),
  payload: idPayload.extend({ completed_at: isoDateTime.optional() }),
});

export const dropTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('drop_task'),
  payload: idPayload,
});

export const restoreTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('restore_task'),
  payload: idPayload.extend({ status: vitaeTaskStatusSchema.optional() }),
});

export const reorderTasksCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('reorder_tasks'),
  payload: z.object({
    ordered_ids: z.array(z.string().min(1)).min(1),
    scope: z.string().min(1).optional(),
  }),
});

export const waitOnTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('wait_on_task'),
  payload: idPayload.extend({
    waiting_on_id: z.string().min(1),
    waiting_since: dateOnlySchema.optional(),
    waiting_patience_days: z.number().int().min(1).max(365).optional(),
  }),
});

export const followUpTaskCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('follow_up_task'),
  payload: idPayload.extend({ follow_up: dateOnlySchema }),
});

export const addTimeEntryCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('add_time_entry'),
  payload: z.object({
    item_id: z.string().min(1),
    started_at: isoDateTime,
    ended_at: isoDateTime.optional(),
    source: z.string().min(1).max(64).optional(),
  }),
});

export const setRecurrenceCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('set_recurrence'),
  payload: idPayload.extend({
    recurrence: recurrenceSchema.nullable(),
  }),
});

export const ruleActionSchema = z.object({
  field: z.string().min(1).max(120),
  value: z.unknown(),
});

export const upsertRuleCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('upsert_rule'),
  payload: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(200),
    statement: z.string().min(1).max(2_000),
    condition: z.record(z.string(), z.unknown()).default({}),
    actions: z.array(ruleActionSchema).default([]),
    enabled: z.boolean().default(true),
    sort_order: z.number().nullable().optional(),
  }),
});

export const upsertTemplateCommandSchema = commandEnvelopeSchema.extend({
  type: z.literal('upsert_template'),
  payload: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    kind: z.enum(['project', 'item']),
    body: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const productivityCommandSchema = z.discriminatedUnion('type', [
  createTaskCommandSchema,
  updateTaskCommandSchema,
  completeTaskCommandSchema,
  dropTaskCommandSchema,
  restoreTaskCommandSchema,
  reorderTasksCommandSchema,
  waitOnTaskCommandSchema,
  followUpTaskCommandSchema,
  addTimeEntryCommandSchema,
  setRecurrenceCommandSchema,
  upsertRuleCommandSchema,
  upsertTemplateCommandSchema,
]);

export type ProductivityCommand = z.infer<typeof productivityCommandSchema>;
export type CreateTaskCommand = z.infer<typeof createTaskCommandSchema>;
export type UpdateTaskCommand = z.infer<typeof updateTaskCommandSchema>;
