/**
 * TickTick CSV backup. Metadata rows sit above the table; the task table
 * starts at Folder Name / List Name / Title. Priority 5 is p1. Status 0
 * open, 1 done, 2 archived.
 */

import { ticktickTaskKey } from '../identity.js';
import { cell, hasHeaders, readCsv, sliceFromHeaderRow } from './csv-table.js';
import { parseCivilDate, parseInstantIso } from './date.js';
import { addNamedProject, taskDraft } from './drafts.js';
import { appendNote, parseVitaePriority, recurrenceFromRule } from './fields.js';
import { skip } from './skip.js';
import type { ProjectFileDraft, StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

const TICKTICK_HEADERS = ['Folder Name', 'List Name', 'Title'] as const;

const TICKTICK_PRIORITY: Readonly<Record<string, string>> = {
  '1': 'p3',
  '3': 'p2',
  '5': 'p1',
};

export function parseTickTick(input: string, ctx: TaskImportContext): TaskImportResult {
  const sliced = sliceFromHeaderRow(input, TICKTICK_HEADERS);
  if (sliced === null) return emptyTaskImport([skip('line', '1', 'unrecognized_format')]);

  const table = readCsv(sliced);
  if (!table.ok) {
    return emptyTaskImport([skip('line', String(table.line), 'malformed_csv', table.token)]);
  }
  if (!hasHeaders(table.headers, TICKTICK_HEADERS)) {
    return emptyTaskImport([skip('line', '1', 'unrecognized_format')]);
  }

  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const row of table.rows) {
    const title = cell(row.fields, 'Title').trim();
    if (title === '') {
      skipped.push(skip('line', String(row.line), 'missing_title'));
      continue;
    }

    const list = cell(row.fields, 'List Name').trim();
    if (list !== '') addNamedProject(projects, list);

    const sourceId = cell(row.fields, 'taskId').trim();
    const parentId = cell(row.fields, 'parentId').trim();
    const kind = cell(row.fields, 'Kind').trim().toUpperCase();
    if (kind === 'NOTE') skipped.push(skip('line', String(row.line), 'unsupported_type', 'NOTE'));

    tasks.push(
      taskDraft({
        title,
        props: ticktickProps(row.fields, ctx, skipped, String(row.line)),
        notes_md: ticktickNotes(row.fields),
        identity_key: ticktickTaskKey(sourceId || null),
        ...(sourceId !== '' ? { source_id: sourceId } : {}),
        ...(parentId !== '' ? { parent_source_id: parentId } : {}),
        ...(list !== '' ? { project_name: list } : {}),
      }),
    );
  }

  return { projects, tasks, skipped };
}

function ticktickNotes(row: Readonly<Record<string, string>>): string {
  return appendNote(cell(row, 'Content'), cell(row, 'Tags').trim());
}

function ticktickProps(
  row: Readonly<Record<string, string>>,
  ctx: TaskImportContext,
  skipped: TaskImportSkip[],
  at: string,
): StatedTaskProps {
  const props: Record<string, unknown> = {};
  const priority = parseVitaePriority(TICKTICK_PRIORITY[cell(row, 'Priority').trim()] ?? '');
  if (priority !== undefined) props.priority = priority;

  const status = cell(row, 'Status').trim();
  const completedRaw = cell(row, 'Completed Time').trim();
  const completed = completedRaw === '' ? null : parseInstantIso(completedRaw);

  if (status === '2') {
    props.status = 'dropped';
    if (completed !== null) props.completed_at = completed;
  } else if (status === '1' || completed !== null) {
    props.status = 'done';
    if (completed !== null) props.completed_at = completed;
  }

  const due = cell(row, 'Due Date').trim();
  if (due !== '') {
    const day = parseCivilDate(due, ctx);
    if (day === null) skipped.push(skip('line', at, 'unparseable_date', due));
    else props.due = day;
  }

  const start = cell(row, 'Start Date').trim();
  if (start !== '') {
    const day = parseCivilDate(start, ctx);
    if (day === null) skipped.push(skip('line', at, 'unparseable_date', start));
    else props.scheduled = day;
  }

  const repeat = cell(row, 'Repeat').trim();
  if (repeat !== '') {
    const recurrence = recurrenceFromRule(repeat);
    if (recurrence === null) skipped.push(skip('line', at, 'unsupported_recurrence', repeat));
    else props.recurrence = recurrence;
  }

  return props as StatedTaskProps;
}
