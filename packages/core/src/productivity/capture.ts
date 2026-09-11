/**
 * Capture-bar grammar → Vitae fields. Date tokens become date-only.
 * Priority is `p1`–`p4` (not Fourfold `P0`–`P4`). Importance is an assertion
 * token (`!important`, `!critical`). No chrono-node, no host clock.
 */
import { addCalendarDays, calendarDateInZone, isValidDateOnly, resolveCalendarNow } from './calendar.js';
import type { EnergyLevel, Importance, Quadrant, VitaePriority } from './contracts.js';

export interface CaptureContext {
  readonly now: string | Date;
  readonly timeZone?: string;
  readonly weekStartsOn?: 0 | 1;
  readonly locale?: string;
}

export type ChipKind =
  | 'project'
  | 'entity'
  | 'priority'
  | 'importance'
  | 'due'
  | 'target'
  | 'recurrence'
  | 'estimate'
  | 'quadrant'
  | 'energy';

export interface Chip {
  readonly kind: ChipKind;
  readonly label: string;
  readonly span: readonly [number, number];
}

export interface UnresolvedRef {
  readonly name: string;
  readonly unresolved: true;
}

export interface CaptureFields {
  readonly project?: UnresolvedRef;
  readonly entity?: UnresolvedRef;
  readonly priority?: VitaePriority;
  readonly importance?: Importance;
  readonly due?: string;
  readonly target?: string;
  readonly recurrence_rrule?: string;
  readonly effort_min?: number;
  readonly quadrant_override?: Quadrant;
  readonly energy?: EnergyLevel;
}

export interface ParsedCapture {
  readonly title: string;
  readonly fields: CaptureFields;
  readonly chips: readonly Chip[];
}

type Token = { readonly start: number; readonly end: number } & (
  | { readonly kind: 'project'; readonly name: string }
  | { readonly kind: 'entity'; readonly name: string }
  | { readonly kind: 'priority'; readonly priority: VitaePriority }
  | { readonly kind: 'importance'; readonly importance: Importance }
  | { readonly kind: 'due'; readonly at: string }
  | { readonly kind: 'target'; readonly at: string }
  | { readonly kind: 'recurrence'; readonly rrule: string }
  | { readonly kind: 'estimate'; readonly minutes: number }
  | { readonly kind: 'quadrant'; readonly quadrant: Quadrant }
  | { readonly kind: 'energy'; readonly energy: EnergyLevel }
);

type Draft = { -readonly [K in keyof CaptureFields]: CaptureFields[K] };

const QUADRANT_WORDS: Readonly<Record<string, Quadrant>> = {
  q1: 'do',
  q2: 'schedule',
  q3: 'delegate',
  q4: 'eliminate',
  do: 'do',
  schedule: 'schedule',
  delegate: 'delegate',
  eliminate: 'eliminate',
};

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const ENERGY_WORDS = ['low', 'medium', 'high'] as const;
const VITAE_PRIORITY: Readonly<Record<string, VitaePriority>> = {
  '1': 'p1',
  '2': 'p2',
  '3': 'p3',
  '4': 'p4',
};

const LEAD = String.raw`(^|\s)`;
const TAIL = String.raw`(?![\w-])`;

const PROJECT = new RegExp(`${LEAD}#(?:"([^"]+)"|([\\w-]+))`, 'g');
const ENTITY = new RegExp(`${LEAD}@(?:"([^"]+)"|([\\w-]+))`, 'g');
const PRIORITY = new RegExp(`${LEAD}!p([0-4])${TAIL}`, 'gi');
const IMPORTANCE_TOKEN = new RegExp(`${LEAD}!(important|critical|none)${TAIL}`, 'gi');
const ESTIMATE = new RegExp(`${LEAD}~(?:(\\d+)h)?(?:(\\d+)m)?(?![\\w.-])`, 'gi');
const QUADRANT = new RegExp(`${LEAD}in\\s+(q[1-4]|do|schedule|delegate|eliminate)${TAIL}`, 'gi');
const ENERGY = new RegExp(`${LEAD}energy\\s+(low|medium|high)${TAIL}`, 'gi');
const DATE_KEYWORD = new RegExp(`${LEAD}(due|by|target)(?=\\s)`, 'gi');

interface DateMatch {
  readonly date: string;
  readonly index: number;
  readonly length: number;
}

function weekdayOf(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, date, 12, 0, 0)).getUTCDay();
}

function nextWeekday(base: string, weekday: number): string {
  const current = weekdayOf(base);
  const delta = (weekday - current + 7) % 7 || 7;
  return addCalendarDays(base, delta);
}

function wordEnds(text: string, max: number): number[] {
  const ends: number[] = [];
  const pattern = /\S+/g;
  for (let match = pattern.exec(text); match !== null && ends.length < max; match = pattern.exec(text)) {
    ends.push(match.index + match[0].length);
  }
  return ends;
}

function readPhrase(phrase: string, today: string): string | null {
  if (isValidDateOnly(phrase)) return phrase;
  if (phrase === 'today') return today;
  if (phrase === 'tomorrow') return addCalendarDays(today, 1);
  if (phrase === 'yesterday') return addCalendarDays(today, -1);

  const inMatch = /^in\s+(\d+)\s+(day|days|week|weeks)$/.exec(phrase);
  if (inMatch !== null) {
    const count = Number(inMatch[1]);
    const unit = inMatch[2] ?? 'day';
    const days = unit.startsWith('week') ? count * 7 : count;
    return addCalendarDays(today, days);
  }

  const nextMatch = /^next\s+([a-z]+)$/.exec(phrase);
  if (nextMatch !== null) {
    const weekday = WEEKDAY_INDEX[nextMatch[1] ?? ''];
    if (weekday === undefined) return null;
    return addCalendarDays(nextWeekday(today, weekday), 7);
  }

  const thisMatch = /^this\s+([a-z]+)$/.exec(phrase);
  if (thisMatch !== null) {
    const weekday = WEEKDAY_INDEX[thisMatch[1] ?? ''];
    if (weekday === undefined) return null;
    const delta = (weekday - weekdayOf(today) + 7) % 7;
    return addCalendarDays(today, delta);
  }

  const weekday = WEEKDAY_INDEX[phrase];
  if (weekday !== undefined) return nextWeekday(today, weekday);
  return null;
}

function parseDatePhrase(text: string, today: string): DateMatch | null {
  const index = text.length - text.trimStart().length;
  const rest = text.slice(index);
  const lower = rest.toLowerCase();
  const ends = wordEnds(lower, 3);
  for (let take = ends.length; take >= 1; take -= 1) {
    const end = ends[take - 1];
    if (end === undefined) continue;
    const date = readPhrase(lower.slice(0, end), today);
    if (date !== null) return { date, index, length: end };
  }
  return null;
}

function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

class Scan {
  readonly tokens: Token[] = [];
  masked: string;

  constructor(readonly text: string) {
    this.masked = text;
  }

  take(token: Token): void {
    const overlaps = this.tokens.some((other) => token.start < other.end && other.start < token.end);
    if (overlaps) return;
    this.tokens.push(token);
    this.masked = blank(this.masked, token.start, token.end);
  }
}

function scanRefs(scan: Scan, pattern: RegExp, kind: 'project' | 'entity'): void {
  for (const match of scan.text.matchAll(pattern)) {
    const name = match[2] ?? match[3];
    if (name === undefined || /^\d+$/.test(name)) continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind, name, start, end: match.index + match[0].length });
  }
}

function scanPriority(scan: Scan): void {
  for (const match of scan.text.matchAll(PRIORITY)) {
    const priority = VITAE_PRIORITY[match[2] ?? ''];
    if (priority === undefined) continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind: 'priority', priority, start, end: match.index + match[0].length });
  }
}

function scanImportance(scan: Scan): void {
  for (const match of scan.text.matchAll(IMPORTANCE_TOKEN)) {
    const importance = (match[2] ?? '').toLowerCase() as Importance;
    if (importance !== 'important' && importance !== 'critical' && importance !== 'none') continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind: 'importance', importance, start, end: match.index + match[0].length });
  }
}

function scanEstimate(scan: Scan): void {
  for (const match of scan.text.matchAll(ESTIMATE)) {
    const hours = match[2];
    const minutes = match[3];
    if (hours === undefined && minutes === undefined) continue;
    const total = Number(hours ?? 0) * 60 + Number(minutes ?? 0);
    if (total < 1) continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind: 'estimate', minutes: total, start, end: match.index + match[0].length });
  }
}

function scanQuadrant(scan: Scan): void {
  for (const match of scan.masked.matchAll(QUADRANT)) {
    const quadrant = QUADRANT_WORDS[(match[2] ?? '').toLowerCase()];
    if (quadrant === undefined) continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind: 'quadrant', quadrant, start, end: match.index + match[0].length });
  }
}

function scanEnergy(scan: Scan): void {
  for (const match of scan.masked.matchAll(ENERGY)) {
    const word = (match[2] ?? '').toLowerCase();
    const energy = ENERGY_WORDS.find((candidate) => candidate === word);
    if (energy === undefined) continue;
    const start = match.index + (match[1]?.length ?? 0);
    scan.take({ kind: 'energy', energy, start, end: match.index + match[0].length });
  }
}

function scanDates(scan: Scan, today: string): void {
  for (const match of scan.masked.matchAll(DATE_KEYWORD)) {
    const start = match.index + (match[1]?.length ?? 0);
    const keywordEnd = match.index + match[0].length;
    const keyword = (match[2] ?? '').toLowerCase();
    const rest = scan.masked.slice(keywordEnd);
    const parsed = parseDatePhrase(rest, today);
    if (parsed === null) continue;
    const consumed = rest.slice(parsed.index, parsed.index + parsed.length);
    if (consumed.trim() === '') continue;
    const end = keywordEnd + parsed.index + parsed.length;
    const kind = keyword === 'target' ? 'target' : 'due';
    scan.take({ kind, at: parsed.date, start, end });
  }
}

function fieldsFrom(tokens: readonly Token[]): CaptureFields {
  const draft: Draft = {};
  for (const token of tokens) {
    switch (token.kind) {
      case 'project':
        draft.project = { name: token.name, unresolved: true };
        break;
      case 'entity':
        draft.entity = { name: token.name, unresolved: true };
        break;
      case 'priority':
        draft.priority = token.priority;
        break;
      case 'importance':
        draft.importance = token.importance;
        break;
      case 'due':
        draft.due = token.at;
        break;
      case 'target':
        draft.target = token.at;
        break;
      case 'recurrence':
        draft.recurrence_rrule = token.rrule;
        break;
      case 'estimate':
        draft.effort_min = token.minutes;
        break;
      case 'quadrant':
        draft.quadrant_override = token.quadrant;
        break;
      case 'energy':
        draft.energy = token.energy;
        break;
    }
  }
  return draft;
}

function titleFrom(text: string, tokens: readonly Token[]): string {
  let title = '';
  let cursor = 0;
  for (const token of tokens) {
    title += text.slice(cursor, token.start);
    cursor = token.end;
  }
  title += text.slice(cursor);
  return title.replace(/\s+/g, ' ').trim();
}

function todayOf(ctx: CaptureContext): string {
  if (typeof ctx.now === 'string' && isValidDateOnly(ctx.now)) return ctx.now;
  if (typeof ctx.now === 'string') {
    const ms = Date.parse(ctx.now);
    if (!Number.isNaN(ms)) return calendarDateInZone(new Date(ms), ctx.timeZone ?? 'UTC');
  }
  if (ctx.now instanceof Date) return calendarDateInZone(ctx.now, ctx.timeZone ?? 'UTC');
  return resolveCalendarNow(ctx.now, ctx.timeZone ?? 'UTC');
}

export function parseCapture(text: string, ctx: CaptureContext): ParsedCapture {
  const scan = new Scan(text);
  const today = todayOf(ctx);

  scanRefs(scan, PROJECT, 'project');
  scanRefs(scan, ENTITY, 'entity');
  scanPriority(scan);
  scanImportance(scan);
  scanEstimate(scan);
  scanQuadrant(scan);
  scanEnergy(scan);
  scanDates(scan, today);

  const tokens = [...scan.tokens].sort((a, b) => a.start - b.start);
  return {
    title: titleFrom(text, tokens),
    fields: fieldsFrom(tokens),
    chips: tokens.map((token) => ({
      kind: token.kind,
      label: text.slice(token.start, token.end),
      span: [token.start, token.end] as const,
    })),
  };
}
