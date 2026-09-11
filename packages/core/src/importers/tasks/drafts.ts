import type { ProjectFileDraft, StatedTaskProps, TaskFileDraft } from './types.js';

export function taskDraft(input: {
  title: string;
  props?: StatedTaskProps;
  notes_md?: string;
  sensitivity?: 'normal' | 'sensitive';
  identity_key?: string | null;
  source_id?: string;
  parent_source_id?: string;
  project_source_id?: string;
  project_name?: string;
  blocked_by_source_ids?: readonly string[];
}): TaskFileDraft {
  return {
    type: 'task',
    title: input.title,
    props: input.props ?? {},
    notes_md: input.notes_md ?? '',
    sensitivity: input.sensitivity ?? 'normal',
    identity_key: input.identity_key ?? null,
    ...(input.source_id !== undefined ? { source_id: input.source_id } : {}),
    ...(input.parent_source_id !== undefined ? { parent_source_id: input.parent_source_id } : {}),
    ...(input.project_source_id !== undefined ? { project_source_id: input.project_source_id } : {}),
    ...(input.project_name !== undefined ? { project_name: input.project_name } : {}),
    ...(input.blocked_by_source_ids !== undefined
      ? { blocked_by_source_ids: input.blocked_by_source_ids }
      : {}),
  };
}

export function projectDraft(input: {
  title: string;
  notes_md?: string;
  sensitivity?: 'normal' | 'sensitive';
  identity_key?: string | null;
  source_id?: string;
  status?: 'active' | 'paused' | 'done' | 'archived';
}): ProjectFileDraft {
  return {
    type: 'project',
    title: input.title,
    props: input.status !== undefined ? { status: input.status } : {},
    notes_md: input.notes_md ?? '',
    sensitivity: input.sensitivity ?? 'normal',
    identity_key: input.identity_key ?? null,
    ...(input.source_id !== undefined ? { source_id: input.source_id } : {}),
  };
}

export function addNamedProject(projects: ProjectFileDraft[], name: string, sourceId?: string): void {
  const trimmed = name.trim();
  if (trimmed === '') return;
  const id = sourceId ?? trimmed;
  if (projects.some((project) => project.source_id === id || project.title === trimmed)) return;
  projects.push(projectDraft({ title: trimmed, source_id: id }));
}

export function resolveParentNames(tasks: readonly TaskFileDraft[]): TaskFileDraft[] {
  const byId = new Set<string>();
  const byTitle = new Map<string, string>();
  for (const task of tasks) {
    if (task.source_id === undefined) continue;
    byId.add(task.source_id);
    byTitle.set(task.title, task.source_id);
  }
  const named = (value: string): string => (byId.has(value) ? value : (byTitle.get(value) ?? value));
  return tasks.map((task) => {
    const parent = task.parent_source_id === undefined ? undefined : named(task.parent_source_id);
    const blockers = task.blocked_by_source_ids?.map(named);
    return {
      ...task,
      ...(parent !== undefined ? { parent_source_id: parent } : {}),
      ...(blockers !== undefined ? { blocked_by_source_ids: blockers } : {}),
    };
  });
}
