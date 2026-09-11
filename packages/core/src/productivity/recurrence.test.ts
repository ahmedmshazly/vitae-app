import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recurrenceCasesSchema } from './fixture-schemas.js';
import { nextOccurrenceAfter, nextOccurrences, parseRRule } from './recurrence.js';

function readCases() {
  const path = fileURLToPath(new URL('./__fixtures__/recurrence-cases.json', import.meta.url));
  return recurrenceCasesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

describe('nextOccurrences fixtures', () => {
  it('executes every recurrence-cases.json row', () => {
    for (const row of readCases()) {
      const dates = nextOccurrences(
        { rrule: row.input.rrule, mode: row.input.mode, exceptions: row.input.exceptions },
        row.input.from,
        row.input.count,
        { lastCompletedAt: row.input.lastCompletedAt },
      ).map((occ) => occ.date);
      expect({ id: row.id, dates }).toEqual({ id: row.id, dates: row.expected.dates });
    }
  });
});

describe('recurrence: RFC subset and modes', () => {
  it('rejects an unparseable rule rather than inventing dates', () => {
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
    expect(parseRRule('BYDAY=MO')).toBeNull();
    expect(
      nextOccurrences({ rrule: 'FREQ=HOURLY', mode: 'fixed', exceptions: [] }, '2026-09-07', 3),
    ).toEqual([]);
  });

  it('skips 29 February in common years', () => {
    const dates = nextOccurrences(
      { rrule: 'FREQ=YEARLY', mode: 'fixed', exceptions: [] },
      '2024-02-29',
      2,
    ).map((occ) => occ.date);
    expect(dates).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('from_completion without lastCompletedAt starts at from', () => {
    const dates = nextOccurrences(
      { rrule: 'FREQ=DAILY;INTERVAL=3', mode: 'from_completion', exceptions: [] },
      '2026-09-09',
      2,
    ).map((occ) => occ.date);
    expect(dates).toEqual(['2026-09-09', '2026-09-12']);
  });

  it('nextOccurrenceAfter is strictly after from', () => {
    expect(
      nextOccurrenceAfter({ rrule: 'FREQ=DAILY', mode: 'fixed', exceptions: [] }, '2026-09-07'),
    ).toBe('2026-09-08');
    expect(
      nextOccurrenceAfter(
        { rrule: 'FREQ=WEEKLY', mode: 'from_completion', exceptions: [] },
        '2026-09-09',
        { lastCompletedAt: '2026-09-09' },
      ),
    ).toBe('2026-09-16');
  });
});
