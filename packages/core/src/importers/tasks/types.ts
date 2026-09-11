/**
 * Vitae drafts produced by the task-file parsers.
 *
 * Parsers never invent an identity, a status, an importance, or a recurrence
 * the source did not state. A row without a durable source id stays a create.
 */

import type { Recurrence, VitaePriority, VitaeTaskStatus } from '../../productivity/contracts.js';
import type { EnergyLevel, Importance } from '../../productivity/contracts.js';

export const TASK_IMPORT_SKIP_REASONS = [
  'empty',
  'missing_title',
  'missing_title_column',
  'unrecognized_format',
  'unparseable_row',
  'unparseable_date',
  'unparseable_json',
  'unknown_type',
  'malformed_csv',
  'section',
  'heading',
  'note_without_task',
  'sqlite_export',
  'assignee',
  'unsupported_field',
  'unsupported_status',
  'unsupported_recurrence',
  'unsupported_type',
] as const;

export type TaskImportSkipReason = (typeof TASK_IMPORT_SKIP_REASONS)[number];

export const FATAL_TASK_IMPORT_REASONS: ReadonlySet<TaskImportSkipReason> = new Set([
  'unrecognized_format',
  'unparseable_json',
  'malformed_csv',
  'missing_title_column',
  'sqlite_export',
]);

export interface TaskImportSkip {
  readonly at: { readonly kind: 'line' | 'record' | 'source_id'; readonly value: string };
  readonly reason: TaskImportSkipReason;
  readonly token?: string;
}

export interface TaskImportContext {
  readonly now: Date;
  readonly timezone: string;
  readonly weekStartsOn: 0 | 1;
}

export const DEFAULT_TASK_IMPORT_CONTEXT: TaskImportContext = {
  now: new Date('2026-09-04T15:00:00.000Z'),
  timezone: 'UTC',
  weekStartsOn: 1,
};

/** Stated task fields only. `status` is omitted when the file is silent. */
export interface StatedTaskProps {
  readonly status?: VitaeTaskStatus;
  readonly due?: string;
  readonly target?: string;
  readonly scheduled?: string;
  readonly priority?: VitaePriority;
  readonly importance?: Importance;
  readonly recurrence?: Recurrence;
  readonly energy?: EnergyLevel;
  readonly effort_min?: number;
  readonly completed_at?: string;
}

export interface TaskFileDraft {
  readonly type: 'task';
  readonly title: string;
  readonly props: StatedTaskProps;
  readonly notes_md: string;
  readonly sensitivity: 'normal' | 'sensitive';
  readonly identity_key: string | null;
  readonly source_id?: string;
  readonly parent_source_id?: string;
  readonly project_source_id?: string;
  readonly project_name?: string;
  readonly blocked_by_source_ids?: readonly string[];
}

export interface ProjectFileDraft {
  readonly type: 'project';
  readonly title: string;
  readonly props: { readonly status?: 'active' | 'paused' | 'done' | 'archived' };
  readonly notes_md: string;
  readonly sensitivity: 'normal' | 'sensitive';
  readonly identity_key: string | null;
  readonly source_id?: string;
}

export interface TaskImportResult {
  readonly tasks: readonly TaskFileDraft[];
  readonly projects: readonly ProjectFileDraft[];
  readonly skipped: readonly TaskImportSkip[];
}

export function emptyTaskImport(skipped: readonly TaskImportSkip[] = []): TaskImportResult {
  return { tasks: [], projects: [], skipped };
}

export function isFatalTaskImport(result: TaskImportResult): boolean {
  if (result.tasks.length > 0 || result.projects.length > 0) return false;
  return result.skipped.some((row) => FATAL_TASK_IMPORT_REASONS.has(row.reason));
}

export function fatalTaskImportReason(result: TaskImportResult): TaskImportSkipReason | null {
  if (!isFatalTaskImport(result)) return null;
  return result.skipped.find((row) => FATAL_TASK_IMPORT_REASONS.has(row.reason))?.reason ?? null;
}
