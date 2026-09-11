/**
 * Productivity command envelopes. Each write gets a fresh operation_id.
 * Undo is a compensating command; `useProductivityCommand.undo` stamps
 * `expected_revision` from the last canonical result.
 */
import { parseTaskCapture, type ProductivityCommand, type Recurrence, type VitaeTaskStatus } from '@vitae/core';

export function newOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function envelope(expected_revision?: number): { version: 1; operation_id: string; expected_revision?: number } {
  return {
    version: 1,
    operation_id: newOperationId(),
    ...(expected_revision === undefined ? {} : { expected_revision }),
  };
}

export function completeTaskCommand(id: string, expected_revision: number): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'complete_task', payload: { id } };
}

export function dropTaskCommand(id: string, expected_revision: number): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'drop_task', payload: { id } };
}

export function restoreTaskCommand(
  id: string,
  status?: VitaeTaskStatus,
  expected_revision?: number,
  clear_waiting?: boolean,
): ProductivityCommand {
  return {
    ...envelope(expected_revision),
    type: 'restore_task',
    payload: {
      id,
      ...(status ? { status } : {}),
      ...(clear_waiting ? { clear_waiting: true } : {}),
    },
  };
}

export function waitOnTaskCommand(
  id: string,
  waiting_on_id: string,
  expected_revision: number,
): ProductivityCommand {
  return {
    ...envelope(expected_revision),
    type: 'wait_on_task',
    payload: { id, waiting_on_id },
  };
}

export function followUpTaskCommand(
  id: string,
  follow_up: string,
  expected_revision: number,
): ProductivityCommand {
  return {
    ...envelope(expected_revision),
    type: 'follow_up_task',
    payload: { id, follow_up },
  };
}

export function createTaskCommand(payload: Extract<ProductivityCommand, { type: 'create_task' }>['payload']): ProductivityCommand {
  return { ...envelope(), type: 'create_task', payload };
}

export function updateTaskCommand(
  id: string,
  patch: Extract<ProductivityCommand, { type: 'update_task' }>['payload']['patch'],
  expected_revision: number,
): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'update_task', payload: { id, patch } };
}

export function setRecurrenceCommand(
  id: string,
  recurrence: Recurrence | null,
  expected_revision: number,
): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'set_recurrence', payload: { id, recurrence } };
}

export function addTimeEntryCommand(
  item_id: string,
  started_at: string,
  ended_at?: string,
): ProductivityCommand {
  return {
    ...envelope(),
    type: 'add_time_entry',
    payload: ended_at ? { item_id, started_at, ended_at, source: 'timer' } : { item_id, started_at, source: 'timer' },
  };
}

export function updateTimeEntryCommand(id: string, ended_at: string): ProductivityCommand {
  return {
    ...envelope(),
    type: 'update_time_entry',
    payload: { id, ended_at },
  };
}

export function upsertRuleCommand(
  payload: Extract<ProductivityCommand, { type: 'upsert_rule' }>['payload'],
  expected_revision?: number,
): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'upsert_rule', payload };
}

export function upsertTemplateCommand(
  payload: Extract<ProductivityCommand, { type: 'upsert_template' }>['payload'],
  expected_revision?: number,
): ProductivityCommand {
  return { ...envelope(expected_revision), type: 'upsert_template', payload };
}

export function captureToCreateCommand(text: string, now: Date = new Date()): ProductivityCommand | null {
  const parsed = parseTaskCapture(text, { now });
  const title = parsed.title || text.trim();
  if (!title) return null;
  return createTaskCommand({
    title,
    due: parsed.fields.due,
    target: parsed.fields.target,
    priority: parsed.fields.priority,
    importance: parsed.fields.importance,
    effort_min: parsed.fields.effort_min,
    quadrant_override: parsed.fields.quadrant_override,
  });
}

export function captureRecurrence(text: string, now: Date = new Date()): Recurrence | null {
  const parsed = parseTaskCapture(text, { now });
  if (!parsed.fields.recurrence_rrule) return null;
  return { rrule: parsed.fields.recurrence_rrule, mode: 'fixed', exceptions: [] };
}

export function templateToCreateCommand(
  body: Record<string, unknown>,
  fallbackTitle: string,
): ProductivityCommand | null {
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : fallbackTitle.trim();
  if (!title) return null;
  const status =
    body.status === 'inbox' ||
    body.status === 'next' ||
    body.status === 'doing' ||
    body.status === 'waiting' ||
    body.status === 'done' ||
    body.status === 'dropped'
      ? body.status
      : undefined;
  const priority =
    body.priority === 'p1' || body.priority === 'p2' || body.priority === 'p3' || body.priority === 'p4'
      ? body.priority
      : undefined;
  const importance =
    body.importance === 'none' || body.importance === 'important' || body.importance === 'critical'
      ? body.importance
      : undefined;
  return createTaskCommand({
    title,
    status,
    due: typeof body.due === 'string' ? body.due : undefined,
    target: typeof body.target === 'string' ? body.target : undefined,
    priority,
    importance,
    follow_up: typeof body.follow_up === 'string' ? body.follow_up : undefined,
    project_id: typeof body.project_id === 'string' ? body.project_id : undefined,
  });
}
