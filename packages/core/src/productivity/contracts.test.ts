import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { productivityCommandSchema } from './commands.js';
import {
  IMPORTANCE,
  PRODUCTIVITY_API_FLAG,
  PRODUCTIVITY_ROUTES,
  PRODUCTIVITY_WEB_FLAG,
  QUADRANTS,
  REASON_KEYS,
  UNCHANGED_TODAY_ROUTES,
  commandEnvelopeSchema,
  importanceSchema,
  isOpenStatus,
} from './contracts.js';
import {
  analyticsCasesSchema,
  captureCasesSchema,
  placementCasesSchema,
  recurrenceCasesSchema,
  rulesCasesSchema,
} from './fixture-schemas.js';
import { placementSchema, taskReadModelSchema } from './read-models.js';

function readJson(name: string): unknown {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

describe('productivity command envelope', () => {
  it('accepts version 1 with operation_id and optional expected_revision', () => {
    expect(commandEnvelopeSchema.parse({ version: 1, operation_id: 'op-1' })).toEqual({
      version: 1,
      operation_id: 'op-1',
    });
    expect(
      commandEnvelopeSchema.parse({ version: 1, operation_id: 'op-2', expected_revision: 4 }),
    ).toMatchObject({ expected_revision: 4 });
  });

  it('rejects any version other than 1', () => {
    expect(commandEnvelopeSchema.safeParse({ version: 2, operation_id: 'op-1' }).success).toBe(
      false,
    );
  });
});

describe('versioned productivity commands', () => {
  it('parses create_task without expected_revision', () => {
    const parsed = productivityCommandSchema.parse({
      version: 1,
      operation_id: 'op-create',
      type: 'create_task',
      payload: { title: 'Renew passport', due: '2026-09-11', target: '2026-09-18' },
    });
    expect(parsed.type).toBe('create_task');
    expect(parsed.expected_revision).toBeUndefined();
    if (parsed.type === 'create_task') {
      expect(parsed.payload.due).toBe('2026-09-11');
      expect(parsed.payload.target).toBe('2026-09-18');
    }
  });

  it('parses each named command type', () => {
    const samples: unknown[] = [
      {
        version: 1,
        operation_id: '1',
        expected_revision: 3,
        type: 'update_task',
        payload: { id: 't1', patch: { status: 'next' } },
      },
      {
        version: 1,
        operation_id: '2',
        expected_revision: 3,
        type: 'complete_task',
        payload: { id: 't1' },
      },
      {
        version: 1,
        operation_id: '3',
        expected_revision: 3,
        type: 'drop_task',
        payload: { id: 't1' },
      },
      {
        version: 1,
        operation_id: '4',
        expected_revision: 3,
        type: 'restore_task',
        payload: { id: 't1', status: 'inbox' },
      },
      {
        version: 1,
        operation_id: '5',
        expected_revision: 3,
        type: 'reorder_tasks',
        payload: { ordered_ids: ['t1', 't2'] },
      },
      {
        version: 1,
        operation_id: '6',
        expected_revision: 3,
        type: 'wait_on_task',
        payload: { id: 't1', waiting_on_id: 'person-sam', waiting_since: '2026-08-26' },
      },
      {
        version: 1,
        operation_id: '7',
        expected_revision: 3,
        type: 'follow_up_task',
        payload: { id: 't1', follow_up: '2026-09-11' },
      },
      {
        version: 1,
        operation_id: '8',
        expected_revision: 3,
        type: 'add_time_entry',
        payload: { item_id: 't1', started_at: '2026-09-04T09:00:00.000Z' },
      },
      {
        version: 1,
        operation_id: '9',
        expected_revision: 3,
        type: 'set_recurrence',
        payload: { id: 't1', recurrence: { rrule: 'FREQ=DAILY', mode: 'fixed' } },
      },
      {
        version: 1,
        operation_id: '10',
        expected_revision: 3,
        type: 'upsert_rule',
        payload: { name: 'Inbox to p1', statement: 'When inbox, set p1', actions: [] },
      },
      {
        version: 1,
        operation_id: '11',
        expected_revision: 3,
        type: 'upsert_template',
        payload: { name: 'Move house', kind: 'project' },
      },
    ];
    for (const sample of samples) {
      const parsed = productivityCommandSchema.safeParse(sample);
      expect(parsed.success, JSON.stringify(sample)).toBe(true);
    }
  });

  it('rejects a timestamptz on date-only command fields', () => {
    const parsed = productivityCommandSchema.safeParse({
      version: 1,
      operation_id: 'op-bad-due',
      type: 'create_task',
      payload: { title: 'x', due: '2026-09-04T12:00:00.000Z' },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('placement and task read models', () => {
  it('refuses a placement without a reason', () => {
    expect(placementSchema.safeParse({ quadrant: 'do', params: {} }).success).toBe(false);
  });

  it('accepts a placement only when reason is present', () => {
    const placed = placementSchema.parse({
      quadrant: 'delegate',
      reason: 'due_past',
      params: { due: '2026-09-01', days_past: 3 },
    });
    expect(placed.reason).toBe('due_past');
  });

  it('allows derived open and quadrant on the read model', () => {
    const row = taskReadModelSchema.parse({
      id: 't1',
      title: 'Renew passport',
      status: 'inbox',
      rev: 0,
      open: true,
      quadrant: 'eliminate',
      placement: { quadrant: 'eliminate', reason: 'no_signal', params: {} },
    });
    expect(row.open).toBe(true);
    expect(isOpenStatus(row.status)).toBe(true);
  });
});

describe('Fourfold unions are frozen, not invented', () => {
  it('uses Fourfold importance none | important | critical', () => {
    expect([...IMPORTANCE]).toEqual(['none', 'important', 'critical']);
    expect(importanceSchema.safeParse('high').success).toBe(false);
    expect(importanceSchema.safeParse('normal').success).toBe(false);
  });

  it('uses Fourfold quadrants and ReasonKey union', () => {
    expect([...QUADRANTS]).toEqual(['do', 'schedule', 'delegate', 'eliminate']);
    expect(REASON_KEYS).toContain('placed_by_you');
    expect(REASON_KEYS).toContain('no_signal');
    expect(REASON_KEYS).toHaveLength(12);
  });

  it('names routes and default-off flags without mounting them', () => {
    expect([...PRODUCTIVITY_ROUTES]).toEqual([
      '/today/tasks',
      '/today/waiting',
      '/today/review',
      '/today/analytics',
      '/today/automation',
      '/today/task-templates',
    ]);
    expect([...UNCHANGED_TODAY_ROUTES]).toEqual(['/today', '/today/planner', '/today/ledger']);
    expect(PRODUCTIVITY_API_FLAG).toBe('VITAE_PRODUCTIVITY_ENABLED');
    expect(PRODUCTIVITY_WEB_FLAG).toBe('VITE_PUBLIC_PRODUCTIVITY_ENABLED');
  });
});

describe('Fourfold-adapted fixture tables are well-formed', () => {
  it('placement-cases.json has at least the eight required rows', () => {
    const rows = placementCasesSchema.parse(readJson('placement-cases.json'));
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'override-beats-urgency',
        'due-past',
        'due-within-window',
        'target-past',
        'target-within-window',
        'follow-up-due',
        'waiting-patience-exceeded',
        'no-signal-eliminate',
      ]),
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it('capture, recurrence, rules, and analytics fixtures parse', () => {
    expect(captureCasesSchema.parse(readJson('capture-cases.json')).length).toBeGreaterThanOrEqual(3);
    expect(recurrenceCasesSchema.parse(readJson('recurrence-cases.json')).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(rulesCasesSchema.parse(readJson('rules-cases.json')).length).toBeGreaterThanOrEqual(3);
    expect(analyticsCasesSchema.parse(readJson('analytics-cases.json')).length).toBeGreaterThanOrEqual(
      3,
    );
  });
});
