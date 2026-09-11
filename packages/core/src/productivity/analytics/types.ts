/**
 * Workspace-level private analytics shapes. Every figure carries
 * history_completeness (ADR 0012). Counts, never a score.
 */
import type { ApplicationStatus } from '../../schema/application.js';
import type { RevisionOp } from '../../types.js';
import type {
  HistoryCompleteness,
  Importance,
  Quadrant,
  QuadrantOverride,
  VitaeTaskStatus,
} from '../contracts.js';
import type { AnalyticsFigure, Placement } from '../read-models.js';
import type { ReplayRevision } from '../replay.js';

export const ANALYTICS_WINDOW_DAYS = [30, 90, 365] as const;
export type AnalyticsWindowDays = (typeof ANALYTICS_WINDOW_DAYS)[number];

export const REVIEW_PERIODS = ['daily', 'weekly'] as const;
export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];

export const URGENT_REASONS = [
  'due_within_window',
  'due_past',
  'target_within_window',
  'target_past',
  'follow_up_due',
  'waiting_patience_exceeded',
  'stage_patience_exceeded',
] as const;

export interface AnalyticsTask {
  readonly id: string;
  readonly title?: string;
  readonly status: VitaeTaskStatus;
  readonly completed_at?: string | null;
  readonly created_at?: string | null;
  readonly effort_min?: number | null;
  readonly follow_up?: string | null;
  readonly due?: string | null;
  readonly target?: string | null;
  readonly scheduled?: string | null;
  readonly importance?: Importance | null;
  readonly waiting_on?: string | null;
  readonly waiting_since?: string | null;
  readonly waiting_patience_days?: number | null;
  readonly quadrant_override?: QuadrantOverride | null;
  readonly project_id?: string | null;
  readonly serves_goal_id?: string | null;
  readonly quadrant?: Quadrant;
  readonly placement?: Placement;
  readonly deleted_at?: string | null;
}

export interface WorkspaceRevision extends ReplayRevision {
  readonly subject_id: string;
}

export interface AnalyticsTimeEntry {
  readonly id: string;
  readonly task_id: string;
  readonly started_at: string;
  readonly ended_at?: string | null;
  readonly duration_sec?: number | null;
}

export interface AnalyticsHabitCheck {
  readonly habit_id: string;
  readonly date: string;
}

export interface AnalyticsNamed {
  readonly id: string;
  readonly title: string;
}

export interface AnalyticsEdge {
  readonly type: 'WAITING_ON' | 'FOR' | 'SERVES_GOAL';
  readonly src: string;
  readonly dst: string;
}

export interface AnalyticsApplication {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly deleted_at?: string | null;
}

export interface WorkspaceAnalyticsInput {
  readonly now: string;
  readonly now_instant?: string;
  readonly window_start: string;
  readonly window_end: string;
  readonly time_zone: string;
  readonly tasks: readonly AnalyticsTask[];
  readonly revisions: readonly WorkspaceRevision[];
  readonly time_entries: readonly AnalyticsTimeEntry[];
  readonly habit_checks: readonly AnalyticsHabitCheck[];
  readonly habits: readonly AnalyticsNamed[];
  readonly goals: readonly AnalyticsNamed[];
  readonly entities: readonly AnalyticsNamed[];
  readonly edges: readonly AnalyticsEdge[];
  readonly applications: readonly AnalyticsApplication[];
}

export interface QuadrantBalanceFigure extends AnalyticsFigure {
  readonly do: number;
  readonly schedule: number;
  readonly delegate: number;
  readonly eliminate: number;
}

export interface UrgencyCreepFigure extends AnalyticsFigure {
  readonly count: number;
}

export interface WorkspaceThroughputFigure extends AnalyticsFigure {
  readonly total: number;
  readonly by_day: readonly { readonly period: string; readonly count: number }[];
}

export interface EstimateRow {
  readonly task_id: string;
  readonly effort_min: number;
  readonly actual_sec: number;
}

export interface EstimatesFigure extends AnalyticsFigure {
  readonly rows: readonly EstimateRow[];
}

export interface TimeSpentRow {
  readonly task_id: string;
  readonly seconds: number;
}

export interface TimeSpentFigure extends AnalyticsFigure {
  readonly total_seconds: number;
  readonly by_task: readonly TimeSpentRow[];
}

export interface WaitingFigure extends AnalyticsFigure {
  readonly waiting: number;
  readonly overdue_follow_up: number;
}

export interface HabitRow {
  readonly habit_id: string;
  readonly title: string;
  readonly checks: number;
  readonly current_run: number;
}

export interface HabitsFigure extends AnalyticsFigure {
  readonly total_checks: number;
  readonly by_habit: readonly HabitRow[];
}

export interface GoalRow {
  readonly goal_id: string;
  readonly title: string;
  readonly tasks: number;
}

export interface GoalsFigure extends AnalyticsFigure {
  readonly rows: readonly GoalRow[];
}

export interface ByEntityRow {
  readonly entity_id: string;
  readonly title: string;
  readonly waiting_on: number;
  readonly for: number;
}

export interface ByEntityFigure extends AnalyticsFigure {
  readonly rows: readonly ByEntityRow[];
}

export interface ApplicationStageRow {
  readonly stage: ApplicationStatus;
  readonly count: number;
}

export interface ApplicationFunnelFigure extends AnalyticsFigure {
  readonly rows: readonly ApplicationStageRow[];
}

export interface ProductivityFigures {
  readonly quadrant_balance: QuadrantBalanceFigure;
  readonly urgency_creep: UrgencyCreepFigure;
  readonly throughput: WorkspaceThroughputFigure;
  readonly estimates_vs_actuals: EstimatesFigure;
  readonly time_spent: TimeSpentFigure;
  readonly waiting: WaitingFigure;
  readonly habits: HabitsFigure;
  readonly goals: GoalsFigure;
  readonly by_entity: ByEntityFigure;
  readonly application_funnel: ApplicationFunnelFigure;
}

export interface ProductivityReview {
  readonly bullets: readonly string[];
}

export interface ProductivityAnalyticsResponse {
  readonly window: {
    readonly days: number;
    readonly start: string;
    readonly end: string;
  };
  readonly time_zone: string;
  readonly completeness: HistoryCompleteness;
  readonly figures: ProductivityFigures;
  readonly review?: ProductivityReview;
}

export type StoredRevisionLike = {
  readonly subject_id?: unknown;
  readonly rev?: unknown;
  readonly op?: unknown;
  readonly at?: unknown;
  readonly diff?: unknown;
  readonly snapshot?: unknown;
};
