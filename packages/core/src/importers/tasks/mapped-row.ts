import { notionPageKey, tasksCsvTaskKey } from '../identity.js';
import { cell } from './csv-table.js';
import { parseCivilDate, parseInstantIso } from './date.js';
import { taskDraft } from './drafts.js';
import {
  isSensitiveFlag,
  isUnsupportedStatus,
  parseEnergy,
  parseImportance,
  parseVitaePriority,
  parseVitaeStatus,
  recurrenceFromRule,
} from './fields.js';
import { skip } from './skip.js';
import type { StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportSkip } from './types.js';

export interface CsvColumnMap {
  readonly title?: string;
  readonly notes?: string;
  readonly importance?: string;
  readonly priority?: string;
  readonly due?: string;
  readonly target?: string;
  readonly scheduled?: string;
  readonly status?: string;
  readonly completed_at?: string;
  readonly recurrence?: string;
  readonly project?: string;
  readonly parent?: string;
  readonly energy?: string;
  readonly effort_min?: string;
  readonly sensitive?: string;
  readonly source_id?: string;
}

export const TRANSFER_CSV_COLUMNS: CsvColumnMap = {
  title: 'title',
  notes: 'notes',
  importance: 'importance',
  priority: 'priority',
  due: 'due_at',
  target: 'target_at',
  scheduled: 'scheduled_at',
  status: 'status',
  completed_at: 'completed_at',
  recurrence: 'recurrence',
  project: 'project_name',
  parent: 'parent_source_id',
  energy: 'energy',
  effort_min: 'estimate_minutes',
  sensitive: 'private',
  source_id: 'source_id',
};

export function itemFromMappedRow(
  fields: Readonly<Record<string, string>>,
  map: CsvColumnMap,
  ctx: TaskImportContext,
  line: number,
  identity: 'csv' | 'notion',
): { item?: TaskFileDraft; skipped: TaskImportSkip[] } {
  const title = cell(fields, map.title).trim();
  if (title === '') return { skipped: [skip('line', String(line), 'missing_title')] };

  const skipped: TaskImportSkip[] = [];
  const props: Record<string, unknown> = {};

  const statusRaw = cell(fields, map.status);
  if (isUnsupportedStatus(statusRaw)) {
    skipped.push(skip('line', String(line), 'unsupported_status', statusRaw.trim()));
  } else {
    const status = parseVitaeStatus(statusRaw);
    if (status !== undefined) props.status = status;
  }

  const priority = parseVitaePriority(cell(fields, map.priority));
  if (priority !== undefined) props.priority = priority;
  const importance = parseImportance(cell(fields, map.importance));
  if (importance !== undefined) props.importance = importance;
  const energy = parseEnergy(cell(fields, map.energy));
  if (energy !== undefined) props.energy = energy;
  const effort = Number(cell(fields, map.effort_min).trim());
  if (Number.isInteger(effort) && effort >= 1) props.effort_min = effort;

  takeDate(props, 'due', cell(fields, map.due), ctx, line, skipped);
  takeDate(props, 'target', cell(fields, map.target), ctx, line, skipped);
  takeDate(props, 'scheduled', cell(fields, map.scheduled), ctx, line, skipped);

  const completedRaw = cell(fields, map.completed_at).trim();
  if (completedRaw !== '') {
    const instant = parseInstantIso(completedRaw);
    if (instant !== null) props.completed_at = instant;
  }

  const recurrenceRaw = cell(fields, map.recurrence).trim();
  if (recurrenceRaw !== '') {
    const recurrence = recurrenceFromRule(recurrenceRaw);
    if (recurrence === null) skipped.push(skip('line', String(line), 'unsupported_recurrence', recurrenceRaw));
    else props.recurrence = recurrence;
  }

  const sourceId =
    cell(fields, map.source_id).trim() ||
    cell(fields, 'source_id').trim() ||
    cell(fields, 'id').trim() ||
    cell(fields, 'page id').trim();
  const parent = cell(fields, map.parent).trim() || cell(fields, 'parent').trim();
  const project = cell(fields, map.project).trim() || cell(fields, 'project').trim();
  const projectSource = cell(fields, 'project_source_id').trim();
  const key = identity === 'notion' ? notionPageKey(sourceId || null) : tasksCsvTaskKey(sourceId || null);

  return {
    item: taskDraft({
      title,
      props: props as StatedTaskProps,
      notes_md: cell(fields, map.notes),
      sensitivity: isSensitiveFlag(cell(fields, map.sensitive)) ? 'sensitive' : 'normal',
      identity_key: key,
      ...(sourceId !== '' ? { source_id: sourceId } : {}),
      ...(parent !== '' ? { parent_source_id: parent } : {}),
      ...(project !== '' ? { project_name: project } : {}),
      ...(projectSource !== '' ? { project_source_id: projectSource } : {}),
    }),
    skipped,
  };
}

function takeDate(
  props: Record<string, unknown>,
  key: 'due' | 'target' | 'scheduled',
  raw: string,
  ctx: TaskImportContext,
  line: number,
  skipped: TaskImportSkip[],
): void {
  if (raw.trim() === '') return;
  const day = parseCivilDate(raw, ctx);
  if (day === null) {
    skipped.push(skip('line', String(line), 'unparseable_date', raw.trim()));
    return;
  }
  props[key] = day;
}
