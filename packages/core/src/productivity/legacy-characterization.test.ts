/**
 * Characterization: current Vitae schemas still accept the same legacy shapes.
 * Does not change taskProps, projectProps, goalProps, habitProps,
 * applicationProps, reminder/ledger/export/search schemas.
 */
import { describe, expect, it } from 'vitest';
import { parseFilterQuery } from '../algorithms/filter-grammar.js';
import { parseGraphBundle } from '../schema/bundle.js';
import { isoDate } from '../schema/envelope.js';
import { knowsProps } from '../schema/edge-props.js';
import {
  NODE_PROPS_SCHEMAS,
  applicationProps,
  goalProps,
  habitProps,
  interactionProps,
  projectProps,
  taskProps,
} from '../schema/node-props.js';
import { EDGE_TYPES } from '../types.js';

const TASK_STATUSES = ['inbox', 'next', 'doing', 'waiting', 'done', 'dropped'] as const;
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;

describe('legacy taskProps', () => {
  it('parses a task with only { status: inbox }', () => {
    expect(taskProps.parse({ status: 'inbox' })).toEqual({ status: 'inbox' });
  });

  it('parses each Vitae task status', () => {
    for (const status of TASK_STATUSES) {
      expect(taskProps.parse({ status }).status).toBe(status);
    }
  });

  it('accepts date-only due and scheduled; isoDate rejects a timestamptz', () => {
    expect(taskProps.parse({ status: 'next', due: '2026-09-11', scheduled: '2026-09-12' })).toEqual({
      status: 'next',
      due: '2026-09-11',
      scheduled: '2026-09-12',
    });
    // Existing isoDate behavior: a timestamptz is not a calendar date.
    expect(isoDate.safeParse('2026-09-04T12:00:00.000Z').success).toBe(false);
    expect(taskProps.safeParse({ status: 'next', due: '2026-09-04T12:00:00.000Z' }).success).toBe(
      false,
    );
  });

  it('treats priority p1–p4 as optional and rejects unknown priorities', () => {
    expect(taskProps.parse({ status: 'inbox' }).priority).toBeUndefined();
    for (const priority of PRIORITIES) {
      expect(taskProps.parse({ status: 'inbox', priority }).priority).toBe(priority);
    }
    expect(taskProps.safeParse({ status: 'inbox', priority: 'p0' }).success).toBe(false);
    expect(taskProps.safeParse({ status: 'inbox', priority: 'P1' }).success).toBe(false);
  });

  it('still parses a legacy task that omits the new optional productivity keys', () => {
    expect(taskProps.parse({ status: 'inbox', due: '2026-09-11' })).toEqual({
      status: 'inbox',
      due: '2026-09-11',
    });
  });

  it('keeps optional target, importance, and other productivity fields when present', () => {
    const parsed = taskProps.parse({
      status: 'inbox',
      due: '2026-09-11',
      target: '2026-09-18',
      importance: 'important',
      follow_up: '2026-09-20',
      waiting_patience_days: 7,
      energy: 'low',
    });
    expect(parsed).toMatchObject({
      status: 'inbox',
      due: '2026-09-11',
      target: '2026-09-18',
      importance: 'important',
      follow_up: '2026-09-20',
      waiting_patience_days: 7,
      energy: 'low',
    });
  });

  it('keeps unknown keys on taskProps.passthrough() (legacy sparse docs)', () => {
    const parsed = NODE_PROPS_SCHEMAS.task.parse({
      status: 'inbox',
      legacy_import_field: 'kept',
      fourfold_open: true,
    });
    expect(parsed).toMatchObject({
      status: 'inbox',
      legacy_import_field: 'kept',
      fourfold_open: true,
    });
  });
});

describe('legacy project, goal, habit, application props', () => {
  it('parses a minimal project', () => {
    expect(projectProps.parse({})).toEqual({});
    expect(projectProps.parse({ kind: 'work', status: 'active', my_role: 'lead' })).toMatchObject({
      kind: 'work',
      status: 'active',
    });
  });

  it('parses the existing goal fixture shape', () => {
    const parsed = goalProps.parse({
      horizon: 'year',
      goal_status: 'active',
      key_results: [{ name: 'papers', target: 2, current: 1, unit: 'count' }],
    });
    expect(parsed.horizon).toBe('year');
    expect(parsed.key_results).toHaveLength(1);
  });

  it('parses the existing habit fixture shape', () => {
    const parsed = habitProps.parse({
      cadence: 'weekly',
      target_per_period: 3,
      schedule_days: [1, 3, 5],
      active: true,
    });
    expect(parsed.cadence).toBe('weekly');
    expect(parsed.schedule_days).toEqual([1, 3, 5]);
  });

  it('parses a minimal valid application', () => {
    const parsed = applicationProps.parse({
      role_title: 'Staff Engineer',
      status: 'interview',
      applied_on: '2026-08-01',
    });
    expect(parsed.role_title).toBe('Staff Engineer');
    expect(parsed.status).toBe('interview');
  });
});

describe('legacy reminder and ledger shapes (real core schemas)', () => {
  it('parses an interaction follow-up, the in-core reminder shape', () => {
    const parsed = interactionProps.parse({
      kind: 'call',
      occurred_at: '2026-09-04T12:00:00.000Z',
      follow_ups: [{ what: 'Ping Sam', due: '2026-09-11' }],
    });
    expect(parsed.follow_ups).toEqual([{ what: 'Ping Sam', due: '2026-09-11' }]);
  });

  it('parses a favor-ledger entry on KNOWS', () => {
    const parsed = knowsProps.parse({
      favors: [
        {
          direction: 'owed_to_me',
          what: 'intro to her VP',
          on: '2026-08-01',
        },
      ],
    });
    expect(parsed.favors).toHaveLength(1);
    expect(parsed.favors[0]).toMatchObject({
      direction: 'owed_to_me',
      what: 'intro to her VP',
      settled: false,
    });
  });
});

describe('legacy search and export (core types)', () => {
  it('parseFilterQuery returns the same keys on a tiny fixture', () => {
    const ast = parseFilterQuery('type:task after:2026-09-01 passport');
    expect(Object.keys(ast).sort()).toEqual(['clauses', 'invalid', 'text']);
    expect(ast.text).toBe('passport');
    expect(ast.clauses).toEqual(
      expect.arrayContaining([
        { field: 'type', value: 'task', raw: 'type:task' },
        { field: 'after', value: '2026-09-01', raw: 'after:2026-09-01' },
      ]),
    );
    expect(ast.invalid).toEqual([]);
  });

  it('parseGraphBundle keeps the same top-level keys on a tiny fixture', () => {
    const result = parseGraphBundle({
      format: 'vitae.graph.bundle',
      schema_version: 1,
      source: { system: 'test', exported_at: '2026-09-04T12:00:00.000Z' },
      nodes: [{ ref: 'task-1', type: 'task', title: 'Renew passport', props: { status: 'inbox' } }],
      edges: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a valid bundle');
    expect(Object.keys(result.value).sort()).toEqual([
      'edges',
      'format',
      'nodes',
      'schema_version',
      'source',
    ]);
    expect(result.value.nodes[0]?.type).toBe('task');
  });

  it('appends productivity edges without reordering the existing catalog', () => {
    const types = EDGE_TYPES as readonly string[];
    expect(types.indexOf('INTRODUCED')).toBeLessThan(types.indexOf('DEPENDS_ON'));
    expect(types.slice(-4)).toEqual(['DEPENDS_ON', 'SERVES_GOAL', 'WAITING_ON', 'FOR']);
    expect(types).toContain('KNOWS');
    expect(types).toContain('INTRODUCED');
  });
});
