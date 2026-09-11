/**
 * Trello board JSON. The board is the project; lists stay on notes.
 * Checklist items become children. `closed` is archived → dropped.
 */

import { taskProjectKey, trelloCardKey } from '../identity.js';
import { parseCivilDate } from './date.js';
import { projectDraft, taskDraft } from './drafts.js';
import { appendNote } from './fields.js';
import { skip } from './skip.js';
import type { ProjectFileDraft, StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

export function parseTrello(input: string, ctx: TaskImportContext): TaskImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return emptyTaskImport([skip('record', '1', 'unparseable_json')]);
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.cards)) {
    return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);
  }

  const boardId = asString(parsed.id) ?? 'board';
  const boardName = asString(parsed.name)?.trim() ?? boardId;
  const projects: ProjectFileDraft[] = [
    projectDraft({
      title: boardName,
      source_id: boardId,
      identity_key: taskProjectKey('trello', boardId),
    }),
  ];

  const lists = new Map<string, string>();
  for (const entry of asArray(parsed.lists)) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    const name = asString(entry.name);
    if (id !== undefined && name !== undefined) lists.set(id, name);
  }

  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const entry of asArray(parsed.cards)) {
    if (!isRecord(entry)) {
      skipped.push(skip('record', 'card', 'unparseable_row'));
      continue;
    }
    const id = asString(entry.id) ?? 'card';
    const name = asString(entry.name)?.trim() ?? '';
    if (name === '') {
      skipped.push(skip('source_id', id, 'missing_title'));
      continue;
    }
    const listName = lists.get(asString(entry.idList) ?? '');
    const members = asArray(entry.idMembers);
    if (members.length > 0) skipped.push(skip('source_id', id, 'assignee'));

    tasks.push(
      taskDraft({
        title: name,
        props: cardProps(entry, listName, ctx, skipped, id),
        notes_md: cardNotes(entry, listName),
        identity_key: trelloCardKey(id),
        source_id: id,
        project_source_id: boardId,
        project_name: boardName,
      }),
    );
  }

  for (const entry of asArray(parsed.checklists)) {
    if (!isRecord(entry)) continue;
    const cardId = asString(entry.idCard);
    for (const check of asArray(entry.checkItems)) {
      if (!isRecord(check)) continue;
      const checkId = asString(check.id) ?? `check:${String(tasks.length)}`;
      const title = asString(check.name)?.trim() ?? '';
      if (title === '') {
        skipped.push(skip('source_id', checkId, 'missing_title'));
        continue;
      }
      const props: StatedTaskProps = asString(check.state) === 'complete' ? { status: 'done' } : {};
      tasks.push(
        taskDraft({
          title,
          props,
          identity_key: trelloCardKey(checkId),
          source_id: checkId,
          ...(cardId === undefined ? {} : { parent_source_id: cardId }),
          project_source_id: boardId,
          project_name: boardName,
        }),
      );
    }
  }

  return { projects, tasks, skipped };
}

function cardNotes(card: Record<string, unknown>, listName: string | undefined): string {
  return appendNote(asString(card.desc) ?? '', listName ?? '');
}

function cardProps(
  card: Record<string, unknown>,
  _listName: string | undefined,
  ctx: TaskImportContext,
  skipped: TaskImportSkip[],
  at: string,
): StatedTaskProps {
  const props: Record<string, unknown> = {};
  if (card.closed === true) props.status = 'dropped';
  const due = asString(card.due);
  if (due !== undefined && due !== '') {
    const day = parseCivilDate(due, ctx);
    if (day === null) skipped.push(skip('source_id', at, 'unparseable_date', due));
    else props.due = day;
  }
  return props as StatedTaskProps;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
