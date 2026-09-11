/**
 * Per-item completions / throughput. Completeness is declared, never implied
 * by a silent zero (ADR 0012).
 */
import { calendarDateInZone, parseInstant, resolveCalendarNow } from '../calendar.js';
import type { HistoryCompleteness, RuleActionValue, VitaeTaskStatus } from '../contracts.js';
import type { AnalyticsFigure } from '../read-models.js';
import { replayRevisions, type ReplayRevision } from '../replay.js';
import { historyCompletenessOf } from './revisions.js';

export interface AnalyticsItemSnapshot {
  readonly id: string;
  readonly status: VitaeTaskStatus;
  readonly completed_at?: string | null;
}

export interface AnalyticsProjectionInput {
  readonly now: string;
  readonly window_start: string;
  readonly window_end: string;
  readonly time_zone: string;
  readonly item: AnalyticsItemSnapshot;
  readonly revisions: readonly ReplayRevision[];
}

export interface ThroughputRow {
  readonly period: string;
  readonly count: number;
}

export interface CompletionsFigure extends AnalyticsFigure {
  readonly completions: number;
  readonly throughput: readonly ThroughputRow[];
}

function completionInstant(revision: ReplayRevision): string | null {
  if (revision.inferred) return null;
  const completed = revision.diff.completed_at;
  if (typeof completed === 'string' && completed.length > 0) return completed;
  if (revision.diff.status === 'done') return revision.at;
  return null;
}

function inWindow(iso: string, input: AnalyticsProjectionInput): boolean {
  const day = iso.includes('T')
    ? calendarDateInZone(new Date(parseInstant(iso, 'completed_at')), input.time_zone)
    : resolveCalendarNow(iso, input.time_zone);
  const asOf = input.now < input.window_end ? input.now : input.window_end;
  return day >= input.window_start && day <= asOf;
}

/**
 * Completions and throughput for one item over a window.
 * Completions are counted only from revisions that carry a done / completed_at
 * diff. A snapshot `completed_at` is never treated as a measured completion
 * when history is sparse or unknown.
 */
export function projectCompletions(input: AnalyticsProjectionInput): CompletionsFigure {
  const completeness: HistoryCompleteness = historyCompletenessOf(input.revisions);
  let completions = 0;
  const byDay = new Map<string, number>();

  if (completeness === 'complete') {
    for (const revision of input.revisions) {
      const at = completionInstant(revision);
      if (at === null || !inWindow(at, input)) continue;
      completions += 1;
      const day = at.includes('T')
        ? calendarDateInZone(new Date(parseInstant(at, 'completed_at')), input.time_zone)
        : at;
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }

  const throughput = [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, count]) => ({ period, count }));

  return {
    history_completeness: completeness,
    window_start: input.window_start,
    window_end: input.window_end,
    time_zone: input.time_zone,
    completions,
    throughput,
  };
}

/** Alias named by the Task 2 analytics fixtures. */
export const projectThroughput = projectCompletions;

export function reconstructItem(
  item: AnalyticsItemSnapshot,
  revisions: readonly ReplayRevision[],
): Record<string, RuleActionValue | string | null> {
  return replayRevisions(
    {
      id: item.id,
      status: item.status,
      completed_at: item.completed_at ?? null,
    },
    revisions,
  );
}
