/**
 * Source dates → Vitae date-only (`YYYY-MM-DD`) in the workspace timezone.
 *
 * A date-only cell stays the civil day the file wrote. An instant becomes
 * that timezone's calendar day, so `2026-04-18T03:00:00.000Z` is the 17th
 * in America/New_York and the 18th in UTC. Phrases the file states
 * ("16 Apr 2026", "today") are read; anything else is null, never guessed.
 */

import { parseDateToken } from '../../algorithms/capture-grammar.js';
import type { TaskImportContext } from './types.js';

const ISO_INSTANT =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)(Z|[+-]\d{2}:?\d{2})$/;
const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T@](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function civilDayInZone(instant: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    const day = `${value('year')}-${value('month')}-${value('day')}`;
    return DATE_ONLY.test(day) ? day : null;
  } catch {
    return null;
  }
}

function ymd(year: number, month: number, day: number): string | null {
  const at = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseNamedDate(text: string): string | null {
  const cleaned = text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const dmy = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    cleaned,
  );
  if (dmy) {
    const month = MONTHS[dmy[2]!.toLowerCase()];
    if (month === undefined) return null;
    return ymd(Number(dmy[3]), month, Number(dmy[1]));
  }
  const mdy = /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    cleaned,
  );
  if (mdy) {
    const month = MONTHS[mdy[1]!.toLowerCase()];
    if (month === undefined) return null;
    return ymd(Number(mdy[3]), month, Number(mdy[2]));
  }
  return null;
}

/**
 * Read one date cell as a Vitae date-only value.
 *
 * Date-only input is kept as written. Instants convert through `ctx.timezone`.
 */
export function parseCivilDate(raw: string, ctx: TaskImportContext): string | null {
  const text = raw.trim();
  if (text === '') return null;

  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly?.[1] !== undefined) return dateOnly[1];

  const normalised = text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const iso = ISO_INSTANT.exec(normalised);
  if (iso !== null) {
    const instant = new Date(normalised);
    return Number.isNaN(instant.getTime()) ? null : civilDayInZone(instant, ctx.timezone);
  }

  const dateTime = DATE_TIME.exec(text);
  if (dateTime?.[1] !== undefined) return dateTime[1];

  const lower = text.toLowerCase();
  if (lower === 'today' || lower === 'tomorrow') {
    const token = parseDateToken(lower, ctx.now);
    return token?.iso ?? null;
  }

  const named = parseNamedDate(text);
  if (named !== null) return named;

  const weekday = parseDateToken(lower, ctx.now);
  return weekday?.iso ?? null;
}

/** ISO datetime for `completed_at`, or null when the cell is not an instant. */
export function parseInstantIso(raw: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  const normalised = text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const instant = new Date(normalised);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
