import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NO_DATE,
  NO_DATE_MARK,
  displayTimezone,
  formatDate,
  formatDateTime,
  formatRange,
  formatRelative,
  formatTime,
  formatYear,
} from './format-date.js';

// Every case pins a locale, a timezone and a now, so the suite reads the same
// in Cairo in August as it does in Los Angeles next February.
const TOKYO = 'Asia/Tokyo';
const NEW_YORK = 'America/New_York';
const GB = { locale: 'en-GB', timeZone: TOKYO } as const;

// 2026-08-13 09:30 UTC is the same day in both zones (18:30 in Tokyo, 05:30 in
// New York), so a test that wants a day boundary uses EARLY instead.
const NOW = new Date('2026-08-13T09:30:00Z');
// 02:00 UTC is still 2026-08-12 22:00 in New York.
const EARLY = new Date('2026-08-13T02:00:00Z');

const MISSING: (string | null | undefined)[] = [null, undefined, '', '   ', 'not a date'];

// A letter, in any script. The test for "did this print a word or only
// punctuation" that still holds when the locale is not English.
const HAS_A_WORD = /\p{Letter}/u;

describe('formatDate', () => {
  it('renders a calendar date verbatim, because it carries no timezone', () => {
    // The bug dates.ts exists to fix: a plain YYYY-MM-DD run through a zone
    // renders as the day before for every reader west of the data.
    expect(formatDate('2021-03-01', { locale: 'en-GB', timeZone: NEW_YORK })).toBe('1 Mar 2021');
    expect(formatDate('2021-03-01', { locale: 'en-GB', timeZone: TOKYO })).toBe('1 Mar 2021');
  });

  it('follows the reader locale rather than printing an ISO substring', () => {
    expect(formatDate('2021-03-01', { locale: 'en-US' })).toBe('Mar 1, 2021');
    expect(formatDate('2021-03-01', { locale: 'de-DE' })).toBe('01.03.2021');
  });

  it('places an instant on the day it fell on where the reader lives', () => {
    expect(formatDate(EARLY, { locale: 'en-GB', timeZone: TOKYO })).toBe('13 Aug 2026');
    expect(formatDate(EARLY, { locale: 'en-GB', timeZone: NEW_YORK })).toBe('12 Aug 2026');
  });

  it('defaults to the timezone the app already sends to the API', () => {
    expect(formatDate(EARLY, { locale: 'en-GB' })).toBe(
      formatDate(EARLY, { locale: 'en-GB', timeZone: displayTimezone() }),
    );
  });

  it('rejects a date the calendar does not have', () => {
    expect(formatDate('2026-02-30', GB)).toBe(NO_DATE);
  });

  it('reads a padded calendar date as a calendar date, not as an instant', () => {
    expect(formatDate('  2021-03-01  ', { locale: 'en-GB', timeZone: NEW_YORK })).toBe(
      '1 Mar 2021',
    );
    expect(formatDate('  2021-03-01  ', { locale: 'en-GB', timeZone: TOKYO })).toBe('1 Mar 2021');
    // A calendar date has no clock, whitespace or not.
    expect(formatTime('  2021-03-01  ', GB)).toBe(NO_DATE);
  });
});

describe('a Date object', () => {
  // A Date is an offset from the epoch and nothing else, so it is always an
  // instant here. The module header tells callers holding a calendar date to
  // pass the YYYY-MM-DD string; these cases pin what happens when they do not,
  // so nobody discovers it on a resume instead.
  const MIDNIGHT_UTC = new Date('2021-03-01T00:00:00Z');

  it('is read as an instant, never as a zoneless calendar date', () => {
    expect(formatDate(MIDNIGHT_UTC, { locale: 'en-GB', timeZone: NEW_YORK })).toBe('28 Feb 2021');
    expect(formatDate(MIDNIGHT_UTC, { locale: 'en-GB', timeZone: TOKYO })).toBe('1 Mar 2021');
    // The same day as a string keeps its date for every reader on earth.
    expect(formatDate('2021-03-01', { locale: 'en-GB', timeZone: NEW_YORK })).toBe('1 Mar 2021');
  });

  it('has a time of day, which a calendar date does not', () => {
    expect(formatTime(MIDNIGHT_UTC, GB)).toBe('09:00');
    expect(formatTime('2021-03-01', GB)).toBe(NO_DATE);
  });
});

describe('formatDateTime', () => {
  it('gives sync and export rows a day and a clock in the reader zone', () => {
    expect(formatDateTime('2026-08-13T09:30:00Z', GB)).toBe('13 Aug 2026, 18:30');
    expect(formatDateTime('2026-08-13T09:30:00Z', { locale: 'en-GB', timeZone: NEW_YORK })).toBe(
      '13 Aug 2026, 05:30',
    );
  });

  it('does not invent a midnight for a date that has no time of day', () => {
    expect(formatDateTime('2021-03-01', GB)).toBe('1 Mar 2021');
  });
});

describe('formatTime', () => {
  it('gives the clock alone for a row that already says which day it is', () => {
    expect(formatTime('2026-08-13T09:30:00Z', GB)).toBe('18:30');
  });

  it('has nothing to show for a zoneless calendar date', () => {
    expect(formatTime('2021-03-01', GB)).toBe(NO_DATE);
  });
});

describe('formatRelative', () => {
  const rel = (value: string | Date) => formatRelative(value, { ...GB, now: NOW });
  const after = (ms: number) => new Date(NOW.getTime() + ms);

  it('names the near calendar days in words', () => {
    expect(rel('2026-08-12')).toBe('yesterday');
    expect(rel('2026-08-13')).toBe('today');
    expect(rel('2026-08-14')).toBe('tomorrow');
    expect(rel('2026-08-10')).toBe('3 days ago');
    expect(rel('2026-08-18')).toBe('in 5 days');
  });

  it('steps up to weeks, months and years as the distance grows', () => {
    expect(rel('2026-08-06')).toBe('last week');
    expect(rel('2026-08-27')).toBe('in 2 weeks');
    expect(rel('2026-09-13')).toBe('next month');
    expect(rel('2026-11-13')).toBe('in 3 months');
    expect(rel('2027-04-13')).toBe('in 8 months');
    expect(rel('2026-06-13')).toBe('2 months ago');
    expect(rel('2027-09-13')).toBe('next year');
    expect(rel('2028-08-13')).toBe('in 2 years');
  });

  it('rounds a week, a month and a year to the nearest one, not down to the last', () => {
    // Days that do not land on a multiple of their divisor, so the divisor and
    // the rounding both have to be right for these to read correctly.
    // 11 days is a week and a half, which is nearer two weeks than one.
    expect(rel('2026-08-24')).toBe('in 2 weeks');
    expect(rel('2026-08-02')).toBe('2 weeks ago');
    // 25 days, nearer four weeks than three.
    expect(rel('2026-09-07')).toBe('in 4 weeks');
    // 76 days is 2.50 mean months and 2.53 thirty-day months, so a month of
    // exactly 30 days would print three.
    expect(rel('2026-10-28')).toBe('in 2 months');
    expect(rel('2026-05-29')).toBe('2 months ago');
    // 107 days, nearer four months than three.
    expect(rel('2026-11-28')).toBe('in 4 months');
    // 500 days is 1.37 mean years; a shorter year would print two.
    expect(rel('2027-12-26')).toBe('next year');
    // 550 days, nearer two years than one.
    expect(rel('2028-02-14')).toBe('in 2 years');
  });

  it('measures anything inside a day in elapsed time, not calendar days', () => {
    expect(rel(after(-30_000))).toBe('30 seconds ago');
    expect(rel(after(5 * 60_000))).toBe('in 5 minutes');
    expect(rel(after(-3 * 3_600_000))).toBe('3 hours ago');
  });

  it('steps up a unit at its boundary rather than printing 60 minutes', () => {
    // 59.7 seconds rounds to 60, which is not a number of seconds anyone says
    // out loud. Same for 59.7 minutes and 23.7 hours: each has to become one of
    // the next unit up, and 23.7 hours is a calendar day away.
    expect(rel(after(59_700))).toBe('in 1 minute');
    expect(rel(after(-59_700))).toBe('1 minute ago');
    expect(rel(after(59.7 * 60_000))).toBe('in 1 hour');
    expect(rel(after(-59.7 * 60_000))).toBe('1 hour ago');
    expect(rel(after(23.7 * 3_600_000))).toBe('tomorrow');
    expect(rel(after(-23.7 * 3_600_000))).toBe('yesterday');
  });

  it('counts a year below 100 as itself, not as the same year in the 1900s', () => {
    // Date.UTC reads a year from 0 to 99 as 1900 plus it, so an instant this
    // old would read as 27 years old rather than 19 centuries. parseIsoDate
    // rejects a bare 0099-06-01, so only the instant path can get here.
    expect(rel('0099-06-01T00:00:00Z')).toBe('1,927 years ago');
  });

  it('reads today from where the reader is, not from UTC', () => {
    // At 02:00 UTC it is already the 13th in Tokyo and still the 12th in New
    // York, so the same stored day is "today" for one reader and "tomorrow"
    // for the other.
    expect(formatRelative('2026-08-13', { locale: 'en-GB', timeZone: TOKYO, now: EARLY })).toBe(
      'today',
    );
    expect(formatRelative('2026-08-13', { locale: 'en-GB', timeZone: NEW_YORK, now: EARLY })).toBe(
      'tomorrow',
    );
  });
});

describe('formatRelative across a daylight-saving change', () => {
  // Node re-reads process.env.TZ on every Date operation, so pinning it is what
  // makes this case run the same here as on CI, which is UTC and therefore
  // never moves its clocks. Without the pin a day count taken from local Dates
  // passes for the wrong reason everywhere the suite actually runs.
  beforeEach(() => {
    vi.stubEnv('TZ', NEW_YORK);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('counts a daylight-saving day as one day', () => {
    // New York moves its clocks on 2026-03-08. The span is 2 days, not 1.96.
    expect(
      formatRelative('2026-03-09', {
        locale: 'en-GB',
        timeZone: NEW_YORK,
        now: new Date('2026-03-07T17:00:00Z'),
      }),
    ).toBe('in 2 days');
  });

  it('counts the same span the same way from anywhere, clocks moving or not', () => {
    const span = (timeZone: string) =>
      formatRelative('2026-03-09', {
        locale: 'en-GB',
        timeZone,
        now: new Date('2026-03-07T17:00:00Z'),
      });
    // 2026-03-07 17:00 UTC is the 7th in New York and the 8th in Tokyo, which
    // does not move its clocks at all.
    expect(span(NEW_YORK)).toBe('in 2 days');
    expect(span(TOKYO)).toBe('tomorrow');
  });
});

describe('formatYear', () => {
  it('reads the year of a calendar date and of an instant', () => {
    expect(formatYear('2021-03-01')).toBe('2021');
    expect(formatYear('2026-08-13T09:30:00Z', { timeZone: TOKYO })).toBe('2026');
  });

  it('takes the year from the reader zone, not from UTC', () => {
    // 2027-01-01 00:30 UTC is still 2026 in New York.
    expect(formatYear('2027-01-01T00:30:00Z', { timeZone: NEW_YORK })).toBe('2026');
  });

  it('pads a year below 1000 instead of printing a truncated key', () => {
    // Intl writes this year as "999", and a fixed-width read of an unpadded
    // key returns "999-", which is not a year and not the empty value either.
    expect(formatYear('0999-01-01')).toBe('0999');
    expect(formatYear('0999-01-01')).not.toContain('-');
    expect(formatRange('0999-01-01', '2024-06-30')).toBe('0999 to 2024');
  });
});

describe('formatRange', () => {
  it('says a span the caller calls current runs to now, never to a missing value', () => {
    expect(formatRange('2021-03-01', null, { current: true })).toBe('2021 to now');
    expect(formatRange('2021-03-01', undefined, { current: true })).toBe('2021 to now');
    expect(formatRange('2021-03-01', null, { current: true })).not.toContain('null');
    expect(formatRange('2021-03-01', null, { current: true })).not.toContain(NO_DATE);
  });

  it('joins a closed span and collapses one that opens and closes in a year', () => {
    expect(formatRange('2021-03-01', '2024-06-30')).toBe('2021 to 2024');
    expect(formatRange('2021-03-01', '2021-11-30')).toBe('2021');
  });

  it('handles a span whose start was never recorded', () => {
    expect(formatRange(null, '2024-06-30')).toBe('until 2024');
    expect(formatRange(null, null)).toBe(NO_DATE);
  });

  it('does not call a span current just because its end date is missing', () => {
    // "still going" and "over, but nobody wrote down when" look identical in
    // the data, and only one of them is safe to print on a resume. The graph
    // keeps is_current beside end_date for exactly this reason.
    expect(formatRange('2021-03-01', null)).toBe('2021');
    expect(formatRange('2021-03-01', null)).not.toContain('now');
    expect(formatRange('2021-03-01', 'not a date')).toBe('2021');
    expect(formatRange('2021-03-01', 'not a date')).not.toContain('now');
    expect(formatRange('2021-03-01', null, { current: false })).toBe('2021');
  });

  it('prefers a recorded end date over the current flag', () => {
    expect(formatRange('2021-03-01', '2024-06-30', { current: true })).toBe('2021 to 2024');
  });

  it('reads the two sides as dates, not as strings compared to the empty value', () => {
    // A caller whose empty value happens to read like a year used to change the
    // shape of the answer: this returned "2024" rather than "until 2024".
    expect(formatRange(null, '2024-06-30', { empty: '2024' })).toBe('until 2024');
    expect(formatRange('2021-03-01', '2024-06-30', { empty: '2024' })).toBe('2021 to 2024');
    expect(formatRange('2024-01-01', null, { empty: '2024', current: true })).toBe('2024 to now');
    expect(formatRange(null, null, { empty: '2024' })).toBe('2024');
  });
});

describe('the empty value', () => {
  it('never throws and never prints Invalid Date', () => {
    for (const value of MISSING) {
      expect(formatDate(value)).toBe(NO_DATE);
      expect(formatDateTime(value)).toBe(NO_DATE);
      expect(formatTime(value)).toBe(NO_DATE);
      expect(formatRelative(value, { now: NOW })).toBe(NO_DATE);
      expect(formatYear(value)).toBe(NO_DATE);
      expect(formatRange(value, value)).toBe(NO_DATE);
    }
    expect(formatDate(new Date(Number.NaN))).toBe(NO_DATE);
  });

  it('defaults to a word, because a lone mark announces as nothing', () => {
    // IDENTITY.md non-negotiable 6: every state ships a glyph and a word. The
    // default has to be the one that is safe as a whole accessible name,
    // because the caller who forgets to choose is the caller being protected.
    expect(NO_DATE).toMatch(HAS_A_WORD);
    expect(formatDate(null)).toMatch(HAS_A_WORD);
    expect(formatRelative(null, { now: NOW })).toMatch(HAS_A_WORD);
    expect(formatRange(null, null)).toMatch(HAS_A_WORD);
  });

  it('offers the typographic mark as an opt in for a labelled column', () => {
    expect(NO_DATE_MARK).not.toMatch(HAS_A_WORD);
    expect(formatDate(null, { empty: NO_DATE_MARK })).toBe(NO_DATE_MARK);
    expect(formatRange(null, null, { empty: NO_DATE_MARK })).toBe(NO_DATE_MARK);
  });

  it('can be given any word, for when the result is a whole accessible name', () => {
    expect(formatDate(null, { empty: 'not recorded' })).toBe('not recorded');
    expect(formatRange(null, null, { empty: 'not recorded' })).toBe('not recorded');
    expect(formatRange(null, '2024-06-30', { empty: 'not recorded' })).toBe('until 2024');
  });
});

describe('displayTimezone', () => {
  it('repeats the rule api.ts uses for the x-vitae-tz header', () => {
    expect(displayTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    expect(displayTimezone()).not.toBe('');
  });
});
