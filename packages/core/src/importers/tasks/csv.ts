/**
 * Generic task CSV. Without a map, a `title` header is treated as our own
 * export (including `kind=project` rows). Any other header set is
 * missing_title_column rather than a guessed title.
 */

import { cell, hasHeaders, readCsv } from './csv-table.js';
import { projectDraft } from './drafts.js';
import { itemFromMappedRow, TRANSFER_CSV_COLUMNS, type CsvColumnMap } from './mapped-row.js';
import { skip } from './skip.js';
import { taskProjectKey } from '../identity.js';
import type { ProjectFileDraft, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

export function parseTasksCsv(
  input: string,
  ctx: TaskImportContext,
  columns?: CsvColumnMap,
): TaskImportResult {
  const table = readCsv(input);
  if (!table.ok) {
    return emptyTaskImport([skip('line', String(table.line), 'malformed_csv', table.token)]);
  }

  if (columns !== undefined) {
    if (columns.title === undefined || !hasHeaders(table.headers, [columns.title])) {
      return emptyTaskImport([skip('line', '1', 'missing_title_column')]);
    }
    return readItems(table.rows, columns, ctx);
  }

  if (!hasHeaders(table.headers, ['title'])) {
    return emptyTaskImport([skip('line', '1', 'missing_title_column')]);
  }
  return readOurs(table.rows, ctx);
}

function readItems(
  rows: readonly { line: number; fields: Readonly<Record<string, string>> }[],
  map: CsvColumnMap,
  ctx: TaskImportContext,
): TaskImportResult {
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];
  for (const row of rows) {
    const mapped = itemFromMappedRow(row.fields, map, ctx, row.line, 'csv');
    if (mapped.item !== undefined) tasks.push(mapped.item);
    skipped.push(...mapped.skipped);
  }
  return { projects: [], tasks, skipped };
}

function readOurs(
  rows: readonly { line: number; fields: Readonly<Record<string, string>> }[],
  ctx: TaskImportContext,
): TaskImportResult {
  const tasks: TaskFileDraft[] = [];
  const projects: ProjectFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const row of rows) {
    const kind = cell(row.fields, 'kind').trim().toLowerCase();
    if (kind === 'project') {
      const name = cell(row.fields, 'title').trim();
      if (name === '') {
        skipped.push(skip('line', String(row.line), 'missing_title'));
        continue;
      }
      const sourceId = cell(row.fields, 'source_id').trim();
      projects.push(
        projectDraft({
          title: name,
          notes_md: cell(row.fields, 'notes').trim(),
          identity_key: taskProjectKey('tasks_csv', sourceId || null),
          ...(sourceId !== '' ? { source_id: sourceId } : {}),
        }),
      );
      continue;
    }

    const mapped = itemFromMappedRow(row.fields, TRANSFER_CSV_COLUMNS, ctx, row.line, 'csv');
    if (mapped.item !== undefined) tasks.push(mapped.item);
    skipped.push(...mapped.skipped);
  }

  return { projects, tasks, skipped };
}
