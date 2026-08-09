/**
 * The quick-add capture grammar (SRS §5.1, FR-CAP-001). A deterministic
 * tokenizer + rule set that turns a single line like
 *
 *   p Lina Farouk @@DevFest Cairo #ml ^fri !p1 > met at the speaker dinner
 *
 * into a structured plan (person + org stub + tag + date + note) that the UI
 * previews as chips and commits on Enter. No AI, pure parsing.
 */
import type { NodeType } from '../types.js';

// null-prototype map: a leading token like `__proto__` must not resolve via
// Object.prototype and poison primaryType (property fuzz found this).
const LEADING_KEYS: Record<string, NodeType | 'note_append'> = Object.assign(
  Object.create(null) as Record<string, NodeType | 'note_append'>,
  {
    p: 'person',
    o: 'organization',
    t: 'task',
    i: 'idea',
    j: 'journal_entry',
    e: 'event',
    int: 'interaction',
    m: 'media_item',
    l: 'link',
    k: 'skill',
    g: 'goal',
    h: 'habit',
    n: 'note_append',
  },
);

export type PrimaryKind = NodeType | 'note_append' | 'unknown';

export interface CaptureChip {
  kind: 'type' | 'title' | 'person' | 'org' | 'tag' | 'date' | 'priority' | 'note' | 'url';
  label: string;
  value: string;
}

export interface CapturePlan {
  primaryType: PrimaryKind;
  title: string;
  notes: string;
  tags: string[];
  people: string[];
  orgs: string[];
  date: { iso: string; label: string } | null;
  priority: 'p1' | 'p2' | 'p3' | 'p4' | null;
  url: string | null;
  chips: CaptureChip[];
  raw: string;
}

const URL_RE = /^https?:\/\/\S+$/i;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Parse a capture line into a plan. `now` makes relative dates reproducible. */
export function parseCapture(raw: string, now: Date = new Date()): CapturePlan {
  const plan: CapturePlan = {
    primaryType: 'unknown',
    title: '',
    notes: '',
    tags: [],
    people: [],
    orgs: [],
    date: null,
    priority: null,
    url: null,
    chips: [],
    raw,
  };

  const trimmed = raw.trim();
  if (!trimmed) return plan;

  // Split notes off at the first top-level '>'.
  const gtIndex = trimmed.indexOf('>');
  const head = (gtIndex >= 0 ? trimmed.slice(0, gtIndex) : trimmed).trim();
  if (gtIndex >= 0) plan.notes = trimmed.slice(gtIndex + 1).trim();

  const words = head.split(/\s+/).filter(Boolean);
  let i = 0;

  // Leading key (check 'int' before single-char keys).
  const leading = words[0]?.toLowerCase();
  if (leading && Object.prototype.hasOwnProperty.call(LEADING_KEYS, leading)) {
    plan.primaryType = LEADING_KEYS[leading]!;
    i = 1;
  }

  type Sink = { kind: 'title' | 'person' | 'org'; buf: string[] };
  let sink: Sink = { kind: 'title', buf: [] };
  const people: string[] = [];
  const orgs: string[] = [];
  const flush = () => {
    const text = sink.buf.join(' ').trim();
    if (text) {
      if (sink.kind === 'title') plan.title = plan.title ? `${plan.title} ${text}` : text;
      else if (sink.kind === 'person') people.push(text);
      else orgs.push(text);
    }
    sink.buf = [];
  };

  for (; i < words.length; i++) {
    const w = words[i]!;
    if (w.startsWith('@@')) {
      flush();
      sink = { kind: 'org', buf: [w.slice(2)].filter(Boolean) };
    } else if (w.startsWith('@')) {
      flush();
      sink = { kind: 'person', buf: [w.slice(1)].filter(Boolean) };
    } else if (w.startsWith('#') && w.length > 1) {
      plan.tags.push(w.slice(1).toLowerCase());
    } else if (w.startsWith('^') && w.length > 1) {
      plan.date = parseDateToken(w.slice(1), now);
    } else if (/^!p[1-4]$/i.test(w)) {
      plan.priority = w.slice(1).toLowerCase() as CapturePlan['priority'];
    } else if (URL_RE.test(w)) {
      plan.url = w;
      if (plan.primaryType === 'unknown') plan.primaryType = 'link';
    } else {
      sink.buf.push(w);
    }
  }
  flush();

  plan.people = people;
  plan.orgs = orgs;

  // A bare URL with no leading key ⇒ link node whose title is the URL.
  if (plan.primaryType === 'link' && !plan.title && plan.url) plan.title = plan.url;

  plan.chips = buildChips(plan);
  return plan;
}

function buildChips(plan: CapturePlan): CaptureChip[] {
  const chips: CaptureChip[] = [];
  if (plan.primaryType !== 'unknown') {
    chips.push({ kind: 'type', label: labelForType(plan.primaryType), value: plan.primaryType });
  }
  if (plan.title) chips.push({ kind: 'title', label: plan.title, value: plan.title });
  for (const p of plan.people) chips.push({ kind: 'person', label: p, value: p });
  for (const o of plan.orgs) chips.push({ kind: 'org', label: o, value: o });
  for (const t of plan.tags) chips.push({ kind: 'tag', label: `#${t}`, value: t });
  if (plan.date) chips.push({ kind: 'date', label: plan.date.label, value: plan.date.iso });
  if (plan.priority) chips.push({ kind: 'priority', label: plan.priority.toUpperCase(), value: plan.priority });
  if (plan.url) chips.push({ kind: 'url', label: 'link', value: plan.url });
  if (plan.notes) chips.push({ kind: 'note', label: 'note', value: plan.notes });
  return chips;
}

function labelForType(t: PrimaryKind): string {
  if (t === 'note_append') return 'append note';
  return t.replace(/_/g, ' ');
}

/** Parse a `^date` token to an ISO date and a human label. */
export function parseDateToken(token: string, now: Date): { iso: string; label: string } | null {
  const t = token.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return { iso: t, label: t };
  }
  if (t === 'today') return iso(base, 'today');
  if (t === 'tomorrow') return iso(addDays(base, 1), 'tomorrow');
  if (t === 'yesterday') return iso(addDays(base, -1), 'yesterday');

  const wd = WEEKDAYS.indexOf(t.slice(0, 3));
  if (wd >= 0) {
    const cur = base.getDay();
    let delta = (wd - cur + 7) % 7;
    if (delta === 0) delta = 7; // "^fri" means the next Friday, not today
    return iso(addDays(base, delta), token.toLowerCase());
  }
  return null;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function iso(d: Date, label: string): { iso: string; label: string } {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { iso: `${y}-${m}-${day}`, label };
}
