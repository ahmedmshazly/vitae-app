import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { placementCasesSchema } from './fixture-schemas.js';
import {
  defaultPlacementContext,
  placeItem,
  type PlacementContext,
  type PlacementItem,
} from './placement.js';

function readCases() {
  const path = fileURLToPath(new URL('./__fixtures__/placement-cases.json', import.meta.url));
  return placementCasesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function contextFromCase(row: ReturnType<typeof readCases>[number]): PlacementContext {
  const waitingOn =
    row.waiting_on_name && row.input.waiting_on
      ? { id: row.input.waiting_on, name: row.waiting_on_name }
      : null;
  return defaultPlacementContext({
    now: row.now,
    urgencyWindowDays: row.urgency_window_days,
    waitingPatienceDays: row.waiting_patience_days ?? 7,
    waitingOn,
  });
}

describe('placeItem fixtures', () => {
  it('executes every placement-cases.json row', () => {
    for (const row of readCases()) {
      const placed = placeItem(row.input, contextFromCase(row));
      expect({ id: row.id, quadrant: placed.quadrant, reason: placed.reason }).toEqual({
        id: row.id,
        quadrant: row.expected.quadrant,
        reason: row.expected.reason,
      });
    }
  });
});

describe('placeItem: calendar dates and precedence', () => {
  const now = '2026-09-04';
  const ctx = defaultPlacementContext({ now, urgencyWindowDays: 7 });

  function item(overrides: Partial<PlacementItem>): PlacementItem {
    return { importance: 'none', ...overrides };
  }

  it('refuses a date it cannot read rather than placing quietly', () => {
    expect(() => placeItem(item({ due: 'not-a-date' }), ctx)).toThrow(/due/);
    expect(() => placeItem(item({ due: '2026-02-31' }), ctx)).toThrow(/due/);
  });

  it('lets an override beat a past due and does not report the computed reason', () => {
    const placed = placeItem(
      item({
        due: '2026-09-01',
        importance: 'critical',
        quadrant_override: { quadrant: 'eliminate', set_at: '2026-09-03' },
      }),
      ctx,
    );
    expect(placed.quadrant).toBe('eliminate');
    expect(placed.reason).toBe('placed_by_you');
    expect(placed.params).toEqual({ set_at: '2026-09-03' });
  });

  it('counts the far edge of the window as inside it', () => {
    const placed = placeItem(item({ due: '2026-09-11' }), ctx);
    expect(placed.reason).toBe('due_within_window');
    expect(placed.params.days_until).toBe(7);
  });

  it('does not treat a date beyond the window as urgent', () => {
    const placed = placeItem(item({ due: '2026-10-04' }), ctx);
    expect(placed.reason).toBe('no_signal');
  });

  it('lifts through a project default and a SERVES_GOAL link', () => {
    const viaProject = placeItem(
      { project_id: 'proj-1' },
      defaultPlacementContext({
        now,
        project: { id: 'proj-1', name: 'Move house', default_importance: 'important' },
      }),
    );
    expect(viaProject).toMatchObject({ quadrant: 'schedule', reason: 'project_default' });

    const viaGoal = placeItem(
      { serves_goal_id: 'goal-1' },
      defaultPlacementContext({
        now,
        goal: { id: 'goal-1', title: 'Q3 goal', importance: 'important' },
      }),
    );
    expect(viaGoal).toMatchObject({ quadrant: 'schedule', reason: 'serves_goal' });
  });

  it('never infers importance from a date', () => {
    const placed = placeItem(item({ due: '2026-09-01' }), ctx);
    expect(placed.quadrant).toBe('delegate');
    expect(placed.reason).toBe('due_past');
    expect(placed.reason).not.toBe('importance_asserted');
  });
});
