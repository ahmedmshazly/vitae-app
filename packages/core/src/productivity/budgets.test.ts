/**
 * 10k-task matrix / analytics / memory budgets (NFR-PROD-001).
 * Numbers live in docs/testing/productivity-budgets.json; this test fails them.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { defaultPlacementContext, placeItem, projectProductivityFigures } from './index.js';

const budgets = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/testing/productivity-budgets.json'),
    'utf8',
  ),
);

const STATUSES = ['inbox', 'next', 'doing', 'waiting', 'done', 'dropped'] as const;

function syntheticTasks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    title: `Perf task ${i}`,
    status: STATUSES[i % STATUSES.length] ?? 'inbox',
    completed_at: STATUSES[i % STATUSES.length] === 'done' ? '2026-09-01T00:00:00.000Z' : null,
    created_at: '2026-08-01T00:00:00.000Z',
    effort_min: 30,
    follow_up: null,
    due: i % 4 === 0 ? '2026-09-01' : null,
    target: i % 5 === 0 ? '2026-09-15' : null,
    scheduled: null,
    importance: (i % 7 === 0 ? 'important' : 'none') as 'important' | 'none',
    waiting_on: null,
    waiting_since: null,
    waiting_patience_days: null,
    quadrant_override: null,
    project_id: null,
    serves_goal_id: null,
    quadrant: 'eliminate' as const,
    deleted_at: null,
  }));
}

describe('productivity 10k budgets', () => {
  it('places 10,000 items inside the matrix and memory budgets', () => {
    const ctx = defaultPlacementContext({ now: '2026-09-11', timeZone: 'UTC' });
    const items = syntheticTasks(10_000).map((task) => ({
      due: task.due,
      target: task.target,
      importance: task.importance,
    }));
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    for (const item of items) placeItem(item, ctx);
    const matrixMs = performance.now() - start;
    const heapMb = (process.memoryUsage().heapUsed - beforeHeap) / (1024 * 1024);
    expect(matrixMs, `matrix ${matrixMs.toFixed(1)}ms`).toBeLessThanOrEqual(budgets.matrixInteractionMs);
    expect(heapMb, `heap Δ ${heapMb.toFixed(1)}MB`).toBeLessThanOrEqual(budgets.memoryMb);
  });

  it('projects 10,000-task analytics inside the p95 budget', () => {
    const tasks = syntheticTasks(10_000);
    const start = performance.now();
    const figures = projectProductivityFigures({
      now: '2026-09-11',
      now_instant: '2026-09-11T12:00:00.000Z',
      window_start: '2026-08-13',
      window_end: '2026-09-11',
      time_zone: 'UTC',
      tasks,
      revisions: [],
      time_entries: [],
      habit_checks: [],
      habits: [],
      goals: [],
      entities: [],
      edges: [],
      applications: [],
    });
    const ms = performance.now() - start;
    expect(figures.quadrant_balance).toBeDefined();
    expect(ms, `analytics ${ms.toFixed(1)}ms`).toBeLessThanOrEqual(budgets.analyticsP95Ms);
  });
});
