/**
 * TanStack Query keys for the productivity client. Lists are plural; a single
 * record is `task` + id. Do not invent a parallel cache.
 */
export const productivityKeys = {
  all: ['productivity'] as const,
  tasks: () => ['productivity', 'tasks'] as const,
  task: (id: string) => ['productivity', 'task', id] as const,
  waiting: () => ['productivity', 'waiting'] as const,
  timeEntries: (taskId?: string) =>
    taskId
      ? (['productivity', 'time-entries', taskId] as const)
      : (['productivity', 'time-entries'] as const),
  rules: () => ['productivity', 'rules'] as const,
  templates: () => ['productivity', 'templates'] as const,
};
