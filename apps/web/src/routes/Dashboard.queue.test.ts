/**
 * The two pure pieces of Today: the queue that decides what "needs you" and in
 * what order, and the register rule's weekday ticks. Both are date-sensitive,
 * so the clock is frozen rather than left to whatever day CI runs on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQueue, weekTicks } from './Dashboard.js';

// 2026-08-07 is a Friday. Local midnight, because every date the queue reads is
// a plain calendar date and the app compares them in the user's own timezone.
const FRIDAY = new Date(2026, 7, 7, 9, 0, 0);

type Data = Parameters<typeof buildQueue>[0];

function dashboard(over: Partial<Data> = {}): Data {
  return {
    reminders: [],
    reconnect: [],
    pipeline: [],
    pipelineCounts: {},
    habits: [],
    recent: [],
    resumes: 0,
    focus: { tasks: [], goals: [] },
    upcoming: [],
    setup: { self: true, github: true, people: true, interactions: true, atoms: true, resume: true, done: 6, total: 6 },
    insights: {
      momentum: { score: 0, hint: '', factors: [] },
      funnel: {},
      relationships: { total: 0, healthy: 0, drifting: 0 },
      skills: { total: 0, covered: 0 },
    },
    stats: { nodes: 0, byType: {} },
    counts: { nodes: 0, edges: 0, people: 0, atoms: 0 },
    ...over,
  } as Data;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FRIDAY);
});
afterEach(() => vi.useRealTimers());

describe('buildQueue', () => {
  it('orders by how overdue an item is, latest first', () => {
    const queue = buildQueue(
      dashboard({
        reminders: [
          { id: 'r1', note: 'due today', due_on: '2026-08-07', subject_id: 's1' },
          { id: 'r2', note: 'a week late', due_on: '2026-07-31', subject_id: 's2' },
        ],
        focus: {
          tasks: [{ id: 't1', title: 'three days late', due: '2026-08-04', priority: null, status: 'inbox' }],
          goals: [],
        },
      }),
    );
    expect(queue.map((q) => q.title)).toEqual(['a week late', 'three days late', 'due today']);
    expect(queue.map((q) => q.when)).toEqual(['7d overdue', '3d overdue', 'due today']);
  });

  it('keeps an undated task above anything still ahead but below anything late', () => {
    const queue = buildQueue(
      dashboard({
        focus: {
          tasks: [
            { id: 't1', title: 'undated', due: null, priority: null, status: 'inbox' },
            { id: 't2', title: 'late', due: '2026-08-05', priority: null, status: 'inbox' },
            { id: 't3', title: 'ahead', due: '2026-08-09', priority: null, status: 'inbox' },
          ],
          goals: [],
        },
      }),
    );
    expect(queue.map((q) => q.title)).toEqual(['late', 'undated', 'ahead']);
    expect(queue.map((q) => q.when)).toEqual(['2d overdue', 'no date', 'in 2d']);
  });

  it('admits a deadline inside the horizon and drops one beyond it', () => {
    const queue = buildQueue(
      dashboard({
        upcoming: [
          { id: 'a1', type: 'application', title: 'closes in 5 days', date: '2026-08-12', label: 'deadline' },
          { id: 'a2', type: 'application', title: 'closes in 5 weeks', date: '2026-09-11', label: 'deadline' },
        ],
      }),
    );
    expect(queue.map((q) => q.title)).toEqual(['closes in 5 days']);
  });

  it('ignores upcoming rows that are not asks', () => {
    const queue = buildQueue(
      dashboard({
        upcoming: [
          { id: 'e1', type: 'event', title: 'a talk', date: '2026-08-08', label: 'event' },
          { id: 'n1', type: 'role', title: 'started here', date: '2026-08-07', label: '3y ago today' },
        ],
      }),
    );
    expect(queue).toEqual([]);
  });

  it('carries the reminder id so only reminders get a Done control', () => {
    const queue = buildQueue(
      dashboard({
        reminders: [{ id: 'r1', note: 'ping Sam', due_on: '2026-08-07', subject_id: 's1' }],
        focus: { tasks: [{ id: 't1', title: 'a task', due: '2026-08-07', priority: null, status: 'inbox' }], goals: [] },
      }),
    );
    expect(queue.find((q) => q.title === 'ping Sam')?.reminderId).toBe('r1');
    expect(queue.find((q) => q.title === 'a task')?.reminderId).toBeUndefined();
  });
});

describe('weekTicks', () => {
  it('reads Monday-first, so Friday is the fifth tick', () => {
    const { ticks, index } = weekTicks('2026-08-07');
    expect(ticks).toHaveLength(7);
    expect(index).toBe(4);
    expect(ticks[index].label).toBe('Friday');
  });

  it('puts Sunday last rather than first', () => {
    expect(weekTicks('2026-08-09').index).toBe(6);
    expect(weekTicks('2026-08-03').index).toBe(0);
  });

  it('places every tick strictly inside the rule', () => {
    for (const t of weekTicks('2026-08-07').ticks) {
      expect(t.at).toBeGreaterThan(0);
      expect(t.at).toBeLessThan(1);
    }
  });
});
