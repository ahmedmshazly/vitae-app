import { describe, expect, it } from 'vitest';
import { flattenAnalyticsDiff, toWorkspaceRevision } from './revisions.js';
import { reviewBullets } from './review.js';
import {
  parseAnalyticsWindowDays,
  projectApplicationFunnel,
  projectByEntity,
  projectEstimatesVsActuals,
  projectGoals,
  projectHabits,
  projectProductivityFigures,
  projectQuadrantBalance,
  projectTimeSpent,
  projectUrgencyCreep,
  projectWaiting,
  projectWorkspaceThroughput,
  windowBounds,
} from './workspace.js';
import type { AnalyticsTask, WorkspaceAnalyticsInput, WorkspaceRevision } from './types.js';

const WINDOW = {
  now: '2026-09-11',
  window_start: '2026-08-13',
  window_end: '2026-09-11',
  time_zone: 'Africa/Cairo',
};

function rev(
  subject_id: string,
  rev: number,
  at: string,
  diff: Record<string, string | number | null>,
  op: WorkspaceRevision['op'] = rev === 1 ? 'create' : 'update',
): WorkspaceRevision {
  return { subject_id, rev, op, at, diff };
}

function task(partial: Partial<AnalyticsTask> & Pick<AnalyticsTask, 'id'>): AnalyticsTask {
  return {
    status: 'inbox',
    ...partial,
  };
}

function input(over: Partial<WorkspaceAnalyticsInput> = {}): WorkspaceAnalyticsInput {
  return {
    ...WINDOW,
    tasks: [],
    revisions: [],
    time_entries: [],
    habit_checks: [],
    habits: [],
    goals: [],
    entities: [],
    edges: [],
    applications: [],
    ...over,
  };
}

describe('windowBounds', () => {
  it('cuts an inclusive 30-day window ending on now', () => {
    expect(windowBounds('2026-09-11', 'UTC', 30)).toEqual({
      window_start: '2026-08-13',
      window_end: '2026-09-11',
    });
    expect(parseAnalyticsWindowDays('90')).toBe(90);
    expect(parseAnalyticsWindowDays('nope')).toBe(30);
  });
});

describe('projectProductivityFigures', () => {
  it('is deterministic across twin runs', () => {
    const snapshot = input({
      tasks: [
        task({
          id: 't1',
          status: 'done',
          completed_at: '2026-09-03T15:00:00.000Z',
          importance: 'important',
          due: '2026-09-10',
        }),
      ],
      revisions: [
        rev('t1', 1, '2026-08-20T09:00:00.000Z', { status: 'inbox', completed_at: null }),
        rev('t1', 2, '2026-09-03T15:00:00.000Z', {
          status: 'done',
          completed_at: '2026-09-03T15:00:00.000Z',
        }),
      ],
    });
    const first = projectProductivityFigures(snapshot);
    const second = projectProductivityFigures(snapshot);
    expect(second).toEqual(first);
    expect(first.throughput.total).toBe(1);
    expect(first.quadrant_balance.do).toBe(1);
  });

  it('buckets a DST-boundary completion on the local calendar day', () => {
    // 2026-03-08T04:30:00.000Z is 2026-03-07 23:30 in America/New_York.
    const instant = '2026-03-08T04:30:00.000Z';
    const revisions = [
      rev('t1', 1, '2026-03-01T12:00:00.000Z', { status: 'inbox' }),
      rev('t1', 2, instant, { status: 'done', completed_at: instant }),
    ];
    const item = task({ id: 't1', status: 'done', completed_at: instant });
    const utc = projectWorkspaceThroughput(
      input({
        now: '2026-03-08',
        window_start: '2026-03-08',
        window_end: '2026-03-08',
        time_zone: 'UTC',
        tasks: [item],
        revisions,
      }),
    );
    const ny = projectWorkspaceThroughput(
      input({
        now: '2026-03-08',
        window_start: '2026-03-08',
        window_end: '2026-03-08',
        time_zone: 'America/New_York',
        tasks: [item],
        revisions,
      }),
    );
    expect(utc.total).toBe(1);
    expect(utc.by_day).toEqual([{ period: '2026-03-08', count: 1 }]);
    expect(ny.total).toBe(0);
    expect(ny.by_day).toEqual([]);
  });

  it('declares unknown when revisions are empty and sparse when diffs are empty', () => {
    const unknown = projectWorkspaceThroughput(
      input({
        tasks: [task({ id: 'orphan', status: 'done', completed_at: '2026-09-01T00:00:00.000Z' })],
        revisions: [],
      }),
    );
    expect(unknown).toMatchObject({ total: 0, history_completeness: 'unknown' });

    const sparse = projectWorkspaceThroughput(
      input({
        tasks: [task({ id: 'imported', status: 'done', completed_at: '2026-08-15T12:00:00.000Z' })],
        revisions: [rev('imported', 1, '2026-08-20T09:00:00.000Z', {}, 'create')],
      }),
    );
    expect(sparse.history_completeness).toBe('sparse');
    expect(sparse.total).toBe(0);
  });

  it('omits a sensitive task that the caller already filtered out', () => {
    const visible = task({
      id: 'public',
      status: 'next',
      importance: 'important',
      due: '2026-09-11',
    });
    const hidden = task({
      id: 'secret',
      status: 'next',
      importance: 'important',
      due: '2026-09-11',
    });
    const withSecret = projectQuadrantBalance(input({ tasks: [visible, hidden] }));
    const filtered = projectQuadrantBalance(input({ tasks: [visible] }));
    expect(withSecret.do).toBe(2);
    expect(filtered.do).toBe(1);
  });
});

describe('projectUrgencyCreep', () => {
  it('counts an item whose urgency reason appeared after create, not one created urgent', () => {
    const createdUrgent = projectUrgencyCreep(
      input({
        tasks: [task({ id: 'u1', due: '2026-09-10', status: 'next' })],
        revisions: [rev('u1', 1, '2026-09-10T09:00:00.000Z', { status: 'inbox', due: '2026-09-10' })],
      }),
    );
    expect(createdUrgent.count).toBe(0);
    expect(createdUrgent.history_completeness).toBe('complete');

    const crept = projectUrgencyCreep(
      input({
        tasks: [task({ id: 'u2', due: '2026-09-01', status: 'next' })],
        revisions: [
          rev('u2', 1, '2026-08-20T09:00:00.000Z', { status: 'inbox' }),
          rev('u2', 2, '2026-09-01T09:00:00.000Z', { due: '2026-09-01' }),
        ],
      }),
    );
    expect(crept.count).toBe(1);
  });

  it('does not invent creep when history is unknown', () => {
    const figure = projectUrgencyCreep(
      input({ tasks: [task({ id: 'u3', due: '2026-09-01', status: 'next' })], revisions: [] }),
    );
    expect(figure).toMatchObject({ count: 0, history_completeness: 'unknown' });
  });

  it('counts only the first urgent instant inside the requested window', () => {
    const tasks = [task({ id: 'u4', due: '2026-07-20', status: 'next' })];
    const revisions = [
      rev('u4', 1, '2026-07-01T09:00:00.000Z', { status: 'inbox' }),
      rev('u4', 2, '2026-07-20T09:00:00.000Z', { due: '2026-07-20' }),
    ];
    const short = projectUrgencyCreep(input({ tasks, revisions }));
    const long = projectUrgencyCreep(
      input({
        window_start: '2026-06-14',
        tasks,
        revisions,
      }),
    );
    expect(short.count).toBe(0);
    expect(long.count).toBe(1);
  });

  it('does not treat out-of-window calendar aging as creep', () => {
    const figure = projectUrgencyCreep(
      input({
        tasks: [task({ id: 'u5', due: '2026-07-20', status: 'next' })],
        revisions: [rev('u5', 1, '2026-07-01T09:00:00.000Z', { status: 'inbox', due: '2026-07-20' })],
      }),
    );
    expect(figure.count).toBe(0);
  });
});

describe('estimates, time, waiting, habits, goals, edges', () => {
  it('omits estimate rows when either side is missing', () => {
    const figure = projectEstimatesVsActuals(
      input({
        tasks: [
          task({ id: 'has-both', effort_min: 30 }),
          task({ id: 'no-actual', effort_min: 15 }),
          task({ id: 'no-estimate' }),
        ],
        time_entries: [
          { id: 'e1', task_id: 'has-both', started_at: '2026-09-10T08:00:00.000Z', duration_sec: 1800 },
          { id: 'e2', task_id: 'no-estimate', started_at: '2026-09-10T08:00:00.000Z', duration_sec: 60 },
        ],
      }),
    );
    expect(figure.rows).toEqual([{ task_id: 'has-both', effort_min: 30, actual_sec: 1800 }]);
  });

  it('sums time spent for entries that start in the window', () => {
    const figure = projectTimeSpent(
      input({
        time_entries: [
          { id: 'in', task_id: 't1', started_at: '2026-09-10T08:00:00.000Z', duration_sec: 120 },
          { id: 'out', task_id: 't1', started_at: '2026-07-01T08:00:00.000Z', duration_sec: 999 },
        ],
      }),
    );
    expect(figure).toMatchObject({ total_seconds: 120, by_task: [{ task_id: 't1', seconds: 120 }] });
  });

  it('counts waiting tasks and follow-up dates that are past', () => {
    const figure = projectWaiting(
      input({
        tasks: [
          task({ id: 'w1', status: 'waiting', follow_up: '2026-09-01' }),
          task({ id: 'w2', status: 'next', follow_up: '2026-09-20' }),
        ],
      }),
    );
    expect(figure).toMatchObject({ waiting: 1, overdue_follow_up: 1 });
  });

  it('counts habit checks in the window', () => {
    const figure = projectHabits(
      input({
        habits: [{ id: 'h1', title: 'Write' }],
        habit_checks: [
          { habit_id: 'h1', date: '2026-09-10' },
          { habit_id: 'h1', date: '2026-09-11' },
          { habit_id: 'h1', date: '2026-07-01' },
        ],
      }),
    );
    expect(figure.total_checks).toBe(2);
    expect(figure.by_habit[0]).toMatchObject({ habit_id: 'h1', title: 'Write', checks: 2 });
  });

  it('counts live SERVES_GOAL edges and ignores a deleted link the caller omitted', () => {
    const withEdge = projectGoals(
      input({
        tasks: [task({ id: 't1', status: 'next' })],
        goals: [{ id: 'g1', title: 'Ship' }],
        edges: [{ type: 'SERVES_GOAL', src: 't1', dst: 'g1' }],
      }),
    );
    const without = projectGoals(
      input({
        tasks: [task({ id: 't1', status: 'next' })],
        goals: [{ id: 'g1', title: 'Ship' }],
        edges: [],
      }),
    );
    expect(withEdge.rows).toEqual([{ goal_id: 'g1', title: 'Ship', tasks: 1 }]);
    expect(without.rows).toEqual([{ goal_id: 'g1', title: 'Ship', tasks: 0 }]);
  });

  it('counts WAITING_ON and FOR edges by person or organization', () => {
    const figure = projectByEntity(
      input({
        tasks: [task({ id: 't1', status: 'waiting' }), task({ id: 't2', status: 'next' })],
        entities: [{ id: 'p1', title: 'Ada' }],
        edges: [
          { type: 'WAITING_ON', src: 't1', dst: 'p1' },
          { type: 'FOR', src: 't2', dst: 'p1' },
        ],
      }),
    );
    expect(figure.rows).toEqual([{ entity_id: 'p1', title: 'Ada', waiting_on: 1, for: 1 }]);
  });

  it('declares application funnel completeness from revisions', () => {
    const unknown = projectApplicationFunnel(
      input({ applications: [{ id: 'a1', status: 'applied' }], revisions: [] }),
    );
    expect(unknown.history_completeness).toBe('unknown');
    expect(unknown.rows.find((row) => row.stage === 'applied')?.count).toBe(1);

    const complete = projectApplicationFunnel(
      input({
        applications: [{ id: 'a1', status: 'applied' }],
        revisions: [rev('a1', 1, '2026-09-01T12:00:00.000Z', { status: 'applied' })],
      }),
    );
    expect(complete.history_completeness).toBe('complete');
  });
});

describe('reviewBullets', () => {
  it('states facts without scores or shame language', () => {
    const figures = projectProductivityFigures(
      input({
        tasks: [
          task({
            id: 't1',
            status: 'done',
            completed_at: '2026-09-03T15:00:00.000Z',
            follow_up: '2026-09-01',
          }),
        ],
        revisions: [
          rev('t1', 1, '2026-08-20T09:00:00.000Z', { status: 'inbox' }),
          rev('t1', 2, '2026-09-03T15:00:00.000Z', {
            status: 'done',
            completed_at: '2026-09-03T15:00:00.000Z',
          }),
        ],
      }),
    );
    const text = reviewBullets(figures).bullets.join('\n');
    expect(text).toMatch(/1 task completed/);
    expect(text).toMatch(/follow-up date is past/);
    expect(text).not.toMatch(/score|shame|slipped/i);
  });

  it('does not state an unmeasured throughput total as a fact', () => {
    const figures = projectProductivityFigures(
      input({
        tasks: [task({ id: 'orphan', status: 'done', completed_at: '2026-09-01T00:00:00.000Z' })],
      }),
    );
    expect(figures.throughput.history_completeness).toBe('unknown');
    expect(reviewBullets(figures).bullets.join('\n')).not.toMatch(/task completed|tasks completed/);
  });
});

describe('flattenAnalyticsDiff', () => {
  it('reads Vitae props.to diffs and create snapshots', () => {
    expect(
      flattenAnalyticsDiff({ 'props.status': { from: 'inbox', to: 'done' }, rev: { from: 1, to: 2 } }),
    ).toEqual({ status: 'done' });
    expect(
      flattenAnalyticsDiff(undefined, { props: { status: 'inbox', due: '2026-09-01' } }, 'create'),
    ).toEqual({ status: 'inbox', due: '2026-09-01' });
    expect(
      toWorkspaceRevision({
        subject_id: 't1',
        rev: 1,
        op: 'create',
        at: '2026-08-20T09:00:00.000Z',
        snapshot: { props: { status: 'inbox' } },
      }),
    ).toMatchObject({ subject_id: 't1', diff: { status: 'inbox' }, inferred: true });
  });

  it('does not count a snapshot-only create of a done task as a completion', () => {
    const mapped = toWorkspaceRevision({
      subject_id: 'imported',
      rev: 1,
      op: 'create',
      at: '2026-08-20T09:00:00.000Z',
      diff: undefined,
      snapshot: { props: { status: 'done', completed_at: '2026-08-15T12:00:00.000Z' } },
    });
    expect(mapped).not.toBeNull();
    const figure = projectWorkspaceThroughput(
      input({
        tasks: [task({ id: 'imported', status: 'done', completed_at: '2026-08-15T12:00:00.000Z' })],
        revisions: [mapped!],
      }),
    );
    expect(figure.history_completeness).toBe('sparse');
    expect(figure.total).toBe(0);
  });
});
