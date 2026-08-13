/**
 * One way to show a date.
 *
 * Before this module every displayed date in the app was a raw ISO substring:
 * `str.slice(0, 10)` in a dozen files, `slice(0, 19).replace('T', ' ')` on the
 * record audit trail, and three separate copies of the same
 * `slice(0, 16).replace('T', ' ')` for "last synced". That prints a UTC instant
 * to a reader who lives somewhere else, it never says "yesterday", and when the
 * value is missing it prints "undefined" or an empty cell.
 *
 * Everything here goes through `Intl`, so the day, the month name, the clock
 * and the relative phrase all follow the reader's locale, and every function
 * takes `null` / `undefined` / a blank string / an unparseable string and
 * returns its empty value ({@link NO_DATE} by default) rather than throwing or
 * printing "Invalid Date". Unreadable and absent are deliberately the same
 * outcome everywhere, including on each side of {@link formatRange}: a value
 * nobody can read tells the reader exactly as much as a value nobody recorded.
 *
 * ## Two kinds of input, deliberately not the same thing
 *
 * - A **calendar date**, `YYYY-MM-DD`. Reminder due-dates, role start dates and
 *   moment dates are stored this way and carry no timezone at all. These are
 *   parsed through {@link parseIsoDate} from `./dates.js` and rendered verbatim:
 *   `2021-03-01` is 1 March 2021 for every reader on earth. Formatting one in a
 *   timezone would be a bug, and is the exact bug `dates.ts` was written to fix.
 * - An **instant**, a full ISO timestamp such as `2026-08-13T09:30:00Z`.
 *   `created_at`, `updated_at`, `last_sync_at` and audit rows are instants, and
 *   an instant only becomes a wall clock once you name a timezone.
 *
 * ## A `Date` is always an instant
 *
 * A `Date` object is a point on the world clock; it has no way to say "I am a
 * calendar date", so this module never guesses that it is one. `new
 * Date('2021-03-01')` is midnight UTC, which is 28 February in New York, and
 * that is what {@link formatDate} will print for it. **If you are holding a
 * calendar date, pass the `YYYY-MM-DD` string, not a `Date` built from it.**
 * `toLocalIsoDate` in `./dates.js` turns a `Date` back into that string when a
 * caller only has the object.
 *
 * ## Which timezone
 *
 * The same one the API is already told about. `lib/api.ts` sends
 * `x-vitae-tz: Intl.DateTimeFormat().resolvedOptions().timeZone` on every
 * request, so the server's idea of "today" is the browser's IANA zone;
 * {@link displayTimezone} repeats that rule (including its `|| 'UTC'` fallback)
 * so the screen agrees with the answers the server sent. It cannot be imported
 * from `api.ts`, which keeps it private, so it is restated here and the two must
 * stay in step.
 *
 * Every function takes `{ locale, timeZone, empty }`, and the relative one also
 * takes `now`, so tests can pin all four and stay green in any timezone, in any
 * locale, next week.
 */
import { parseIsoDate } from './dates.js';

/**
 * What a formatter prints when there is no date to print.
 *
 * A word, not punctuation, because this is the default and the default has to
 * be the safe one: IDENTITY.md non-negotiable 6 asks every state for a glyph
 * and a word, and a lone em dash announces as nothing at all to a screen
 * reader. Where the result is decoration inside a labelled column rather than
 * the whole of an accessible name, pass `{ empty: NO_DATE_MARK }`.
 */
export const NO_DATE = 'no date';

/**
 * The typographic stand-in for a missing date, for a dense column whose header
 * already says what the column is and whose cells are read as a group. Opt in
 * with `{ empty: NO_DATE_MARK }`; never where the cell is the whole accessible
 * name of a control or a row.
 */
export const NO_DATE_MARK = '—';

/** The word an open-ended span ends with. `e2e/tests/timeline.spec.ts` asserts it. */
export const ONGOING = 'now';

/**
 * Anything a caller might hand a formatter, including the two empty cases.
 *
 * A `Date` here always means an instant. See the module header: pass the
 * `YYYY-MM-DD` string when the value is a calendar date.
 */
export type DateInput = string | Date | null | undefined;

export interface DateFormatOptions {
  /** BCP 47 tag(s). Omitted means the runtime's own locale. */
  locale?: string | string[];
  /** IANA zone for instants. Omitted means {@link displayTimezone}. */
  timeZone?: string;
  /**
   * What to print for a missing or unparseable value. Defaults to
   * {@link NO_DATE}. Pass {@link NO_DATE_MARK} for a dash in a dense column,
   * never where the result is the whole of an accessible name.
   */
  empty?: string;
}

export interface RelativeFormatOptions extends DateFormatOptions {
  /** The instant to measure against. Defaults to `new Date()`. */
  now?: Date;
}

export interface RangeFormatOptions extends DateFormatOptions {
  /**
   * Whether the span is still running today.
   *
   * "Still running" and "over, but nobody wrote down when" are different facts,
   * and the graph stores them separately: `is_current` is its own optional
   * boolean beside `end_date`. Only `true` prints "2021 to now"; without it a
   * span with no readable end date prints its start year alone, because a
   * resume must not claim a job is current on the strength of a blank field.
   * An end date that is present and readable always wins over this flag.
   */
  current?: boolean;
}

/**
 * The browser's IANA timezone, by the same rule `lib/api.ts` uses for the
 * `x-vitae-tz` header. Exported so a screen can label a clock with the zone it
 * is showing, and so tests can assert the two agree.
 */
export function displayTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
/** Mean Gregorian month and year, used only to name a unit, never to print a date. */
const DAYS_PER_MONTH = 30.436_875;
const DAYS_PER_YEAR = 365.2425;
/** Past four weeks a reader wants "last month", not "5 weeks ago". */
const MONTHS_FROM_DAYS = 28;
/** Past ten and a half months a reader wants "last year", not "11 months ago". */
const YEARS_FROM_DAYS = 320;

interface Parsed {
  /** The moment itself. For a calendar date this is UTC midnight of that day. */
  at: Date;
  /** True when the source was `YYYY-MM-DD` and therefore has no timezone. */
  calendar: boolean;
}

/**
 * Normalise any input to a `Parsed`, or `null` when there is nothing to show.
 *
 * A calendar date is validated by `parseIsoDate` (which rejects `2026-02-30`)
 * and then anchored at UTC midnight so that rendering it with `timeZone: 'UTC'`
 * reproduces the original day in every runtime timezone.
 */
function parse(value: DateInput): Parsed | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // Never `calendar: true`. A Date carries an offset from the epoch and
    // nothing else, so calling one zoneless would move it a day for half the
    // planet. The module header says so where callers will read it.
    return Number.isNaN(value.getTime()) ? null : { at: value, calendar: false };
  }
  // Trimmed before the shape test, so a padded value still takes the calendar
  // branch. Whitespace pushes the string off the ISO fast path and into the
  // engine's legacy parser, which reads it as an instant at local midnight;
  // the same field would then be a different moment for every reader, and the
  // clock functions would start offering it a time of day it does not have.
  // A blank string falls through to `new Date('')`, an Invalid Date, and so
  // returns null like any other unreadable value.
  const text = value.trim();
  if (CALENDAR_DATE.test(text)) {
    try {
      parseIsoDate(text);
    } catch {
      return null;
    }
    const [y, m, d] = text.split('-').map(Number) as [number, number, number];
    return { at: new Date(Date.UTC(y, m - 1, d)), calendar: true };
  }
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : { at, calendar: false };
}

/** The zone a parsed value should be rendered in. Calendar dates are zoneless. */
function zoneFor(parsed: Parsed, timeZone: string | undefined): string {
  return parsed.calendar ? 'UTC' : (timeZone ?? displayTimezone());
}

function emptyOf(options: DateFormatOptions | undefined): string {
  return options?.empty ?? NO_DATE;
}

/**
 * `YYYY-MM-DD` for an instant as seen from `timeZone`.
 *
 * `year: 'numeric'` does not pad, so the year is padded here: without it the
 * year 999 yields the key `999-01-01`, and everything downstream that reads a
 * fixed-width field out of this string reads it off by one character.
 */
function zonedCalendarDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const find = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${find('year').padStart(4, '0')}-${find('month')}-${find('day')}`;
}

/**
 * Days from the epoch to a `YYYY-MM-DD`, counted on the calendar itself.
 *
 * Deliberately not `parseIsoDate`: that builds a Date in whichever zone the
 * process happens to run in, so subtracting two of them measures elapsed time
 * in that zone and a day that is 23 or 25 hours long across a daylight-saving
 * change comes out as 0.96 of a day. Placing both days at UTC midnight makes
 * every day exactly one day, so the count is exact and needs no rounding to
 * hide the drift.
 */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const at = new Date(0);
  // Not `Date.UTC`, which reads years 0 to 99 as 1900 to 1999.
  at.setUTCFullYear(y, m - 1, d);
  return at.getTime() / MS_PER_DAY;
}

/** Whole calendar days from `fromIso` to `toIso`, both `YYYY-MM-DD`. */
function calendarDaysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

/** The day, locale aware: "13 Aug 2026" in en-GB, "Aug 13, 2026" in en-US. */
export function formatDate(value: DateInput, options?: DateFormatOptions): string {
  const parsed = parse(value);
  if (!parsed) return emptyOf(options);
  return new Intl.DateTimeFormat(options?.locale, {
    dateStyle: 'medium',
    timeZone: zoneFor(parsed, options?.timeZone),
  }).format(parsed.at);
}

/**
 * The day and the time, for sync, export and audit timestamps.
 *
 * A calendar date has no time of day, so this falls back to {@link formatDate}
 * rather than inventing a midnight the data never claimed.
 */
export function formatDateTime(value: DateInput, options?: DateFormatOptions): string {
  const parsed = parse(value);
  if (!parsed) return emptyOf(options);
  if (parsed.calendar) return formatDate(value, options);
  return new Intl.DateTimeFormat(options?.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zoneFor(parsed, options?.timeZone),
  }).format(parsed.at);
}

/** Just the clock, for a row that already says which day it is. */
export function formatTime(value: DateInput, options?: DateFormatOptions): string {
  const parsed = parse(value);
  if (!parsed || parsed.calendar) return emptyOf(options);
  return new Intl.DateTimeFormat(options?.locale, {
    timeStyle: 'short',
    timeZone: zoneFor(parsed, options?.timeZone),
  }).format(parsed.at);
}

/**
 * "yesterday", "3 days ago", "in 2 weeks".
 *
 * Sub-day distances are measured in real elapsed time; anything a day or more
 * away is measured in calendar days, because "yesterday" is a question about
 * the calendar and not about the last 24 hours. Weeks, months and years are
 * named from that day count, and the unit steps up at 7 days, at
 * {@link MONTHS_FROM_DAYS} and at {@link YEARS_FROM_DAYS}.
 *
 * Every unit is chosen from the number it is about to print rather than from
 * the raw distance. Testing the distance first and rounding second lets a value
 * just inside a boundary round up out of its own unit, which is how a formatter
 * ends up saying "in 60 minutes" and "in 24 hours" instead of stepping up.
 */
export function formatRelative(value: DateInput, options?: RelativeFormatOptions): string {
  const parsed = parse(value);
  if (!parsed) return emptyOf(options);

  const now = options?.now ?? new Date();
  // "Today" is always a question about where the reader is, even when the value
  // being measured is a zoneless calendar date, so `now` is read in the display
  // zone while the target keeps whichever zone it belongs to.
  const zone = options?.timeZone ?? displayTimezone();
  const rtf = new Intl.RelativeTimeFormat(options?.locale, { numeric: 'auto' });
  const elapsed = parsed.at.getTime() - now.getTime();

  if (!parsed.calendar) {
    // Test the rounded value, not the raw elapsed. Testing `elapsed` let
    // 59.7 seconds pass the seconds gate and then round to 60, so the reader
    // was told "in 60 seconds" instead of "in 1 minute". The minute and hour
    // gates below already test their rounded value; this one did not.
    const seconds = Math.round(elapsed / MS_PER_SECOND);
    if (Math.abs(seconds) < SECONDS_PER_MINUTE) return rtf.format(seconds, 'second');
    const minutes = Math.round(elapsed / MS_PER_MINUTE);
    if (Math.abs(minutes) < MINUTES_PER_HOUR) return rtf.format(minutes, 'minute');
    const hours = Math.round(elapsed / MS_PER_HOUR);
    if (Math.abs(hours) < HOURS_PER_DAY) return rtf.format(hours, 'hour');
  }

  const days = calendarDaysBetween(
    zonedCalendarDate(now, zone),
    zonedCalendarDate(parsed.at, zoneFor(parsed, zone)),
  );
  if (Math.abs(days) < DAYS_PER_WEEK) return rtf.format(days, 'day');
  if (Math.abs(days) < MONTHS_FROM_DAYS) return rtf.format(Math.round(days / DAYS_PER_WEEK), 'week');
  if (Math.abs(days) < YEARS_FROM_DAYS) {
    return rtf.format(Math.round(days / DAYS_PER_MONTH), 'month');
  }
  return rtf.format(Math.round(days / DAYS_PER_YEAR), 'year');
}

/** The four-digit year, for a resume span. */
export function formatYear(value: DateInput, options?: DateFormatOptions): string {
  const parsed = parse(value);
  if (!parsed) return emptyOf(options);
  return yearOf(parsed, options?.timeZone);
}

/** The padded four-digit year of an already parsed value. */
function yearOf(parsed: Parsed, timeZone: string | undefined): string {
  return zonedCalendarDate(parsed.at, zoneFor(parsed, timeZone)).slice(0, 4);
}

/**
 * A span of years: "2021 to 2024", "2021" when it opens and closes in the same
 * year, and "2021 to now" for a span the caller says is still running.
 *
 * The open span is the point of the function. A role that is still going must
 * never render as "2021 to null" or as "2021 to —", so pass `{ current: true }`
 * and it renders as "2021 to now"; `e2e/tests/timeline.spec.ts` asserts the
 * literal words "to now". A missing end date on its own is not that claim,
 * because a job that ended in a year nobody recorded looks exactly the same in
 * the data, so without the flag the span prints its start year alone.
 *
 * The two sides are parsed once and tested for null rather than formatted and
 * compared against the empty value, so a caller whose `empty` reads like a year
 * still gets the same shape of answer.
 */
export function formatRange(
  fromValue: DateInput,
  toValue: DateInput,
  options?: RangeFormatOptions,
): string {
  const from = parse(fromValue);
  const to = parse(toValue);

  if (!from) {
    if (!to) return emptyOf(options);
    return `until ${yearOf(to, options?.timeZone)}`;
  }

  const start = yearOf(from, options?.timeZone);
  if (!to) return options?.current ? `${start} to ${ONGOING}` : start;

  const end = yearOf(to, options?.timeZone);
  if (start === end) return start;
  return `${start} to ${end}`;
}
