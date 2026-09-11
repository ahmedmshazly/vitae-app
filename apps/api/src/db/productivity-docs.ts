/**
 * Document shapes for the productivity collections. Persistence lives in the
 * repository; these schemas are the write-boundary so `data jsonb` cannot
 * drift from the fields the generated columns index.
 */
import { z } from 'zod';
import {
  isoDateTime,
  ruleActionSchema,
  storedRuleConditionSchema,
} from '@vitae/core';

export const timeEntryWriteSchema = z.object({
  id: z.string().min(1).optional(),
  task_id: z.string().min(1),
  started_at: isoDateTime,
  ended_at: isoDateTime.optional(),
  duration_sec: z.number().int().nonnegative().optional(),
  note: z.string().max(10_000).optional(),
  sensitive: z.boolean().optional(),
});
export type TimeEntryWrite = z.infer<typeof timeEntryWriteSchema>;

export const timeEntryRecordSchema = timeEntryWriteSchema.extend({
  id: z.string().min(1),
  rev: z.number().int().positive(),
  updated_at: isoDateTime,
  deleted_at: isoDateTime.nullable().optional(),
});
export type TimeEntryRecord = z.infer<typeof timeEntryRecordSchema>;

export const timeEntryPatchSchema = timeEntryWriteSchema
  .omit({ id: true })
  .extend({ deleted_at: isoDateTime.nullable().optional() })
  .partial();
export type TimeEntryPatch = z.infer<typeof timeEntryPatchSchema>;

export const automationRuleWriteSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  enabled: z.boolean(),
  condition: storedRuleConditionSchema,
  actions: z.array(ruleActionSchema),
  sensitive: z.boolean().optional(),
});
export type AutomationRuleWrite = z.infer<typeof automationRuleWriteSchema>;

export const automationRuleRecordSchema = automationRuleWriteSchema.extend({
  id: z.string().min(1),
  rev: z.number().int().positive(),
  updated_at: isoDateTime,
  deleted_at: isoDateTime.nullable().optional(),
});
export type AutomationRuleRecord = z.infer<typeof automationRuleRecordSchema>;

export const automationRulePatchSchema = automationRuleWriteSchema
  .omit({ id: true })
  .extend({ deleted_at: isoDateTime.nullable().optional() })
  .partial();
export type AutomationRulePatch = z.infer<typeof automationRulePatchSchema>;

export const productivityReceiptWriteSchema = z.object({
  id: z.string().min(1).optional(),
  operation_id: z.string().min(1),
  command_type: z.string().min(1).max(120),
  request_hash: z.string().min(1).max(128).optional(),
  result: z.unknown().optional(),
});
export type ProductivityReceiptWrite = z.infer<typeof productivityReceiptWriteSchema>;

export const productivityReceiptRecordSchema = productivityReceiptWriteSchema.extend({
  id: z.string().min(1),
  rev: z.number().int().positive(),
  created_at: isoDateTime,
  result: z.unknown(),
});
export type ProductivityReceiptRecord = z.infer<typeof productivityReceiptRecordSchema>;

export const REVISION_GUARDED_TABLES = [
  'time_entries',
  'automation_rules',
  'productivity_receipts',
] as const;

export type RevisionGuardedTable = (typeof REVISION_GUARDED_TABLES)[number];

export function isRevisionGuardedTable(table: string): table is RevisionGuardedTable {
  return (REVISION_GUARDED_TABLES as readonly string[]).includes(table);
}

export function zodIssues(
  issues: z.ZodIssue[],
): Array<{ path: string; message: string }> {
  return issues.map((issue) => ({ path: issue.path.join('.') || '(root)', message: issue.message }));
}
