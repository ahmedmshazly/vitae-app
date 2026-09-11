import fc from 'fast-check';
import { describe, it } from 'vitest';
import { isValidDateOnly } from './calendar.js';
import { parseCapture } from './capture.js';
import { dependsOnCycle } from './dependencies.js';
import { defaultPlacementContext, placeItem } from './placement.js';
import { projectCompletions } from './analytics/index.js';
import { nextOccurrenceAfter, nextOccurrences } from './recurrence.js';

const dateOnly = fc
  .tuple(
    fc.integer({ min: 2000, max: 2035 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(
    ([year, month, day]) =>
      `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );

describe('property: invalid dates rejected', () => {
  it('iso-looking garbage is not a valid calendar date', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('2026-13-01', '2026-02-31', '2026-00-10', '2026-09-04T12:00:00.000Z', 'nope'),
        (value) => !isValidDateOnly(value),
      ),
      { numRuns: 20 },
    );
  });

  it('placeItem throws on invalid due / target', () => {
    const ctx = defaultPlacementContext({ now: '2026-09-04' });
    fc.assert(
      fc.property(fc.constantFrom('2026-02-31', 'not-a-date', '2026-13-40'), (due) => {
        try {
          placeItem({ due, importance: 'none' }, ctx);
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
      { numRuns: 20 },
    );
  });

  it('capture leaves an invalid due token in the title', () => {
    fc.assert(
      fc.property(fc.constantFrom('2026-13-40', '2026-02-31'), (stamp) => {
        const parsed = parseCapture(`Note due ${stamp}`, { now: '2026-09-04', timeZone: 'UTC' });
        return parsed.fields.due === undefined && parsed.title.includes(stamp);
      }),
      { numRuns: 20 },
    );
  });
});

describe('property: DST calendar due does not shift', () => {
  it('the same calendar due classifies the same around the New York offset change', () => {
    const due = '2026-03-08';
    const before = placeItem(
      { due, importance: 'none' },
      defaultPlacementContext({
        now: '2026-03-07',
        timeZone: 'America/New_York',
        urgencyWindowDays: 7,
      }),
    );
    const after = placeItem(
      { due, importance: 'none' },
      defaultPlacementContext({
        now: '2026-03-09',
        timeZone: 'America/New_York',
        urgencyWindowDays: 7,
      }),
    );
    if (before.reason !== 'due_within_window') throw new Error(before.reason);
    if (after.reason !== 'due_past') throw new Error(after.reason);

    fc.assert(
      fc.property(dateOnly, fc.constantFrom('America/New_York', 'UTC', 'Africa/Cairo'), (day, tz) => {
        const sameDay = placeItem(
          { due: day, importance: 'none' },
          defaultPlacementContext({ now: day, timeZone: tz, urgencyWindowDays: 7 }),
        );
        return sameDay.reason === 'due_past';
      }),
      { numRuns: 80 },
    );
  });
});

describe('property: recurrence next is strictly after', () => {
  it('nextOccurrenceAfter is after from, and from_completion after lastCompletedAt', () => {
    fc.assert(
      fc.property(dateOnly, (from) => {
        const next = nextOccurrenceAfter(
          { rrule: 'FREQ=DAILY', mode: 'fixed', exceptions: [] },
          from,
        );
        return next !== null && next > from;
      }),
      { numRuns: 80 },
    );

    fc.assert(
      fc.property(dateOnly, (completed) => {
        const dates = nextOccurrences(
          { rrule: 'FREQ=WEEKLY', mode: 'from_completion', exceptions: [] },
          completed,
          3,
          { lastCompletedAt: completed },
        );
        return dates.length > 0 && dates.every((occ) => occ.date > completed);
      }),
      { numRuns: 80 },
    );
  });
});

describe('property: dependsOnCycle', () => {
  it('detects a 3-cycle and accepts a chain DAG', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 3, maxLength: 8 }), (ids) => {
        const [a, b, c] = ids;
        if (!a || !b || !c) return false;
        const cyclic = dependsOnCycle([
          { src: a, dst: b },
          { src: b, dst: c },
          { src: c, dst: a },
        ]);
        const dag = dependsOnCycle([
          { src: a, dst: b },
          { src: b, dst: c },
        ]);
        return cyclic && !dag;
      }),
      { numRuns: 60 },
    );
  });
});

describe('property: placement override beats a past due', () => {
  it('placed_by_you wins over due_past', () => {
    fc.assert(
      fc.property(dateOnly, dateOnly, (now, setAt) => {
        const due = now;
        const placed = placeItem(
          {
            due,
            importance: 'critical',
            quadrant_override: { quadrant: 'eliminate', set_at: setAt },
          },
          defaultPlacementContext({ now, urgencyWindowDays: 7 }),
        );
        return placed.quadrant === 'eliminate' && placed.reason === 'placed_by_you';
      }),
      { numRuns: 80 },
    );
  });
});

describe('property: analytics reconstruction is idempotent', () => {
  it('the same revisions project the same DTO twice', () => {
    const input = {
      now: '2026-09-04',
      window_start: '2026-08-29',
      window_end: '2026-09-04',
      time_zone: 'Africa/Cairo',
      item: { id: 't1', status: 'done' as const, completed_at: '2026-09-03T15:00:00.000Z' },
      revisions: [
        {
          rev: 1,
          op: 'create' as const,
          at: '2026-08-20T09:00:00.000Z',
          diff: { status: 'inbox', completed_at: null },
        },
        {
          rev: 2,
          op: 'update' as const,
          at: '2026-09-03T15:00:00.000Z',
          diff: { status: 'done', completed_at: '2026-09-03T15:00:00.000Z' },
        },
      ],
    };
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), () => {
        return JSON.stringify(projectCompletions(input)) === JSON.stringify(projectCompletions(input));
      }),
      { numRuns: 20 },
    );
  });
});
