/**
 * Closed-set coercions shared by the task-file parsers.
 *
 * Fourfold `open` becomes Vitae `inbox` unless the file states a more specific
 * Vitae status. Importance is never inferred. Recurrence is stored only when
 * `parseRRule` accepts the phrase or rule; otherwise the field is skipped.
 */

import type { EnergyLevel, Importance, Recurrence, VitaePriority, VitaeTaskStatus } from '../../productivity/contracts.js';
import { parseRRule } from '../../productivity/recurrence.js';
import type { TaskImportContext } from './types.js';

const VITAE_STATUSES: ReadonlySet<string> = new Set([
  'inbox',
  'next',
  'doing',
  'waiting',
  'done',
  'dropped',
]);

const STATUS_ALIASES: Readonly<Record<string, VitaeTaskStatus>> = {
  open: 'inbox',
  completed: 'done',
  complete: 'done',
  checked: 'done',
  finished: 'done',
  cancelled: 'dropped',
  canceled: 'dropped',
  archived: 'dropped',
};

const PRIORITY_ALIASES: Readonly<Record<string, VitaePriority>> = {
  p1: 'p1',
  p2: 'p2',
  p3: 'p3',
  p4: 'p4',
  high: 'p1',
  medium: 'p2',
  low: 'p3',
};

const WEEKDAYS: Readonly<Record<string, string>> = {
  sunday: 'SU',
  sun: 'SU',
  monday: 'MO',
  mon: 'MO',
  tuesday: 'TU',
  tue: 'TU',
  tues: 'TU',
  wednesday: 'WE',
  wed: 'WE',
  thursday: 'TH',
  thu: 'TH',
  thur: 'TH',
  thurs: 'TH',
  friday: 'FR',
  fri: 'FR',
  saturday: 'SA',
  sat: 'SA',
};

const UNITS: Readonly<Record<string, 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>> = {
  day: 'DAILY',
  days: 'DAILY',
  week: 'WEEKLY',
  weeks: 'WEEKLY',
  month: 'MONTHLY',
  months: 'MONTHLY',
  year: 'YEARLY',
  years: 'YEARLY',
};

export function parseVitaeStatus(raw: string): VitaeTaskStatus | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const lower = text.toLowerCase();
  if (VITAE_STATUSES.has(lower)) return lower as VitaeTaskStatus;
  return STATUS_ALIASES[lower];
}

/** Fourfold `someday` is not a Vitae status and must not be invented as one. */
export function isUnsupportedStatus(raw: string): boolean {
  return raw.trim().toLowerCase() === 'someday';
}

export function parseVitaePriority(raw: string): VitaePriority | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const upper = text.toUpperCase();
  if (upper === 'P1' || upper === 'P2' || upper === 'P3' || upper === 'P4') {
    return upper.toLowerCase() as VitaePriority;
  }
  return PRIORITY_ALIASES[text.toLowerCase()];
}

export function parseImportance(raw: string): Importance | undefined {
  const text = raw.trim().toLowerCase();
  if (text === 'none' || text === 'important' || text === 'critical') return text;
  return undefined;
}

export function parseEnergy(raw: string): EnergyLevel | undefined {
  const text = raw.trim().toLowerCase();
  if (text === 'low' || text === 'medium' || text === 'high') return text;
  return undefined;
}

export function parseCount(raw: string): number | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

export function parseFlag(raw: string): boolean | undefined {
  const text = raw.trim().toLowerCase();
  if (text === 'true' || text === 'yes' || text === 'y' || text === '1') return true;
  if (text === 'false' || text === 'no' || text === 'n' || text === '0') return false;
  return undefined;
}

export function isSensitiveFlag(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw !== 'string') return false;
  const text = raw.trim().toLowerCase();
  return text === 'true' || text === 'sensitive' || text === 'private' || text === 'yes' || text === '1';
}

function capturedRecurrence(rrule: string): Recurrence | null {
  const body = rrule.startsWith('RRULE:') ? rrule.slice(6) : rrule;
  if (parseRRule(body) === null) return null;
  return { rrule: body, mode: 'fixed', exceptions: [] };
}

export function recurrenceFromRule(raw: string): Recurrence | null {
  const text = raw.trim();
  if (text === '') return null;
  return capturedRecurrence(text);
}

function ordinalDay(word: string): number | null {
  const match = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(word);
  if (match === null) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function singleWord(word: string): string | null {
  switch (word) {
    case 'day':
      return 'FREQ=DAILY';
    case 'weekday':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'week':
      return 'FREQ=WEEKLY';
    case 'month':
      return 'FREQ=MONTHLY';
    case 'year':
      return 'FREQ=YEARLY';
    default:
      return WEEKDAYS[word] === undefined ? null : `FREQ=WEEKLY;BYDAY=${WEEKDAYS[word]}`;
  }
}

function interval(count: string, unit: string, weekStartsOn: 0 | 1): string | null {
  const n = Number(count);
  const freq = UNITS[unit];
  if (freq === undefined || !Number.isInteger(n) || n < 1) return null;
  if (n === 1) return `FREQ=${freq}`;
  const body = `FREQ=${freq};INTERVAL=${String(n)}`;
  return freq === 'WEEKLY' ? `${body};WKST=${weekStartsOn === 0 ? 'SU' : 'MO'}` : body;
}

/** Port of Fourfold's closed "every …" subset; unknown phrases return null. */
export function everyPhraseToRRule(phrase: string, ctx: Pick<TaskImportContext, 'weekStartsOn'>): string | null {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words[0] === 'every') words.shift();
  const [first, second, third, fourth] = words;
  if (first === undefined) return null;
  switch (words.length) {
    case 1:
      return singleWord(first);
    case 2:
      return second === undefined ? null : interval(first, second, ctx.weekStartsOn);
    case 4: {
      if (first !== 'month' || second !== 'on' || third !== 'the' || fourth === undefined) return null;
      const day = ordinalDay(fourth);
      return day === null ? null : `FREQ=MONTHLY;BYMONTHDAY=${String(day)}`;
    }
    default:
      return null;
  }
}

export function recurrenceFromPhrase(raw: string, ctx: TaskImportContext): Recurrence | null {
  const rrule = everyPhraseToRRule(raw, ctx);
  return rrule === null ? null : capturedRecurrence(rrule);
}

export function notesToText(notes: unknown): string {
  if (typeof notes === 'string') return notes;
  if (notes === null || notes === undefined) return '';
  if (typeof notes === 'object') {
    const record = notes as Record<string, unknown>;
    if (typeof record.plain === 'string') return record.plain;
    if (typeof record.text === 'string') return record.text;
    if (Array.isArray(record.blocks)) {
      return record.blocks
        .map((block) => (typeof block === 'string' ? block : notesToText(block)))
        .filter(Boolean)
        .join('\n');
    }
  }
  return '';
}

export function appendNote(existing: string, extra: string): string {
  const add = extra.trim();
  if (add === '') return existing;
  return existing === '' ? add : `${existing}\n${add}`;
}
