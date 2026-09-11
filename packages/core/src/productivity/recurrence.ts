/**
 * RFC 5545 subset + `fixed` / `from_completion`. Inputs and outputs are
 * date-only. A stored due calendar date does not shift when the zone offset
 * changes: expansion walks civil days, not UTC midnights.
 */
import { addCalendarDays, assertDateOnly, isValidDateOnly } from './calendar.js';
import type { Recurrence, RecurrenceMode } from './contracts.js';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ParsedRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly byDay: readonly number[] | null;
  readonly byMonthDay: number | null;
  readonly count: number | null;
  readonly until: string | null;
  readonly wkst: number;
  readonly dtstart: string | null;
}

export interface Occurrence {
  readonly date: string;
  readonly index: number;
}

export type OccurrenceOutcome = 'completed' | 'skipped' | 'missed';

const MAX_CANDIDATES = 400 * 366;

const WEEKDAYS: Readonly<Record<string, number>> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const FREQS: ReadonlySet<string> = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

const KNOWN_PARTS: ReadonlySet<string> = new Set([
  'FREQ',
  'INTERVAL',
  'BYDAY',
  'BYMONTHDAY',
  'COUNT',
  'UNTIL',
  'WKST',
  'DTSTART',
]);

function weekdayOf(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, date, 12, 0, 0)).getUTCDay();
}

function utcDate(year: number, month: number, day: number): string | null {
  const at = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month || at.getUTCDate() !== day) {
    return null;
  }
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year)}-${mm}-${dd}`;
}

function startOfWeek(day: string, wkst: number): string {
  const back = (weekdayOf(day) - wkst + 7) % 7;
  return addCalendarDays(day, -back);
}

function parseStamp(value: string): string | null {
  const compact = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/.exec(value);
  if (compact !== null) {
    const day = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return isValidDateOnly(day) ? day : null;
  }
  if (isValidDateOnly(value)) return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const at = new Date(ms);
  const day = `${String(at.getUTCFullYear())}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
  return isValidDateOnly(day) ? day : null;
}

function positiveInt(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function parseByDay(value: string): readonly number[] | null {
  const days: number[] = [];
  for (const token of value.split(',')) {
    const day = WEEKDAYS[token];
    if (day === undefined) return null;
    if (!days.includes(day)) days.push(day);
  }
  return days.length === 0 ? null : days;
}

export function parseRRule(rrule: string): ParsedRule | null {
  const body = rrule.startsWith('RRULE:') ? rrule.slice('RRULE:'.length) : rrule;
  const parts: Record<string, string> = {};

  for (const piece of body.split(';')) {
    const trimmed = piece.trim();
    if (trimmed === '') continue;
    const cut = trimmed.indexOf('=');
    if (cut <= 0) return null;
    const key = trimmed.slice(0, cut);
    const value = trimmed.slice(cut + 1);
    if (!KNOWN_PARTS.has(key) || value === '') return null;
    parts[key] = value;
  }

  const freq = parts.FREQ;
  if (freq === undefined || !FREQS.has(freq)) return null;

  const interval = parts.INTERVAL === undefined ? 1 : positiveInt(parts.INTERVAL);
  if (interval === null) return null;

  let byDay: readonly number[] | null = null;
  if (parts.BYDAY !== undefined) {
    byDay = parseByDay(parts.BYDAY);
    if (byDay === null) return null;
  }

  let byMonthDay: number | null = null;
  if (parts.BYMONTHDAY !== undefined) {
    const day = positiveInt(parts.BYMONTHDAY);
    if (day === null || day > 31) return null;
    byMonthDay = day;
  }

  let count: number | null = null;
  if (parts.COUNT !== undefined) {
    count = positiveInt(parts.COUNT);
    if (count === null) return null;
  }

  let until: string | null = null;
  if (parts.UNTIL !== undefined) {
    until = parseStamp(parts.UNTIL);
    if (until === null) return null;
  }

  let wkst = 1;
  if (parts.WKST !== undefined) {
    const day = WEEKDAYS[parts.WKST];
    if (day === undefined) return null;
    wkst = day;
  }

  let dtstart: string | null = null;
  if (parts.DTSTART !== undefined) {
    dtstart = parseStamp(parts.DTSTART);
    if (dtstart === null) return null;
  }

  return {
    freq: freq as Frequency,
    interval,
    byDay,
    byMonthDay,
    count,
    until,
    wkst,
    dtstart,
  };
}

function* daily(rule: ParsedRule, start: string): Generator<string> {
  for (let step = 0; ; step += 1) {
    yield addCalendarDays(start, step * rule.interval);
  }
}

function* weekly(rule: ParsedRule, start: string): Generator<string> {
  const days = rule.byDay ?? [weekdayOf(start)];
  const offsets = [...new Set(days.map((day) => (day - rule.wkst + 7) % 7))].sort((a, b) => a - b);
  const week0 = startOfWeek(start, rule.wkst);

  for (let week = 0; ; week += rule.interval) {
    for (const offset of offsets) {
      yield addCalendarDays(week0, week * 7 + offset);
    }
  }
}

function* monthly(rule: ParsedRule, start: string): Generator<string> {
  const day = rule.byMonthDay ?? Number(start.slice(8, 10));
  const origin = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;

  for (let step = 0; ; step += 1) {
    const total = origin + step * rule.interval;
    const year = Math.floor(total / 12);
    const month = total % 12;
    const at = utcDate(year, month, day);
    if (at !== null) yield at;
  }
}

function* yearly(rule: ParsedRule, start: string): Generator<string> {
  const day = rule.byMonthDay ?? Number(start.slice(8, 10));
  const month = Number(start.slice(5, 7)) - 1;
  const originYear = Number(start.slice(0, 4));

  for (let step = 0; ; step += 1) {
    const at = utcDate(originYear + step * rule.interval, month, day);
    if (at !== null) yield at;
  }
}

function* candidates(rule: ParsedRule, start: string): Generator<string> {
  switch (rule.freq) {
    case 'DAILY':
      yield* daily(rule, start);
      return;
    case 'WEEKLY':
      yield* weekly(rule, start);
      return;
    case 'MONTHLY':
      yield* monthly(rule, start);
      return;
    case 'YEARLY':
      yield* yearly(rule, start);
  }
}

function* iterate(
  rule: ParsedRule,
  gridStart: string,
): Generator<{ readonly date: string; readonly index: number }> {
  let index = 0;
  let inspected = 0;

  for (const date of candidates(rule, gridStart)) {
    inspected += 1;
    if (inspected > MAX_CANDIDATES) return;
    if (date < gridStart) continue;
    if (rule.until !== null && date > rule.until) return;
    if (rule.count !== null && index >= rule.count) return;
    yield { date, index };
    index += 1;
  }
}

function isException(date: string, exceptions: readonly string[]): boolean {
  return exceptions.includes(date);
}

function gridOrigin(
  recurrence: Recurrence,
  rule: ParsedRule,
  from: string,
  lastCompletedAt: string | null | undefined,
): { readonly start: string; readonly exclusive: boolean } {
  if (recurrence.mode === 'from_completion' && lastCompletedAt != null) {
    return { start: lastCompletedAt, exclusive: true };
  }
  if (rule.dtstart !== null) {
    return { start: rule.dtstart, exclusive: false };
  }
  return { start: from, exclusive: false };
}

export interface NextOccurrencesOptions {
  readonly lastCompletedAt?: string | null;
  readonly timeZone?: string;
}

/**
 * The next `count` occurrences at or after `from` (inclusive for `fixed`).
 * `from_completion` with `lastCompletedAt` starts strictly after that day.
 */
export function nextOccurrences(
  recurrence: Recurrence,
  from: string,
  count: number,
  opts?: NextOccurrencesOptions,
): readonly Occurrence[] {
  if (!Number.isInteger(count) || count < 1) return [];

  const fromDay = assertDateOnly(from, 'from');
  const lastCompleted =
    opts?.lastCompletedAt == null ? null : assertDateOnly(opts.lastCompletedAt, 'lastCompletedAt');

  const rule = parseRRule(recurrence.rrule);
  if (rule === null) return [];

  const { start, exclusive } = gridOrigin(recurrence, rule, fromDay, lastCompleted);
  const found: Occurrence[] = [];

  for (const occ of iterate(rule, start)) {
    if (exclusive && occ.date <= start) continue;
    if (occ.date < fromDay) continue;
    if (isException(occ.date, recurrence.exceptions)) continue;
    found.push({ date: occ.date, index: occ.index });
    if (found.length >= count) break;
  }

  return found;
}

/** Next occurrence strictly after `from` (or after last completion). */
export function nextOccurrenceAfter(
  recurrence: Recurrence,
  from: string,
  opts?: NextOccurrencesOptions,
): string | null {
  const fromDay = assertDateOnly(from, 'from');
  const lastCompleted =
    opts?.lastCompletedAt == null ? null : assertDateOnly(opts.lastCompletedAt, 'lastCompletedAt');
  const cursor =
    recurrence.mode === 'from_completion' && lastCompleted != null ? lastCompleted : fromDay;

  const following = nextOccurrences(
    { ...recurrence, mode: recurrence.mode as RecurrenceMode },
    addCalendarDays(cursor, 1),
    1,
    recurrence.mode === 'from_completion' ? { lastCompletedAt: cursor } : undefined,
  );
  return following[0]?.date ?? null;
}

export function advance(
  recurrence: Recurrence,
  occurredOn: string,
  _outcome: OccurrenceOutcome,
): string | null {
  const day = assertDateOnly(occurredOn, 'occurredOn');
  const rule = parseRRule(recurrence.rrule);
  if (rule === null) return null;

  const start = recurrence.mode === 'from_completion' ? day : (rule.dtstart ?? day);

  for (const occ of iterate(rule, start)) {
    if (occ.date <= day) continue;
    if (isException(occ.date, recurrence.exceptions)) continue;
    return occ.date;
  }
  return null;
}

export function hasFuture(recurrence: Recurrence, from: string): boolean {
  const day = assertDateOnly(from, 'from');
  const rule = parseRRule(recurrence.rrule);
  if (rule === null) return false;
  const start = rule.dtstart ?? day;

  for (const occ of iterate(rule, start)) {
    if (occ.date <= day) continue;
    if (isException(occ.date, recurrence.exceptions)) continue;
    return true;
  }
  return false;
}
