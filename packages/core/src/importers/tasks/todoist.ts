/**
 * Todoist project CSV (TYPE + CONTENT). PRIORITY 1 is p1. DEADLINE is the
 * hard date; DATE is recurrence or a soft scheduled day. INDENT builds
 * parent_source_id. A `note` row attaches to the task above; a `section`
 * is skipped. Line numbers are not identities.
 */

import { todoistTaskKey } from '../identity.js';
import { cell, hasHeaders, readCsv } from './csv-table.js';
import { parseCivilDate } from './date.js';
import { taskDraft } from './drafts.js';
import { appendNote, parseCount, parseVitaePriority, recurrenceFromPhrase } from './fields.js';
import { skip } from './skip.js';
import type { StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

const TODOIST_HEADERS = ['TYPE', 'CONTENT'] as const;

const TODOIST_PRIORITY: Readonly<Record<string, string>> = {
  '1': 'p1',
  '2': 'p2',
  '3': 'p3',
  '4': 'p4',
};

export function parseTodoist(input: string, ctx: TaskImportContext): TaskImportResult {
  const table = readCsv(input);
  if (!table.ok) {
    return emptyTaskImport([skip('line', String(table.line), 'malformed_csv', table.token)]);
  }
  if (!hasHeaders(table.headers, TODOIST_HEADERS)) {
    return emptyTaskImport([skip('line', '1', 'unrecognized_format')]);
  }

  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];
  const stack: { indent: number; source_id: string }[] = [];

  for (const row of table.rows) {
    const type = cell(row.fields, 'TYPE').trim();
    const content = cell(row.fields, 'CONTENT');
    const at = String(row.line);

    if (type === 'section') {
      const token = content.trim();
      skipped.push(token === '' ? skip('line', at, 'section') : skip('line', at, 'section', token));
      continue;
    }

    if (type === 'note') {
      const last = tasks[tasks.length - 1];
      if (last === undefined) {
        const token = content.trim();
        skipped.push(
          token === ''
            ? skip('line', at, 'note_without_task')
            : skip('line', at, 'note_without_task', token),
        );
        continue;
      }
      tasks[tasks.length - 1] = {
        ...last,
        notes_md: appendNote(last.notes_md, content),
      };
      continue;
    }

    if (type !== 'task') {
      if (type !== '') skipped.push(skip('line', at, 'unknown_type', type));
      continue;
    }

    const title = content.trim();
    if (title === '') {
      skipped.push(skip('line', at, 'missing_title'));
      continue;
    }

    const statedId = cell(row.fields, 'TASK_ID').trim() || cell(row.fields, 'ID').trim();
    const sourceId = statedId !== '' ? statedId : `todoist-line:${at}`;
    const indent = Number(cell(row.fields, 'INDENT').trim() || '1');
    const depth = Number.isFinite(indent) ? indent : 1;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top === undefined || top.indent < depth) break;
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    stack.push({ indent: depth, source_id: sourceId });

    const assignee = cell(row.fields, 'RESPONSIBLE').trim();
    if (assignee !== '') skipped.push(skip('line', at, 'assignee', assignee));

    tasks.push(
      taskDraft({
        title,
        props: todoistProps(row.fields, ctx, skipped, at),
        notes_md: cell(row.fields, 'DESCRIPTION').trim(),
        identity_key: todoistTaskKey(statedId || null),
        source_id: sourceId,
        ...(parent === undefined ? {} : { parent_source_id: parent.source_id }),
      }),
    );
  }

  return { tasks, projects: [], skipped };
}



function todoistProps(
  row: Readonly<Record<string, string>>,
  ctx: TaskImportContext,
  skipped: TaskImportSkip[],
  at: string,
): StatedTaskProps {
  const props: StatedTaskProps = {};
  const priority = parseVitaePriority(TODOIST_PRIORITY[cell(row, 'PRIORITY').trim()] ?? '');
  const next = { ...props, ...(priority !== undefined ? { priority } : {}) };

  const duration = parseCount(cell(row, 'DURATION'));
  const unit = cell(row, 'DURATION_UNIT').trim().toLowerCase();
  const withEffort =
    duration !== undefined && (unit === 'minute' || unit === 'minutes')
      ? { ...next, effort_min: duration }
      : next;

  let due: string | undefined;
  let target: string | undefined;
  let recurrence = withEffort.recurrence;

  const deadline = cell(row, 'DEADLINE').trim();
  if (deadline !== '') {
    const day = parseCivilDate(deadline, ctx);
    if (day === null) skipped.push(skip('line', at, 'unparseable_date', deadline));
    else due = day;
  }

  const date = cell(row, 'DATE').trim();
  if (date !== '') {
    const rule = recurrenceFromPhrase(date, ctx);
    if (rule !== null) {
      recurrence = rule;
    } else {
      const day = parseCivilDate(date, ctx);
      if (day === null) skipped.push(skip('line', at, 'unparseable_date', date));
      else target = day;
    }
  }

  return {
    ...withEffort,
    ...(due !== undefined ? { due } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(recurrence !== undefined ? { recurrence } : {}),
  };
}
