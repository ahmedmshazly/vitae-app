/**
 * Calendar dates in the user's own timezone (FR-025).
 *
 * `new Date().toISOString().slice(0, 10)` is a UTC date, not a local one. East
 * of UTC it rolls over to "tomorrow" in the evening; west of it, "today" stays
 * yesterday until mid-morning. That is the string the app compared reminder
 * due-dates and anniversaries against, so "overdue", "due today", and "N years
 * ago today" were wrong for several hours a day, everywhere except UTC, while
 * the greeting right next to them used local time.
 *
 * Reminder `due_on` values are stored as plain `YYYY-MM-DD` calendar dates with
 * no timezone, so the only correct thing to compare them against is the user's
 * local calendar date.
 */

/** The user's current calendar date as `YYYY-MM-DD` (local, not UTC). */
export function todayIso(now: Date = new Date()): string {
  return toLocalIsoDate(now);
}

/** A Date → its local calendar date as `YYYY-MM-DD`. */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A local calendar date `days` from today, as `YYYY-MM-DD`. */
export function isoDateIn(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

/**
 * Parse a plain `YYYY-MM-DD` as a LOCAL date. `new Date('2026-07-13')` parses
 * as UTC midnight, which renders as the previous day west of UTC.
 */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = parseIsoParts(iso);
  return new Date(y, m - 1, d);
}

function parseIsoParts(iso: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`invalid calendar date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`invalid calendar date: ${iso}`);
  }
  return [y, m, d];
}

function ordinal(iso: string): number {
  const [y, m, d] = parseIsoParts(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from today to `iso` (negative = past). Calendar days, not 24h spans. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return ordinal(iso) - ordinal(toLocalIsoDate(now));
}
