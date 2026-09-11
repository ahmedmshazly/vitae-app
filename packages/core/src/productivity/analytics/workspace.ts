/**
 * Workspace analytics projections. Pure: clock, zone, and records are arguments.
 * No I/O. Sensitive rows must already be absent from the input.
 */
import { computeStreak } from '../../algorithms/streaks.js';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../../schema/application.js';
import {
  addCalendarDays,
  calendarDateInZone,
  calendarDaysBetween,
  parseInstant,
  resolveCalendarNow,
} from '../calendar.js';
import type { HistoryCompleteness, Importance, Quadrant, ReasonKey } from '../contracts.js';
import { defaultPlacementContext, placeItem, type PlacementItem } from '../placement.js';
import type { AnalyticsFigure } from '../read-models.js';
import { projectCompletions } from './completions.js';
import {
  historyCompletenessOf,
  revisionsFor,
  toReplayRevision,
  worseCompleteness,
} from './revisions.js';
import {
  ANALYTICS_WINDOW_DAYS,
  URGENT_REASONS,
  type AnalyticsTask,
  type AnalyticsWindowDays,
  type ApplicationFunnelFigure,
  type ByEntityFigure,
  type EstimatesFigure,
  type GoalsFigure,
  type HabitsFigure,
  type ProductivityFigures,
  type QuadrantBalanceFigure,
  type ReviewPeriod,
  type TimeSpentFigure,
  type UrgencyCreepFigure,
  type WaitingFigure,
  type WorkspaceAnalyticsInput,
  type WorkspaceRevision,
  type WorkspaceThroughputFigure,
} from './types.js';

const URGENT = new Set<string>(URGENT_REASONS);

export function isAnalyticsWindowDays(value: unknown): value is AnalyticsWindowDays {
  return ANALYTICS_WINDOW_DAYS.includes(value as AnalyticsWindowDays);
}

export function parseAnalyticsWindowDays(value: unknown): AnalyticsWindowDays {
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (isAnalyticsWindowDays(parsed)) return parsed;
  }
  if (isAnalyticsWindowDays(value)) return value;
  return 30;
}

export function parseReviewPeriod(value: unknown): ReviewPeriod {
  return value === 'weekly' ? 'weekly' : 'daily';
}

export function windowBounds(
  now: string,
  timeZone: string,
  days: number,
): { window_start: string; window_end: string } {
  const window_end = resolveCalendarNow(now, timeZone);
  return { window_start: addCalendarDays(window_end, -(days - 1)), window_end };
}

export function reviewWindowDays(period: ReviewPeriod): number {
  return period === 'weekly' ? 7 : 1;
}

function figureBase(input: WorkspaceAnalyticsInput, completeness: HistoryCompleteness): AnalyticsFigure {
  return {
    history_completeness: completeness,
    window_start: input.window_start,
    window_end: input.window_end,
    time_zone: input.time_zone,
  };
}

function liveTasks(tasks: readonly AnalyticsTask[]): AnalyticsTask[] {
  return tasks.filter((task) => !task.deleted_at);
}

function asOfDay(input: WorkspaceAnalyticsInput): string {
  const today = resolveCalendarNow(input.now, input.time_zone);
  return today < input.window_end ? today : input.window_end;
}

function calendarDay(iso: string, timeZone: string): string {
  if (!iso.includes('T')) return resolveCalendarNow(iso, timeZone);
  return calendarDateInZone(new Date(parseInstant(iso, 'instant')), timeZone);
}

function dayInWindow(day: string, input: WorkspaceAnalyticsInput): boolean {
  return day >= input.window_start && day <= asOfDay(input);
}

function instantInWindow(iso: string, input: WorkspaceAnalyticsInput): boolean {
  return dayInWindow(calendarDay(iso, input.time_zone), input);
}

function nowInstant(input: WorkspaceAnalyticsInput): string {
  if (input.now_instant) return input.now_instant;
  if (input.now.includes('T')) return input.now;
  return `${asOfDay(input)}T23:59:59.999Z`;
}

function isUrgentReason(reason: ReasonKey): boolean {
  return URGENT.has(reason);
}

function asImportance(value: unknown): Importance | null {
  return value === 'none' || value === 'important' || value === 'critical' ? value : null;
}

function placementItemFromBag(bag: Readonly<Record<string, unknown>>): PlacementItem {
  return {
    due: typeof bag.due === 'string' ? bag.due : null,
    target: typeof bag.target === 'string' ? bag.target : null,
    follow_up: typeof bag.follow_up === 'string' ? bag.follow_up : null,
    importance: asImportance(bag.importance),
    waiting_on: typeof bag.waiting_on === 'string' ? bag.waiting_on : null,
    waiting_since: typeof bag.waiting_since === 'string' ? bag.waiting_since : null,
    waiting_patience_days: typeof bag.waiting_patience_days === 'number' ? bag.waiting_patience_days : null,
    quadrant_override: null,
    project_id: typeof bag.project_id === 'string' ? bag.project_id : null,
    serves_goal_id: typeof bag.serves_goal_id === 'string' ? bag.serves_goal_id : null,
  };
}

function placementItemFromTask(task: AnalyticsTask): PlacementItem {
  return {
    due: task.due ?? null,
    target: task.target ?? null,
    follow_up: task.follow_up ?? null,
    importance: task.importance ?? null,
    waiting_on: task.waiting_on ?? null,
    waiting_since: task.waiting_since ?? null,
    waiting_patience_days: task.waiting_patience_days ?? null,
    quadrant_override: task.quadrant_override ?? null,
    project_id: task.project_id ?? null,
    serves_goal_id: task.serves_goal_id ?? null,
  };
}

function quadrantOf(task: AnalyticsTask, input: WorkspaceAnalyticsInput): Quadrant {
  if (task.quadrant) return task.quadrant;
  if (task.placement) return task.placement.quadrant;
  return placeItem(
    placementItemFromTask(task),
    defaultPlacementContext({ now: input.now, timeZone: input.time_zone }),
  ).quadrant;
}

export function projectQuadrantBalance(input: WorkspaceAnalyticsInput): QuadrantBalanceFigure {
  const counts: Record<Quadrant, number> = { do: 0, schedule: 0, delegate: 0, eliminate: 0 };
  for (const task of liveTasks(input.tasks)) {
    counts[quadrantOf(task, input)] += 1;
  }
  return { ...figureBase(input, 'complete'), ...counts };
}

function isUrgentBag(bag: Readonly<Record<string, unknown>>, day: string, timeZone: string): boolean {
  return isUrgentReason(
    placeItem(placementItemFromBag(bag), defaultPlacementContext({ now: day, timeZone })).reason,
  );
}

/**
 * First civil day the item was urgent, walking create → as-of.
 * Created-already-urgent is reported separately so it stays a zero on the figure.
 */
function firstUrgentDay(
  trail: readonly WorkspaceRevision[],
  input: WorkspaceAnalyticsInput,
): { createdUrgent: boolean; first: string | null } {
  const ordered = [...trail].sort((left, right) =>
    left.rev !== right.rev ? left.rev - right.rev : left.at.localeCompare(right.at),
  );
  const created = ordered.find((revision) => revision.op === 'create') ?? ordered[0];
  if (!created) return { createdUrgent: false, first: null };

  const timeZone = input.time_zone;
  const createDay = calendarDay(created.at, timeZone);
  const lastDay = asOfDay(input);
  let state: Record<string, unknown> = { ...created.diff };
  if (isUrgentBag(state, createDay, timeZone)) return { createdUrgent: true, first: createDay };

  const span = calendarDaysBetween(createDay, lastDay);
  if (span < 0) return { createdUrgent: false, first: null };

  let applyIdx = ordered.indexOf(created) + 1;
  for (let offset = 0; offset <= span; offset += 1) {
    const day = addCalendarDays(createDay, offset);
    while (applyIdx < ordered.length && calendarDay(ordered[applyIdx]!.at, timeZone) <= day) {
      state = { ...state, ...ordered[applyIdx]!.diff };
      applyIdx += 1;
    }
    if (isUrgentBag(state, day, timeZone)) return { createdUrgent: false, first: day };
  }
  return { createdUrgent: false, first: null };
}

export function projectUrgencyCreep(input: WorkspaceAnalyticsInput): UrgencyCreepFigure {
  let count = 0;
  let completeness: HistoryCompleteness = 'complete';

  for (const task of input.tasks) {
    const trail = revisionsFor(task.id, input.revisions);
    const trailCompleteness = historyCompletenessOf(trail.map(toReplayRevision));
    completeness = worseCompleteness(completeness, trailCompleteness);
    if (trailCompleteness !== 'complete') continue;

    const { createdUrgent, first } = firstUrgentDay(trail, input);
    if (createdUrgent || first === null || !dayInWindow(first, input)) continue;
    count += 1;
  }

  if (input.tasks.length === 0) completeness = 'complete';

  return { ...figureBase(input, completeness), count };
}

export function projectWorkspaceThroughput(input: WorkspaceAnalyticsInput): WorkspaceThroughputFigure {
  const byDay = new Map<string, number>();
  let total = 0;
  let completeness: HistoryCompleteness = 'complete';

  for (const task of input.tasks) {
    const trail = revisionsFor(task.id, input.revisions).map(toReplayRevision);
    const figure = projectCompletions({
      now: input.now,
      window_start: input.window_start,
      window_end: input.window_end,
      time_zone: input.time_zone,
      item: { id: task.id, status: task.status, completed_at: task.completed_at },
      revisions: trail,
    });
    completeness = worseCompleteness(completeness, figure.history_completeness);
    total += figure.completions;
    for (const row of figure.throughput) {
      byDay.set(row.period, (byDay.get(row.period) ?? 0) + row.count);
    }
  }

  const by_day = [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, count]) => ({ period, count }));

  return { ...figureBase(input, completeness), total, by_day };
}

export function projectEstimatesVsActuals(input: WorkspaceAnalyticsInput): EstimatesFigure {
  const rows = [];
  for (const task of liveTasks(input.tasks)) {
    if (task.effort_min == null || task.effort_min <= 0) continue;
    let actual = 0;
    let hasActual = false;
    for (const entry of input.time_entries) {
      if (entry.task_id !== task.id || entry.duration_sec == null) continue;
      hasActual = true;
      actual += entry.duration_sec;
    }
    if (!hasActual) continue;
    rows.push({ task_id: task.id, effort_min: task.effort_min, actual_sec: actual });
  }
  rows.sort((left, right) => left.task_id.localeCompare(right.task_id));
  return { ...figureBase(input, 'complete'), rows };
}

function entrySeconds(entry: WorkspaceAnalyticsInput['time_entries'][number], until: string): number | null {
  if (entry.duration_sec != null) return entry.duration_sec;
  const start = parseInstant(entry.started_at, 'started_at');
  const end = entry.ended_at
    ? parseInstant(entry.ended_at, 'ended_at')
    : parseInstant(until, 'now');
  if (end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function projectTimeSpent(input: WorkspaceAnalyticsInput): TimeSpentFigure {
  const until = nowInstant(input);
  const byTask = new Map<string, number>();
  for (const entry of input.time_entries) {
    if (!instantInWindow(entry.started_at, input)) continue;
    const seconds = entrySeconds(entry, until);
    if (seconds == null || seconds <= 0) continue;
    byTask.set(entry.task_id, (byTask.get(entry.task_id) ?? 0) + seconds);
  }
  const by_task = [...byTask.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([task_id, seconds]) => ({ task_id, seconds }));
  const total_seconds = by_task.reduce((sum, row) => sum + row.seconds, 0);
  return { ...figureBase(input, 'complete'), total_seconds, by_task };
}

export function projectWaiting(input: WorkspaceAnalyticsInput): WaitingFigure {
  const today = resolveCalendarNow(input.now, input.time_zone);
  let waiting = 0;
  let overdue_follow_up = 0;
  for (const task of liveTasks(input.tasks)) {
    if (task.status === 'waiting') waiting += 1;
    if (task.follow_up && task.follow_up < today) overdue_follow_up += 1;
  }
  return { ...figureBase(input, 'complete'), waiting, overdue_follow_up };
}

export function projectHabits(input: WorkspaceAnalyticsInput): HabitsFigure {
  const titles = new Map(input.habits.map((habit) => [habit.id, habit.title]));
  const byHabit = new Map<string, { checks: number; dates: string[] }>();
  for (const check of input.habit_checks) {
    if (!dayInWindow(check.date, input)) continue;
    const current = byHabit.get(check.habit_id) ?? { checks: 0, dates: [] };
    current.checks += 1;
    current.dates.push(check.date);
    byHabit.set(check.habit_id, current);
  }
  const today = resolveCalendarNow(input.now, input.time_zone);
  const by_habit = [...byHabit.entries()]
    .map(([habit_id, row]) => ({
      habit_id,
      title: titles.get(habit_id) ?? habit_id,
      checks: row.checks,
      current_run: computeStreak(row.dates, today).current,
    }))
    .sort((left, right) => left.habit_id.localeCompare(right.habit_id));
  const total_checks = by_habit.reduce((sum, row) => sum + row.checks, 0);
  return { ...figureBase(input, 'complete'), total_checks, by_habit };
}

export function projectGoals(input: WorkspaceAnalyticsInput): GoalsFigure {
  const live = new Set(liveTasks(input.tasks).map((task) => task.id));
  const counts = new Map<string, number>();
  for (const edge of input.edges) {
    if (edge.type !== 'SERVES_GOAL') continue;
    if (!live.has(edge.src)) continue;
    counts.set(edge.dst, (counts.get(edge.dst) ?? 0) + 1);
  }
  const rows = input.goals
    .map((goal) => ({ goal_id: goal.id, title: goal.title, tasks: counts.get(goal.id) ?? 0 }))
    .sort((left, right) => left.goal_id.localeCompare(right.goal_id));
  return { ...figureBase(input, 'complete'), rows };
}

export function projectByEntity(input: WorkspaceAnalyticsInput): ByEntityFigure {
  const live = new Set(liveTasks(input.tasks).map((task) => task.id));
  const titles = new Map(input.entities.map((entity) => [entity.id, entity.title]));
  const counts = new Map<string, { waiting_on: number; for: number }>();
  const bump = (id: string, field: 'waiting_on' | 'for'): void => {
    const current = counts.get(id) ?? { waiting_on: 0, for: 0 };
    current[field] += 1;
    counts.set(id, current);
  };
  for (const edge of input.edges) {
    if (edge.type !== 'WAITING_ON' && edge.type !== 'FOR') continue;
    if (!live.has(edge.src)) continue;
    bump(edge.dst, edge.type === 'WAITING_ON' ? 'waiting_on' : 'for');
  }
  const rows = [...counts.entries()]
    .map(([entity_id, row]) => ({
      entity_id,
      title: titles.get(entity_id) ?? entity_id,
      waiting_on: row.waiting_on,
      for: row.for,
    }))
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  return { ...figureBase(input, 'complete'), rows };
}

export function projectApplicationFunnel(input: WorkspaceAnalyticsInput): ApplicationFunnelFigure {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((stage) => [stage, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const application of input.applications) {
    if (application.deleted_at) continue;
    counts[application.status] += 1;
  }

  let completeness: HistoryCompleteness = 'complete';
  for (const application of input.applications) {
    if (application.deleted_at) continue;
    const trail = revisionsFor(application.id, input.revisions);
    completeness = worseCompleteness(completeness, historyCompletenessOf(trail.map(toReplayRevision)));
  }

  const rows = APPLICATION_STATUSES.map((stage) => ({ stage, count: counts[stage] }));
  return { ...figureBase(input, completeness), rows };
}

export function projectProductivityFigures(input: WorkspaceAnalyticsInput): ProductivityFigures {
  return {
    quadrant_balance: projectQuadrantBalance(input),
    urgency_creep: projectUrgencyCreep(input),
    throughput: projectWorkspaceThroughput(input),
    estimates_vs_actuals: projectEstimatesVsActuals(input),
    time_spent: projectTimeSpent(input),
    waiting: projectWaiting(input),
    habits: projectHabits(input),
    goals: projectGoals(input),
    by_entity: projectByEntity(input),
    application_funnel: projectApplicationFunnel(input),
  };
}

export function overallCompleteness(figures: ProductivityFigures): HistoryCompleteness {
  return (
    [
      figures.quadrant_balance,
      figures.urgency_creep,
      figures.throughput,
      figures.estimates_vs_actuals,
      figures.time_spent,
      figures.waiting,
      figures.habits,
      figures.goals,
      figures.by_entity,
      figures.application_funnel,
    ] as const
  ).reduce<HistoryCompleteness>(
    (current, figure) => worseCompleteness(current, figure.history_completeness),
    'complete',
  );
}
