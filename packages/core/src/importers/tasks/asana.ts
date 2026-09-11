/**
 * Asana project CSV. Parent Task is a name resolved to Task ID after the
 * file is read. Assignees are skipped (no invented people). Extra project
 * names and custom columns stay in notes.
 */

import { asanaTaskKey } from '../identity.js';
import { cell, hasHeaders, readCsv } from './csv-table.js';
import { parseCivilDate, parseInstantIso } from './date.js';
import { addNamedProject, resolveParentNames, taskDraft } from './drafts.js';
import { appendNote } from './fields.js';
import { skip } from './skip.js';
import type { ProjectFileDraft, StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

const ASANA_HEADERS = ['Name', 'Task ID'] as const;

const KNOWN = new Set(
  [
    'task id',
    'created at',
    'completed at',
    'last modified',
    'name',
    'section/column',
    'assignee',
    'assignee email',
    'start date',
    'due date',
    'tags',
    'notes',
    'projects',
    'parent task',
    'blocked by (dependencies)',
    'blocking (dependencies)',
  ].map((name) => name),
);

export function parseAsana(input: string, ctx: TaskImportContext): TaskImportResult {
  const table = readCsv(input);
  if (!table.ok) {
    return emptyTaskImport([skip('line', String(table.line), 'malformed_csv', table.token)]);
  }
  if (!hasHeaders(table.headers, ASANA_HEADERS)) {
    return emptyTaskImport([skip('line', '1', 'unrecognized_format')]);
  }

  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const row of table.rows) {
    const title = cell(row.fields, 'Name').trim();
    if (title === '') {
      skipped.push(skip('line', String(row.line), 'missing_title'));
      continue;
    }

    const names = splitNames(cell(row.fields, 'Projects'));
    const first = names[0];
    for (const name of names) addNamedProject(projects, name);

    const extras: string[] = [];
    if (names.length > 1) extras.push(...names.slice(1));
    const tags = cell(row.fields, 'Tags').trim();
    if (tags !== '') extras.push(tags);
    for (const [header, value] of Object.entries(row.fields)) {
      if (value.trim() === '') continue;
      if (KNOWN.has(header.toLowerCase())) continue;
      extras.push(value.trim());
    }

    const assignee = cell(row.fields, 'Assignee').trim();
    if (assignee !== '') skipped.push(skip('line', String(row.line), 'assignee', assignee));

    const sourceId = cell(row.fields, 'Task ID').trim();
    const parent = cell(row.fields, 'Parent Task').trim();
    const blocked = splitNames(cell(row.fields, 'Blocked By (Dependencies)'));

    let notes = cell(row.fields, 'Notes');
    for (const extra of extras) notes = appendNote(notes, extra);

    tasks.push(
      taskDraft({
        title,
        props: asanaProps(row.fields, ctx, skipped, String(row.line)),
        notes_md: notes,
        identity_key: asanaTaskKey(sourceId || null),
        ...(sourceId !== '' ? { source_id: sourceId } : {}),
        ...(parent !== '' ? { parent_source_id: parent } : {}),
        ...(first === undefined ? {} : { project_name: first }),
        ...(blocked.length > 0 ? { blocked_by_source_ids: blocked } : {}),
      }),
    );
  }

  return { projects, tasks: resolveParentNames(tasks), skipped };
}

function asanaProps(
  row: Readonly<Record<string, string>>,
  ctx: TaskImportContext,
  skipped: TaskImportSkip[],
  at: string,
): StatedTaskProps {
  const props: Record<string, unknown> = {};
  const completed = cell(row, 'Completed At').trim();
  if (completed !== '') {
    const instant = parseInstantIso(completed);
    if (instant !== null) {
      props.status = 'done';
      props.completed_at = instant;
    }
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
  return props as StatedTaskProps;
}

function splitNames(raw: string): string[] {
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}
