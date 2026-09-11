/**
 * Calendar-date helpers for productivity. No host clock.
 *
 * Date-only fields are civil days. Arithmetic uses UTC noon on that calendar
 * date so a DST offset change cannot slide `2026-03-08` onto another day.
 */
export const MS_PER_DAY = 86_400_000;

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_URGENCY_WINDOW_DAYS = 7;
export const DEFAULT_WAITING_PATIENCE_DAYS = 7;

function pad(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

/** True when `value` is a real YYYY-MM-DD civil date (rejects 2026-02-31). */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const at = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  );
}

export function assertDateOnly(value: string, field: string): string {
  if (!isValidDateOnly(value)) {
    throw new RangeError(`invalid date-only ${field} "${value}"`);
  }
  return value;
}

function utcNoon(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Date.UTC(year, month - 1, date, 12, 0, 0);
}

/** Whole civil days from `from` to `to`. Negative when `to` is earlier. */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((utcNoon(to) - utcNoon(from)) / MS_PER_DAY);
}

export function addCalendarDays(day: string, delta: number): string {
  const at = new Date(utcNoon(day) + delta * MS_PER_DAY);
  return `${String(at.getUTCFullYear())}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

export function compareDateOnly(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/** YYYY-MM-DD of `instant` in an IANA zone. */
export function calendarDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type);
    if (part === undefined) {
      throw new RangeError(`calendar: missing ${type} in ${timeZone}`);
    }
    return part.value;
  };
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * Resolve a `now` argument to a calendar date.
 * A YYYY-MM-DD string is used as-is. An instant is read in `timeZone`.
 */
export function resolveCalendarNow(now: string | Date, timeZone = 'UTC'): string {
  if (typeof now === 'string') {
    if (isValidDateOnly(now)) return now;
    const ms = Date.parse(now);
    if (Number.isNaN(ms)) {
      throw new RangeError(`invalid now "${now}"`);
    }
    return calendarDateInZone(new Date(ms), timeZone);
  }
  return calendarDateInZone(now, timeZone);
}

export function parseInstant(iso: string, field: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new RangeError(`could not parse ${field} "${iso}"`);
  }
  return ms;
}
