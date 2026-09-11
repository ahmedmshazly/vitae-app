/**
 * Typed productivity client over the existing `api` fetch. No second HTTP
 * client, no TanStack DB. Demo space rides `x-vitae-space` from `getSpace()`.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  AnalyticsWindowDays,
  NodeRecord,
  ProductivityAnalyticsResponse,
  ProductivityCommand,
  ReviewPeriod,
  TaskReadModel,
} from '@vitae/core';
import { api, ApiError } from '../../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { isProductivityEnabled } from '../../lib/productivity-flag.js';
import { productivityKeys } from './query-keys.js';

export interface ProductivityTimeEntry {
  id: string;
  task_id: string;
  started_at: string;
  ended_at?: string;
  duration_sec?: number;
  note?: string;
  source?: string;
  rev: number;
  updated_at: string;
}

export interface ProductivityRule {
  id: string;
  name: string;
  statement?: string;
  enabled: boolean;
  condition: unknown;
  actions: unknown[];
  sort_order?: number | null;
  rev: number;
  updated_at: string;
}

export interface ProductivityTemplate {
  id: string;
  name: string;
  description?: string;
  kind: 'project' | 'item';
  body: Record<string, unknown>;
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface ProductivityCommandResult {
  task?: NodeRecord;
  tasks?: NodeRecord[];
  ordered_ids?: string[];
  edge?: unknown;
  time_entry?: ProductivityTimeEntry;
  rule?: ProductivityRule;
  template?: ProductivityTemplate;
}

export interface ProductivityCommandOutcome {
  replayed: boolean;
  result: ProductivityCommandResult;
}

export type ProductivityTasksPage = { tasks: TaskReadModel[] };
export type ProductivityTaskPage = { task: TaskReadModel };
export type ProductivityTimeEntriesPage = { time_entries: ProductivityTimeEntry[] };
export type ProductivityRulesPage = { rules: ProductivityRule[] };
export type ProductivityTemplatesPage = { templates: ProductivityTemplate[] };
export type ProductivityAnalyticsPage = ProductivityAnalyticsResponse;

function assertProductivityEnabled(): void {
  if (!isProductivityEnabled()) {
    throw new Error('Productivity is not available.');
  }
}

export function fetchProductivityTasks(): Promise<ProductivityTasksPage> {
  assertProductivityEnabled();
  return api.get<ProductivityTasksPage>('/productivity/tasks');
}

export function fetchProductivityTask(id: string): Promise<ProductivityTaskPage> {
  assertProductivityEnabled();
  return api.get<ProductivityTaskPage>(`/productivity/tasks/${id}`);
}

export function fetchProductivityWaiting(): Promise<ProductivityTasksPage> {
  assertProductivityEnabled();
  return api.get<ProductivityTasksPage>('/productivity/waiting');
}

export function fetchProductivityTimeEntries(taskId?: string): Promise<ProductivityTimeEntriesPage> {
  assertProductivityEnabled();
  const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : '';
  return api.get<ProductivityTimeEntriesPage>(`/productivity/time-entries${query}`);
}

export function fetchProductivityRules(): Promise<ProductivityRulesPage> {
  assertProductivityEnabled();
  return api.get<ProductivityRulesPage>('/productivity/rules');
}

export function fetchProductivityTemplates(): Promise<ProductivityTemplatesPage> {
  assertProductivityEnabled();
  return api.get<ProductivityTemplatesPage>('/productivity/templates');
}

export function fetchProductivityAnalytics(
  windowDays: AnalyticsWindowDays = 30,
): Promise<ProductivityAnalyticsPage> {
  assertProductivityEnabled();
  return api.get<ProductivityAnalyticsPage>(`/productivity/analytics?window=${windowDays}`);
}

export function fetchProductivityReview(
  period: ReviewPeriod = 'daily',
): Promise<ProductivityAnalyticsPage> {
  assertProductivityEnabled();
  return api.get<ProductivityAnalyticsPage>(`/productivity/review?period=${period}`);
}

export function postProductivityCommand(
  command: ProductivityCommand,
): Promise<ProductivityCommandOutcome> {
  assertProductivityEnabled();
  return api.post<ProductivityCommandOutcome>('/productivity/commands', command);
}

export function useProductivityTasks() {
  return useQuery({
    queryKey: productivityKeys.tasks(),
    queryFn: fetchProductivityTasks,
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityTask(id: string) {
  return useQuery({
    queryKey: productivityKeys.task(id),
    queryFn: () => fetchProductivityTask(id),
    enabled: isProductivityEnabled() && id.length > 0,
  });
}

export function useProductivityWaiting() {
  return useQuery({
    queryKey: productivityKeys.waiting(),
    queryFn: fetchProductivityWaiting,
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityTimeEntries(taskId?: string) {
  return useQuery({
    queryKey: productivityKeys.timeEntries(taskId),
    queryFn: () => fetchProductivityTimeEntries(taskId),
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityRules() {
  return useQuery({
    queryKey: productivityKeys.rules(),
    queryFn: fetchProductivityRules,
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityTemplates() {
  return useQuery({
    queryKey: productivityKeys.templates(),
    queryFn: fetchProductivityTemplates,
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityAnalytics(windowDays: AnalyticsWindowDays = 30) {
  return useQuery({
    queryKey: productivityKeys.analytics(windowDays),
    queryFn: () => fetchProductivityAnalytics(windowDays),
    enabled: isProductivityEnabled(),
  });
}

export function useProductivityReview(period: ReviewPeriod = 'daily') {
  return useQuery({
    queryKey: productivityKeys.review(period),
    queryFn: () => fetchProductivityReview(period),
    enabled: isProductivityEnabled(),
  });
}

function maxTaskRevision(tasks: NodeRecord[] | undefined): number | undefined {
  if (!tasks?.length) return undefined;
  const revs = tasks.map((row) => row.rev).filter((rev): rev is number => typeof rev === 'number');
  return revs.length ? Math.max(...revs) : undefined;
}

export function revisionFromResult(result: ProductivityCommandResult): number | undefined {
  if (result.task && typeof result.task.rev === 'number') return result.task.rev;
  const fromTasks = maxTaskRevision(result.tasks);
  if (fromTasks !== undefined) return fromTasks;
  if (result.rule && typeof result.rule.rev === 'number') return result.rule.rev;
  if (result.template && typeof result.template.rev === 'number') return result.template.rev;
  if (result.time_entry && typeof result.time_entry.rev === 'number') return result.time_entry.rev;
  return undefined;
}

/**
 * Stamp `expected_revision` from the last canonical result. A 409 on this
 * command is a conflict, never a silent overwrite.
 */
export function compensatingCommand(
  command: ProductivityCommand,
  lastResult: ProductivityCommandResult,
): ProductivityCommand {
  const expected_revision = revisionFromResult(lastResult);
  return expected_revision === undefined ? command : { ...command, expected_revision };
}

type ProductivitySnapshot = Array<[QueryKey, unknown]>;

function snapshotProductivity(qc: QueryClient): ProductivitySnapshot {
  return qc.getQueryCache().findAll({ queryKey: productivityKeys.all }).map((query) => [
    query.queryKey,
    query.state.data,
  ]);
}

function restoreSnapshot(qc: QueryClient, snapshot: ProductivitySnapshot): void {
  const keep = new Set(snapshot.map(([key]) => JSON.stringify(key)));
  for (const query of qc.getQueryCache().findAll({ queryKey: productivityKeys.all })) {
    if (!keep.has(JSON.stringify(query.queryKey))) {
      qc.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }
  for (const [key, data] of snapshot) {
    qc.setQueryData(key, data);
  }
}

function emptyTask(id: string): TaskReadModel {
  return { id, title: '', status: 'inbox', rev: 0 };
}

function patchTaskList(
  qc: QueryClient,
  key: readonly unknown[],
  id: string,
  updater: (task: TaskReadModel) => TaskReadModel,
  createIfMissing: boolean,
): void {
  const page = qc.getQueryData<ProductivityTasksPage>(key);
  if (!page) return;
  const idx = page.tasks.findIndex((task) => task.id === id);
  if (idx >= 0) {
    const tasks = [...page.tasks];
    tasks[idx] = updater(tasks[idx]!);
    qc.setQueryData(key, { tasks });
    return;
  }
  if (createIfMissing) {
    qc.setQueryData(key, { tasks: [updater(emptyTask(id)), ...page.tasks] });
  }
}

function patchTask(
  qc: QueryClient,
  id: string,
  updater: (task: TaskReadModel) => TaskReadModel,
  createIfMissing = false,
): void {
  patchTaskList(qc, productivityKeys.tasks(), id, updater, createIfMissing);
  patchTaskList(qc, productivityKeys.waiting(), id, updater, false);
  const detailKey = productivityKeys.task(id);
  const detail = qc.getQueryData<ProductivityTaskPage>(detailKey);
  if (detail) {
    qc.setQueryData(detailKey, { task: updater(detail.task) });
  } else if (createIfMissing) {
    qc.setQueryData(detailKey, { task: updater(emptyTask(id)) });
  }
}

function taskPatchFromNode(node: NodeRecord): Partial<TaskReadModel> {
  const props = node.props ?? {};
  const status = typeof props.status === 'string' ? props.status : undefined;
  return {
    id: node.id,
    title: node.title,
    rev: node.rev,
    ...(status ? { status: status as TaskReadModel['status'] } : {}),
    ...(typeof props.due === 'string' ? { due: props.due } : {}),
    ...(typeof props.target === 'string' ? { target: props.target } : {}),
    ...(typeof props.scheduled === 'string' ? { scheduled: props.scheduled } : {}),
    ...(typeof props.follow_up === 'string' ? { follow_up: props.follow_up } : {}),
    ...(typeof props.priority === 'string' ? { priority: props.priority as TaskReadModel['priority'] } : {}),
    ...(typeof props.importance === 'string'
      ? { importance: props.importance as TaskReadModel['importance'] }
      : {}),
  };
}

function mergeTaskFromNode(qc: QueryClient, node: NodeRecord): void {
  const patch = taskPatchFromNode(node);
  patchTask(qc, node.id, (task) => ({ ...task, ...patch }), true);
}

function mergeNamedItem<T extends { id: string }>(
  qc: QueryClient,
  key: readonly unknown[],
  field: 'rules' | 'templates' | 'time_entries',
  item: T,
): void {
  const page = qc.getQueryData<Record<string, T[]>>(key);
  if (!page || !Array.isArray(page[field])) return;
  const rows = page[field];
  const idx = rows.findIndex((row) => row.id === item.id);
  const next = idx >= 0 ? rows.map((row, i) => (i === idx ? item : row)) : [item, ...rows];
  qc.setQueryData(key, { ...page, [field]: next });
}

function applyOptimistic(qc: QueryClient, command: ProductivityCommand): void {
  switch (command.type) {
    case 'create_task': {
      const page = qc.getQueryData<ProductivityTasksPage>(productivityKeys.tasks());
      if (!page) return;
      qc.setQueryData(productivityKeys.tasks(), {
        tasks: [
          {
            id: `optimistic:${command.operation_id}`,
            title: command.payload.title,
            status: command.payload.status ?? 'inbox',
            rev: 0,
          },
          ...page.tasks,
        ],
      });
      return;
    }
    case 'update_task': {
      const { id, patch } = command.payload;
      patchTask(qc, id, (task) => ({
        ...task,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.due !== undefined ? { due: patch.due } : {}),
        ...(patch.follow_up !== undefined ? { follow_up: patch.follow_up } : {}),
      }));
      return;
    }
    case 'complete_task':
      patchTask(qc, command.payload.id, (task) => ({ ...task, status: 'done' }));
      return;
    case 'drop_task':
      patchTask(qc, command.payload.id, (task) => ({ ...task, status: 'dropped' }));
      return;
    case 'restore_task':
      patchTask(qc, command.payload.id, (task) => ({
        ...task,
        status: command.payload.status ?? 'inbox',
      }));
      return;
    case 'wait_on_task':
      patchTask(qc, command.payload.id, (task) => ({ ...task, status: 'waiting' }));
      return;
    case 'follow_up_task':
      patchTask(qc, command.payload.id, (task) => ({
        ...task,
        follow_up: command.payload.follow_up,
      }));
      return;
    case 'reorder_tasks': {
      const page = qc.getQueryData<ProductivityTasksPage>(productivityKeys.tasks());
      if (!page) return;
      const byId = new Map(page.tasks.map((task) => [task.id, task]));
      const ordered = command.payload.ordered_ids
        .map((id) => byId.get(id))
        .filter((task): task is TaskReadModel => task != null);
      const rest = page.tasks.filter((task) => !command.payload.ordered_ids.includes(task.id));
      qc.setQueryData(productivityKeys.tasks(), { tasks: [...ordered, ...rest] });
      return;
    }
    default:
      return;
  }
}

function replaceCanonical(
  qc: QueryClient,
  result: ProductivityCommandResult,
  command: ProductivityCommand,
): void {
  if (command.type === 'create_task') {
    const page = qc.getQueryData<ProductivityTasksPage>(productivityKeys.tasks());
    if (page) {
      qc.setQueryData(productivityKeys.tasks(), {
        tasks: page.tasks.filter((task) => task.id !== `optimistic:${command.operation_id}`),
      });
    }
  }
  if (result.task) mergeTaskFromNode(qc, result.task);
  if (result.tasks) {
    for (const node of result.tasks) mergeTaskFromNode(qc, node);
  }
  if (result.rule) mergeNamedItem(qc, productivityKeys.rules(), 'rules', result.rule);
  if (result.template) {
    mergeNamedItem(qc, productivityKeys.templates(), 'templates', result.template);
  }
  if (result.time_entry) {
    mergeNamedItem(qc, productivityKeys.timeEntries(), 'time_entries', result.time_entry);
    mergeNamedItem(
      qc,
      productivityKeys.timeEntries(result.time_entry.task_id),
      'time_entries',
      result.time_entry,
    );
  }
}

export function useProductivityCommand() {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const lastCanonical = useRef<ProductivityCommandResult | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (command: ProductivityCommand) => {
      if (!canWrite) {
        throw new ApiError(402, 'PAYMENT_REQUIRED', WRITE_LOCK_HINT);
      }
      return postProductivityCommand(command);
    },
    onMutate: async (command) => {
      // Snapshot first. Test QueryClients use `gcTime: 0`, and cancelling
      // before the copy can drop the rows this rollback has to restore.
      const snapshot = snapshotProductivity(qc);
      await qc.cancelQueries({ queryKey: productivityKeys.all });
      restoreSnapshot(qc, snapshot);
      applyOptimistic(qc, command);
      return { snapshot };
    },
    onSuccess: (outcome, command) => {
      setConflict(null);
      lastCanonical.current = outcome.result;
      replaceCanonical(qc, outcome.result, command);
    },
    onError: (error, _command, ctx) => {
      if (ctx?.snapshot) restoreSnapshot(qc, ctx.snapshot);
      if (error instanceof ApiError && error.status === 409) {
        setConflict(error.message);
        return;
      }
      setConflict(null);
    },
  });

  function undo(command: ProductivityCommand) {
    const last = lastCanonical.current;
    if (!last) throw new Error('Nothing to undo.');
    return mutation.mutateAsync(compensatingCommand(command, last));
  }

  const writeLock =
    mutation.error instanceof ApiError && mutation.error.status === 402
      ? WRITE_LOCK_HINT
      : !canWrite
        ? WRITE_LOCK_HINT
        : null;

  return { ...mutation, undo, conflict, writeLock, lastCanonical };
}
