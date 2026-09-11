/**
 * Native `{ format: 'vitae.tasks', version: 1 }` and Fourfold's
 * `{ format: 'fourfold.transfer', version: 1 }` file dialect.
 * Anything else is unrecognized_format. This is a file parser, not a
 * database read.
 */

import { taskProjectKey, tasksJsonTaskKey } from '../identity.js';
import { parseCivilDate, parseInstantIso } from './date.js';
import { projectDraft, taskDraft } from './drafts.js';
import {
  isSensitiveFlag,
  isUnsupportedStatus,
  notesToText,
  parseEnergy,
  parseImportance,
  parseVitaePriority,
  parseVitaeStatus,
  recurrenceFromRule,
} from './fields.js';
import { skip } from './skip.js';
import type {
  ProjectFileDraft,
  StatedTaskProps,
  TaskFileDraft,
  TaskImportContext,
  TaskImportResult,
  TaskImportSkip,
} from './types.js';
import { emptyTaskImport } from './types.js';

export function parseTasksJson(input: string, ctx: TaskImportContext): TaskImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return emptyTaskImport([skip('record', '1', 'unparseable_json')]);
  }
  if (!isRecord(parsed)) return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);

  if (parsed.format === 'vitae.tasks' && parsed.version === 1) {
    return readVitae(parsed, ctx);
  }
  if (parsed.format === 'fourfold.transfer' && parsed.version === 1) {
    return readFourfold(parsed, ctx);
  }
  return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);
}

function readVitae(doc: Record<string, unknown>, ctx: TaskImportContext): TaskImportResult {
  if (!Array.isArray(doc.projects) || !Array.isArray(doc.tasks)) {
    return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);
  }
  const skipped: TaskImportSkip[] = [];
  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];

  for (const [index, project] of doc.projects.entries()) {
    if (!isRecord(project)) {
      skipped.push(skip('record', String(index + 1), 'unparseable_row'));
      continue;
    }
    const title = (asString(project.title) ?? asString(project.name) ?? '').trim();
    if (title === '') {
      skipped.push(skip('record', String(index + 1), 'missing_title'));
      continue;
    }
    const id = asString(project.id)?.trim() ?? '';
    projects.push(
      projectDraft({
        title,
        notes_md: asString(project.notes) ?? '',
        identity_key: taskProjectKey('tasks_json', id || null),
        ...(id !== '' ? { source_id: id } : {}),
        sensitivity: isSensitiveFlag(project.sensitive ?? project.private) ? 'sensitive' : 'normal',
      }),
    );
  }

  for (const [index, task] of doc.tasks.entries()) {
    if (!isRecord(task)) {
      skipped.push(skip('record', String(index + 1), 'unparseable_row'));
      continue;
    }
    const title = (asString(task.title) ?? '').trim();
    if (title === '') {
      skipped.push(skip('record', String(index + 1), 'missing_title'));
      continue;
    }
    const id = asString(task.id)?.trim() ?? '';
    const parent = asString(task.parent_id)?.trim() ?? '';
    const projectId = asString(task.project_id)?.trim() ?? '';
    const blocked = Array.isArray(task.blocked_by)
      ? task.blocked_by.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      : [];
    if (asString(task.assignee) || asString(task.assignee_email)) {
      skipped.push(skip('record', String(index + 1), 'assignee'));
    }
    const { props, extra } = vitaeTaskProps(task, ctx, String(index + 1));
    skipped.push(...extra);
    tasks.push(
      taskDraft({
        title,
        props,
        notes_md: asString(task.notes) ?? '',
        sensitivity: isSensitiveFlag(task.sensitive ?? task.private) ? 'sensitive' : 'normal',
        identity_key: tasksJsonTaskKey(id || null),
        ...(id !== '' ? { source_id: id } : {}),
        ...(parent !== '' ? { parent_source_id: parent } : {}),
        ...(projectId !== '' ? { project_source_id: projectId } : {}),
        ...(blocked.length > 0 ? { blocked_by_source_ids: blocked } : {}),
      }),
    );
  }

  return { projects, tasks, skipped };
}

function readFourfold(doc: Record<string, unknown>, ctx: TaskImportContext): TaskImportResult {
  if (!Array.isArray(doc.projects) || !Array.isArray(doc.items)) {
    return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);
  }
  const skipped: TaskImportSkip[] = [];
  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];

  for (const [index, project] of doc.projects.entries()) {
    if (!isRecord(project) || !isRecord(project.fields)) {
      skipped.push(skip('record', String(index + 1), 'unparseable_row'));
      continue;
    }
    const title = (asString(project.fields.name) ?? '').trim();
    if (title === '') {
      skipped.push(skip('record', String(index + 1), 'missing_title'));
      continue;
    }
    const id = asString(project.source_id)?.trim() ?? '';
    projects.push(
      projectDraft({
        title,
        notes_md: asString(project.fields.description) ?? '',
        identity_key: taskProjectKey('fourfold', id || null),
        ...(id !== '' ? { source_id: id } : {}),
        sensitivity: isSensitiveFlag(project.fields.private) ? 'sensitive' : 'normal',
      }),
    );
  }

  for (const [index, item] of doc.items.entries()) {
    if (!isRecord(item) || !isRecord(item.fields)) {
      skipped.push(skip('record', String(index + 1), 'missing_title'));
      continue;
    }
    const title = (asString(item.fields.title) ?? '').trim();
    if (title === '') {
      skipped.push(skip('record', String(index + 1), 'missing_title'));
      continue;
    }
    const id = asString(item.source_id)?.trim() ?? '';
    const { props, extra } = fourfoldItemProps(item.fields, ctx, String(index + 1));
    skipped.push(...extra);
    if (asString(item.fields.assignee) || asString(item.assignee)) {
      skipped.push(skip('record', String(index + 1), 'assignee'));
    }
    tasks.push(
      taskDraft({
        title,
        props,
        notes_md: notesToText(item.fields.notes),
        sensitivity: isSensitiveFlag(item.fields.private) ? 'sensitive' : 'normal',
        identity_key: tasksJsonTaskKey(id || null),
        ...(id !== '' ? { source_id: id } : {}),
        ...(asString(item.parent_source_id) ? { parent_source_id: asString(item.parent_source_id) } : {}),
        ...(asString(item.project_source_id) ? { project_source_id: asString(item.project_source_id) } : {}),
        ...(asString(item.project_name) ? { project_name: asString(item.project_name) } : {}),
      }),
    );
  }

  return { projects, tasks, skipped };
}

function vitaeTaskProps(
  task: Record<string, unknown>,
  ctx: TaskImportContext,
  at: string,
): { props: StatedTaskProps; extra: TaskImportSkip[] } {
  const extra: TaskImportSkip[] = [];
  const props: Record<string, unknown> = {};
  const statusRaw = asString(task.status) ?? '';
  if (isUnsupportedStatus(statusRaw)) extra.push(skip('record', at, 'unsupported_status', statusRaw));
  else {
    const status = parseVitaeStatus(statusRaw);
    if (status !== undefined) props.status = status;
  }
  const priority = parseVitaePriority(asString(task.priority) ?? '');
  if (priority !== undefined) props.priority = priority;
  const importance = parseImportance(asString(task.importance) ?? '');
  if (importance !== undefined) props.importance = importance;
  const energy = parseEnergy(asString(task.energy) ?? '');
  if (energy !== undefined) props.energy = energy;
  if (typeof task.effort_min === 'number' && Number.isInteger(task.effort_min) && task.effort_min >= 1) {
    props.effort_min = task.effort_min;
  }
  takeOptionalDate(props, 'due', task.due, ctx, at, extra);
  takeOptionalDate(props, 'target', task.target, ctx, at, extra);
  takeOptionalDate(props, 'scheduled', task.scheduled, ctx, at, extra);
  if (typeof task.completed_at === 'string') {
    const instant = parseInstantIso(task.completed_at);
    if (instant !== null) props.completed_at = instant;
  }
  if (isRecord(task.recurrence) && typeof task.recurrence.rrule === 'string') {
    const recurrence = recurrenceFromRule(task.recurrence.rrule);
    if (recurrence === null) extra.push(skip('record', at, 'unsupported_recurrence', task.recurrence.rrule));
    else {
      props.recurrence = {
        ...recurrence,
        mode: task.recurrence.mode === 'from_completion' ? 'from_completion' : 'fixed',
        exceptions: Array.isArray(task.recurrence.exceptions)
          ? task.recurrence.exceptions.filter((value): value is string => typeof value === 'string')
          : [],
      };
    }
  }
  return { props: props as StatedTaskProps, extra };
}

function fourfoldItemProps(
  fields: Record<string, unknown>,
  ctx: TaskImportContext,
  at: string,
): { props: StatedTaskProps; extra: TaskImportSkip[] } {
  const extra: TaskImportSkip[] = [];
  const props: Record<string, unknown> = {};
  const statusRaw = asString(fields.status) ?? '';
  if (isUnsupportedStatus(statusRaw)) extra.push(skip('record', at, 'unsupported_status', statusRaw));
  else {
    const status = parseVitaeStatus(statusRaw);
    if (status !== undefined) props.status = status;
  }
  const priority = parseVitaePriority(asString(fields.priority) ?? '');
  if (priority !== undefined) props.priority = priority;
  const importance = parseImportance(asString(fields.importance) ?? '');
  if (importance !== undefined) props.importance = importance;
  takeOptionalDate(props, 'due', fields.due_at ?? fields.due, ctx, at, extra);
  takeOptionalDate(props, 'target', fields.target_at ?? fields.scheduled_at, ctx, at, extra);
  takeOptionalDate(props, 'scheduled', fields.start_at, ctx, at, extra);
  if (typeof fields.completed_at === 'string') {
    const instant = parseInstantIso(fields.completed_at);
    if (instant !== null) props.completed_at = instant;
  }
  if (isRecord(fields.recurrence) && typeof fields.recurrence.rrule === 'string') {
    const recurrence = recurrenceFromRule(fields.recurrence.rrule);
    if (recurrence === null) extra.push(skip('record', at, 'unsupported_recurrence', fields.recurrence.rrule));
    else props.recurrence = recurrence;
  } else if (typeof fields.recurrence === 'string') {
    const recurrence = recurrenceFromRule(fields.recurrence);
    if (recurrence === null && fields.recurrence.trim() !== '') {
      extra.push(skip('record', at, 'unsupported_recurrence', fields.recurrence));
    } else if (recurrence !== null) props.recurrence = recurrence;
  }
  if (typeof fields.estimate_minutes === 'number') props.effort_min = fields.estimate_minutes;
  const energy = parseEnergy(asString(fields.energy) ?? '');
  if (energy !== undefined) props.energy = energy;
  return { props: props as StatedTaskProps, extra };
}

function takeOptionalDate(
  props: Record<string, unknown>,
  key: 'due' | 'target' | 'scheduled',
  raw: unknown,
  ctx: TaskImportContext,
  at: string,
  extra: TaskImportSkip[],
): void {
  if (typeof raw !== 'string' || raw.trim() === '') return;
  const day = parseCivilDate(raw, ctx);
  if (day === null) extra.push(skip('record', at, 'unparseable_date', raw.trim()));
  else props[key] = day;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
