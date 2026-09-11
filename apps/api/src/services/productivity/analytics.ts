/**
 * Private productivity analytics read model. Computed on read (ADR 0012).
 * Sensitive records are dropped before they reach a figure. No cache in v1;
 * a later memo would compare `writeGeneration()`.
 */
import {
  addCalendarDays,
  APPLICATION_STATUSES,
  overallCompleteness,
  parseAnalyticsWindowDays,
  parseReviewPeriod,
  projectProductivityFigures,
  reviewBullets,
  reviewWindowDays,
  toWorkspaceRevision,
  windowBounds,
  type AnalyticsTask,
  type AnalyticsWindowDays,
  type ApplicationStatus,
  type EdgeRecord,
  type NodeRecord,
  type ProductivityAnalyticsResponse,
  type ReviewPeriod,
  type WorkspaceAnalyticsInput,
  type WorkspaceRevision,
} from '@vitae/core';
import { repository } from '../../db/repository.js';
import type { TimeEntryRecord } from '../../db/productivity-docs.js';
import { placementItemFromNode, placeTask, taskProps, taskStatus } from './read-models.js';

export { parseAnalyticsWindowDays, parseReviewPeriod, reviewWindowDays };

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isSensitive(node: NodeRecord): boolean {
  return node.sensitivity === 'sensitive';
}

function applicationStatusOf(node: NodeRecord): ApplicationStatus | null {
  const status = taskProps(node).status;
  return (APPLICATION_STATUSES as readonly string[]).includes(status as string)
    ? (status as ApplicationStatus)
    : null;
}

function mergeRevisions(rows: readonly Record<string, unknown>[]): WorkspaceRevision[] {
  const seen = new Set<string>();
  const out: WorkspaceRevision[] = [];
  for (const row of rows) {
    const mapped = toWorkspaceRevision(row);
    if (!mapped) continue;
    const key = `${mapped.subject_id}:${mapped.rev}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
  }
  return out;
}

function revisionScanBounds(windowStart: string, nowInstant: string): { from: string; to: string } {
  return { from: `${addCalendarDays(windowStart, -1)}T00:00:00.000Z`, to: nowInstant };
}

function toAnalyticsTask(
  node: NodeRecord,
  edges: readonly EdgeRecord[],
  nodesById: ReadonlyMap<string, NodeRecord>,
  now: string,
  timeZone: string,
): AnalyticsTask {
  const props = taskProps(node);
  const item = placementItemFromNode(node, edges);
  const placement = placeTask(node, edges, nodesById, now, timeZone);
  return {
    id: node.id,
    title: node.title,
    status: taskStatus(node),
    completed_at: asString(props.completed_at) ?? null,
    created_at: node.created_at,
    effort_min: asNumber(props.effort_min) ?? null,
    follow_up: item.follow_up,
    due: item.due,
    target: item.target,
    scheduled: asString(props.scheduled) ?? null,
    importance: item.importance,
    waiting_on: item.waiting_on,
    waiting_since: item.waiting_since,
    waiting_patience_days: item.waiting_patience_days,
    quadrant_override: item.quadrant_override,
    project_id: item.project_id,
    serves_goal_id: item.serves_goal_id,
    quadrant: placement.quadrant,
    placement,
    deleted_at: node.deleted_at,
  };
}

export async function buildProductivityAnalytics(args: {
  now: string;
  timeZone: string;
  nowInstant: string;
  days: AnalyticsWindowDays | number;
  includeReview: boolean;
}): Promise<ProductivityAnalyticsResponse> {
  const { window_start, window_end } = windowBounds(args.now, args.timeZone, args.days);
  const [live, trash, edges, timeEntries, habitChecks] = await Promise.all([
    repository.allLiveNodes(),
    repository.trash(),
    repository.allLiveEdges(),
    repository.listTimeEntries(),
    repository.docList<{ habit_id: string; date: string; sensitive?: boolean }>('habit_checks'),
  ]);

  const hidden = new Set<string>();
  const visible: NodeRecord[] = [];
  for (const node of [...live, ...trash]) {
    if (isSensitive(node)) {
      hidden.add(node.id);
      continue;
    }
    visible.push(node);
  }

  const nodesById = new Map(visible.map((node) => [node.id, node]));
  const visibleEdges = edges.filter(
    (edge) =>
      (edge.type === 'WAITING_ON' || edge.type === 'FOR' || edge.type === 'SERVES_GOAL') &&
      !hidden.has(edge.src) &&
      !hidden.has(edge.dst),
  );

  const tasks = visible
    .filter((node) => node.type === 'task')
    .map((node) => toAnalyticsTask(node, visibleEdges, nodesById, args.now, args.timeZone));
  const habits = visible.filter((node) => node.type === 'habit').map((node) => ({ id: node.id, title: node.title }));
  const goals = visible.filter((node) => node.type === 'goal').map((node) => ({ id: node.id, title: node.title }));
  const entities = visible
    .filter((node) => node.type === 'person' || node.type === 'organization')
    .map((node) => ({ id: node.id, title: node.title }));
  const applications = visible
    .filter((node) => node.type === 'application')
    .flatMap((node) => {
      const status = applicationStatusOf(node);
      return status ? [{ id: node.id, status, deleted_at: node.deleted_at }] : [];
    });

  const subjectIds = [...tasks, ...applications].map((row) => row.id);
  const scan = revisionScanBounds(window_start, args.nowInstant);
  const [windowed, created] = await Promise.all([
    repository.revisionsInWindow({ ...scan, subjectKinds: ['node'] }),
    repository.createRevisionsFor(subjectIds),
  ]);
  const revisions = mergeRevisions([...created, ...windowed]).filter(
    (revision) => !hidden.has(revision.subject_id),
  );

  const input: WorkspaceAnalyticsInput = {
    now: args.now,
    now_instant: args.nowInstant,
    window_start,
    window_end,
    time_zone: args.timeZone,
    tasks,
    revisions,
    time_entries: timeEntries
      .filter((entry: TimeEntryRecord) => !hidden.has(entry.task_id) && entry.sensitive !== true)
      .map((entry) => ({
        id: entry.id,
        task_id: entry.task_id,
        started_at: entry.started_at,
        ended_at: entry.ended_at ?? null,
        duration_sec: entry.duration_sec ?? null,
      })),
    habit_checks: habitChecks
      .filter((check) => !hidden.has(check.habit_id) && check.sensitive !== true)
      .map((check) => ({ habit_id: check.habit_id, date: check.date })),
    habits,
    goals,
    entities,
    edges: visibleEdges.map((edge) => ({
      type: edge.type as 'WAITING_ON' | 'FOR' | 'SERVES_GOAL',
      src: edge.src,
      dst: edge.dst,
    })),
    applications,
  };

  const figures = projectProductivityFigures(input);
  return {
    window: { days: args.days, start: window_start, end: window_end },
    time_zone: args.timeZone,
    completeness: overallCompleteness(figures),
    figures,
    ...(args.includeReview ? { review: reviewBullets(figures) } : {}),
  };
}
