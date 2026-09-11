/**
 * Things JSON (`{ type, attributes }`) or a `things:///json?data=` URL.
 * A `.thingsdatabase` / SQLite file is named, not parsed.
 */

import { thingsTaskKey } from '../identity.js';
import { parseCivilDate, parseInstantIso } from './date.js';
import { addNamedProject, taskDraft } from './drafts.js';
import { appendNote, isUnsupportedStatus, parseVitaeStatus } from './fields.js';
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

export function parseThings(input: string, ctx: TaskImportContext): TaskImportResult {
  if (input.startsWith('SQLite format 3')) {
    return emptyTaskImport([skip('record', '1', 'sqlite_export')]);
  }

  const json = extractJson(input);
  if (json === null) return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptyTaskImport([skip('record', '1', 'unparseable_json')]);
  }

  if (!Array.isArray(parsed)) return emptyTaskImport([skip('record', '1', 'unrecognized_format')]);

  const projects: ProjectFileDraft[] = [];
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const [index, record] of parsed.entries()) {
    walk(record, ctx, {
      projects,
      tasks,
      skipped,
      projectName: undefined,
      parentId: undefined,
      path: String(index + 1),
    });
  }

  return { projects, tasks, skipped };
}

interface WalkState {
  readonly projects: ProjectFileDraft[];
  readonly tasks: TaskFileDraft[];
  readonly skipped: TaskImportSkip[];
  readonly projectName: string | undefined;
  readonly parentId: string | undefined;
  readonly path: string;
}

function walk(value: unknown, ctx: TaskImportContext, state: WalkState): void {
  if (!isRecord(value)) {
    state.skipped.push(skip('record', state.path, 'unparseable_row'));
    return;
  }

  const type = asString(value.type);
  const attributes = isRecord(value.attributes) ? value.attributes : {};
  const title = asString(attributes.title)?.trim() ?? '';
  const statedId = asString(value.id)?.trim() ?? '';

  if (type === 'heading') {
    state.skipped.push(title === '' ? skip('record', state.path, 'heading') : skip('record', title, 'heading', title));
    return;
  }

  if (type === 'project') {
    if (title === '') {
      state.skipped.push(skip('record', state.path, 'missing_title'));
      return;
    }
    const notes = asString(attributes.notes);
    addNamedProject(state.projects, title, statedId || title);
    if (statedId !== '') {
      const last = state.projects[state.projects.length - 1];
      if (last) {
        state.projects[state.projects.length - 1] = {
          ...last,
          identity_key: null,
          notes_md: notes?.trim() ?? last.notes_md,
        };
      }
    } else if (notes && notes.trim() !== '') {
      const last = state.projects[state.projects.length - 1];
      if (last) state.projects[state.projects.length - 1] = { ...last, notes_md: notes };
    }
    const nested = Array.isArray(attributes.items) ? attributes.items : [];
    for (const [index, child] of nested.entries()) {
      walk(child, ctx, {
        ...state,
        projectName: title,
        parentId: undefined,
        path: `${state.path}.${String(index + 1)}`,
      });
    }
    return;
  }

  if (type === 'to-do' || type === 'checklist-item') {
    if (title === '') {
      state.skipped.push(skip('record', state.path, 'missing_title'));
      return;
    }

    const sourceId =
      type === 'checklist-item' ? `things:${state.path}` : statedId || `things:${state.path}`;
    const { props, extraSkips, notes } = todoFields(attributes, title, ctx, sourceId);
    state.skipped.push(...extraSkips);

    const list = asString(attributes.list)?.trim();
    const projectName = state.projectName ?? (list === '' ? undefined : list);
    if (projectName !== undefined) addNamedProject(state.projects, projectName);

    state.tasks.push(
      taskDraft({
        title,
        props,
        notes_md: notes,
        identity_key: type === 'to-do' ? thingsTaskKey(statedId || null) : null,
        source_id: sourceId,
        ...(state.parentId === undefined ? {} : { parent_source_id: state.parentId }),
        ...(projectName === undefined ? {} : { project_name: projectName }),
      }),
    );

    const checks = Array.isArray(attributes['checklist-items']) ? attributes['checklist-items'] : [];
    for (const [index, child] of checks.entries()) {
      walk(child, ctx, {
        ...state,
        parentId: sourceId,
        path: `${state.path}.check.${String(index + 1)}`,
      });
    }
    return;
  }

  state.skipped.push(skip('record', state.path, 'unknown_type', type ?? ''));
}

function todoFields(
  attributes: Record<string, unknown>,
  title: string,
  ctx: TaskImportContext,
  at: string,
): { props: StatedTaskProps; extraSkips: TaskImportSkip[]; notes: string } {
  void title;
  const extraSkips: TaskImportSkip[] = [];
  let notes = asString(attributes.notes)?.trim() ?? '';
  const tags = Array.isArray(attributes.tags)
    ? attributes.tags.map((tag) => asString(tag)?.trim()).filter((tag): tag is string => Boolean(tag))
    : [];
  if (tags.length > 0) notes = appendNote(notes, tags.join('\n'));

  const props: Record<string, unknown> = {};
  if (asBoolean(attributes.canceled) === true) props.status = 'dropped';
  else if (asBoolean(attributes.completed) === true) props.status = 'done';

  const completed = asString(attributes['completion-date']);
  if (completed !== undefined) {
    const instant = parseInstantIso(completed) ?? (parseCivilDate(completed, ctx) ? `${parseCivilDate(completed, ctx)}T00:00:00.000Z` : null);
    if (instant !== null) props.completed_at = instant;
  }

  const deadline = asString(attributes.deadline);
  if (deadline !== undefined && deadline.trim() !== '') {
    const day = parseCivilDate(deadline, ctx);
    if (day === null) extraSkips.push(skip('source_id', at, 'unparseable_date', deadline));
    else props.due = day;
  }

  const when = asString(attributes.when)?.trim();
  if (when === 'someday') {
    extraSkips.push(skip('source_id', at, 'unsupported_status', 'someday'));
    if (props.status === undefined) props.status = parseVitaeStatus('open');
  } else if (when === 'evening') {
    const day = parseCivilDate('today', ctx);
    if (day !== null) props.target = day;
  } else if (when !== undefined && when !== '' && when !== 'anytime') {
    const day = parseCivilDate(when, ctx);
    if (day === null) extraSkips.push(skip('source_id', at, 'unparseable_date', when));
    else props.target = day;
  }

  if (isUnsupportedStatus(String(props.status ?? ''))) {
    extraSkips.push(skip('source_id', at, 'unsupported_status', String(props.status)));
    delete props.status;
  }

  return { props: props as StatedTaskProps, extraSkips, notes };
}

function extractJson(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;
  if (!trimmed.toLowerCase().startsWith('things:///json?')) return null;
  const query = trimmed.slice(trimmed.indexOf('?') + 1);
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (decodeURIComponent(part.slice(0, eq)) !== 'data') continue;
    return decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
