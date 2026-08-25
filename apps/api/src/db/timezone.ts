/**
 * The user's timezone, carried per request (FR-025).
 *
 * "Today", "overdue", habit streaks, and anniversaries are calendar-date
 * questions, and a calendar date only exists relative to a timezone. The API
 * derived all of them from `nowIso().slice(0, 10)`, a UTC date, so for a user
 * in Kigali (UTC+2) every one of them was wrong from 22:00 to midnight, and for
 * a user in Los Angeles (UTC−7) they were a day behind until mid-morning.
 *
 * The client sends its IANA zone in `x-vitae-tz`; anything else falls back to
 * the server's `TZ`, then UTC. Same AsyncLocalStorage pattern as data spaces.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

const als = new AsyncLocalStorage<{ tz: string }>();

const DEFAULT_TZ = isValidTimezone(process.env.TZ || '') ? process.env.TZ! : 'UTC';

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function currentTimezone(): string {
  return als.getStore()?.tz ?? DEFAULT_TZ;
}

export function runInTimezone<T>(tz: string, fn: () => T): T {
  return als.run({ tz }, fn);
}

/** The calendar date (`YYYY-MM-DD`) in the request's timezone. */
export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: currentTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * The request's calendar "now" as a local-midnight Date, for callers that
 * take a `Date` and read only its calendar fields — the capture grammar's
 * `^today` / `^fri` tokens above all (FR-025). Handing such a caller a bare
 * `new Date()` resolves relative dates on the host's calendar, which is one
 * day off from the user's for a few hours every night.
 */
export function userCalendarNow(now: Date = new Date()): Date {
  const [year, month, day] = todayIso(now).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The calendar date `days` from today, in the request's timezone. */
export function isoDateIn(days: number, now: Date = new Date()): string {
  const [year, month, day] = todayIso(now).split('-').map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  calendar.setUTCDate(calendar.getUTCDate() + days);
  return calendar.toISOString().slice(0, 10);
}

/** Stable calendar ordinal; unlike milliseconds it cannot drift across DST. */
export function calendarDayOrdinal(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`invalid calendar date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new RangeError(`invalid calendar date: ${value}`);
  return Math.floor(date.getTime() / 86_400_000);
}

export function calendarDaysBetween(from: string, to: string): number {
  return calendarDayOrdinal(to) - calendarDayOrdinal(from);
}

/** Express middleware: pin the request's timezone from `x-vitae-tz`. */
export function timezoneMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('x-vitae-tz');
  const tz = header && isValidTimezone(header) ? header : DEFAULT_TZ;
  als.run({ tz }, next);
}
