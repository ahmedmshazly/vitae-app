/**
 * Notion database CSV. Headers are property names. Title defaults to Name
 * or Title. A markdown page is unrecognized_format.
 */

import { headerAlias, readCsv } from './csv-table.js';
import { addNamedProject } from './drafts.js';
import { itemFromMappedRow, type CsvColumnMap, TRANSFER_CSV_COLUMNS } from './mapped-row.js';
import { skip } from './skip.js';
import type { ProjectFileDraft, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';
import { emptyTaskImport } from './types.js';

export function parseNotion(input: string, ctx: TaskImportContext): TaskImportResult {
  if (!looksLikeCsv(input)) return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);

  const table = readCsv(input);
  if (!table.ok) {
    return emptyTaskImport([skip('line', String(table.line), 'malformed_csv', table.token)]);
  }

  const map = notionMap(table.headers);
  if (map?.title === undefined) {
    return emptyTaskImport([skip('line', '1', 'missing_title_column')]);
  }

  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const row of table.rows) {
    const mapped = itemFromMappedRow(row.fields, map, ctx, row.line, 'notion');
    if (mapped.item !== undefined) {
      tasks.push(mapped.item);
      if (mapped.item.project_name !== undefined) addNamedProject(projects, mapped.item.project_name);
    }
    skipped.push(...mapped.skipped);
  }

  return { projects, tasks, skipped };
}

function notionMap(headers: readonly string[]): CsvColumnMap | null {
  const title = headerAlias(headers, ['Name', 'Title']);
  if (title === undefined) return null;
  return {
    ...TRANSFER_CSV_COLUMNS,
    title,
    notes: headerAlias(headers, ['Notes', 'Description']) ?? 'notes',
    due: headerAlias(headers, ['Due', 'Due Date', 'Date']) ?? 'due_at',
    priority: headerAlias(headers, ['Priority']) ?? 'priority',
    status: headerAlias(headers, ['Status']) ?? 'status',
    project: headerAlias(headers, ['Project']) ?? 'project',
    parent: headerAlias(headers, ['Parent']) ?? 'parent',
    sensitive: headerAlias(headers, ['Sensitive', 'Private']) ?? 'private',
    source_id: headerAlias(headers, ['id', 'page id', 'Page ID']) ?? 'id',
  };
}

function looksLikeCsv(input: string): boolean {
  const first = input.trimStart();
  if (first.startsWith('{') || first.startsWith('[')) return false;
  const line = first.split(/\r?\n/, 1)[0] ?? '';
  return line.includes(',');
}
