/**
 * Which quadrant a task belongs in, and why.
 *
 * Precedence (first match wins). Copied from Fourfold `placement.ts`:
 *
 *  0. `quadrant_override` set            → its quadrant, `placed_by_you`
 *                                          params { set_at }
 *
 *  Urgency axis. Any one of these makes the item urgent; the first that fires
 *  is the reason spoken.
 *  1. `due` already passed               → `due_past`
 *                                          { due, days_past }
 *  2. `due` inside the window            → `due_within_window`
 *                                          { due, days_until, window_days }
 *  3. `target` already passed            → `target_past`
 *                                          { target, days_past }
 *  4. `target` inside the window         → `target_within_window`
 *                                          { target, days_until, window_days }
 *  5. `follow_up` reached                → `follow_up_due`
 *                                          { follow_up, days_past }
 *  6. waiting longer than patience       → `waiting_patience_exceeded`
 *                                          { person, days_waiting, patience_days }
 *     Patience is the item's own `waiting_patience_days`, else the person's,
 *     else the workspace's.
 *  7. a pipeline stage's patience passed → `stage_patience_exceeded`
 *                                          { days_in_stage, patience_days, stage }
 *
 *  Importance axis. Spoken only when nothing on the urgency axis fired.
 *  Never inferred from a date.
 *  8. `importance` asserted on the item  → `importance_asserted` { importance }
 *  9. the goal it serves is important    → `serves_goal` { goal }
 * 10. the project defaults its items     → `project_default` { project }
 *
 * 11. nothing fired                       → `eliminate`, `no_signal` {}
 *
 * Dates are calendar days. `now` / `timeZone` are arguments; this module
 * does not read the host clock.
 */
import {
  DEFAULT_URGENCY_WINDOW_DAYS,
  DEFAULT_WAITING_PATIENCE_DAYS,
  assertDateOnly,
  calendarDaysBetween,
  resolveCalendarNow,
} from './calendar.js';
import type { Importance, Quadrant, QuadrantOverride, ReasonKey } from './contracts.js';
import type { Placement, ReasonParams } from './read-models.js';

export interface PlacementItem {
  readonly due?: string | null;
  readonly target?: string | null;
  readonly follow_up?: string | null;
  readonly importance?: Importance | null;
  readonly waiting_on?: string | null;
  readonly waiting_since?: string | null;
  readonly waiting_patience_days?: number | null;
  readonly quadrant_override?: QuadrantOverride | null;
  readonly project_id?: string | null;
  readonly serves_goal_id?: string | null;
  readonly opportunity_id?: string | null;
}

export interface PlacementProject {
  readonly id: string;
  readonly name: string;
  readonly default_importance?: Importance | null;
}

export interface PlacementGoal {
  readonly id: string;
  readonly title: string;
  readonly importance?: Importance | null;
}

export interface PlacementWaitingOn {
  readonly id: string;
  readonly name: string;
  readonly patience_days?: number | null;
}

export interface PlacementStage {
  readonly id: string;
  readonly name: string;
  readonly patience_days: number | null;
  readonly entered_at: string;
}

export interface PlacementContext {
  readonly now: string | Date;
  readonly timeZone?: string;
  readonly urgencyWindowDays: number;
  readonly waitingPatienceDays: number;
  readonly project: PlacementProject | null;
  readonly goal: PlacementGoal | null;
  readonly waitingOn: PlacementWaitingOn | null;
  readonly stage: PlacementStage | null;
}

type Signal = { reason: ReasonKey; params: ReasonParams } | null;

function optionalDate(iso: string | null | undefined, field: string): string | null {
  if (iso == null || iso === '') return null;
  return assertDateOnly(iso, field);
}

function declared(importance: Importance | null | undefined): boolean {
  return importance != null && importance !== 'none';
}

function dateSignal(
  iso: string | null | undefined,
  now: string,
  windowDays: number,
  field: 'due' | 'target',
  pastReason: ReasonKey,
  withinReason: ReasonKey,
): Signal {
  const day = optionalDate(iso, field);
  if (day === null) return null;

  if (day <= now) {
    return {
      reason: pastReason,
      params: { [field]: day, days_past: calendarDaysBetween(day, now) },
    };
  }

  const daysUntil = calendarDaysBetween(now, day);
  if (daysUntil <= windowDays) {
    return {
      reason: withinReason,
      params: { [field]: day, days_until: daysUntil, window_days: windowDays },
    };
  }

  return null;
}

function waitingOnFor(item: PlacementItem, ctx: PlacementContext): PlacementWaitingOn | null {
  if (ctx.waitingOn === null) return null;
  if (ctx.waitingOn.id !== item.waiting_on) return null;
  return ctx.waitingOn;
}

function waitingSignal(item: PlacementItem, ctx: PlacementContext, now: string): Signal {
  if (item.waiting_on == null || item.waiting_since == null) return null;

  const since = assertDateOnly(item.waiting_since, 'waiting_since');
  const person = waitingOnFor(item, ctx);
  const patienceDays =
    item.waiting_patience_days ?? person?.patience_days ?? ctx.waitingPatienceDays;
  const daysWaiting = calendarDaysBetween(since, now);

  if (daysWaiting < patienceDays) return null;

  return {
    reason: 'waiting_patience_exceeded',
    params: {
      person: person?.name ?? '',
      days_waiting: daysWaiting,
      patience_days: patienceDays,
    },
  };
}

function stageSignal(item: PlacementItem, ctx: PlacementContext, now: string): Signal {
  if (item.opportunity_id == null) return null;
  if (ctx.stage === null) return null;

  const { patience_days: patienceDays, entered_at: enteredAt, name } = ctx.stage;
  if (patienceDays === null) return null;

  const entered = assertDateOnly(enteredAt, 'entered_at');
  const daysInStage = calendarDaysBetween(entered, now);
  if (daysInStage < patienceDays) return null;

  return {
    reason: 'stage_patience_exceeded',
    params: { days_in_stage: daysInStage, patience_days: patienceDays, stage: name },
  };
}

function urgencySignal(item: PlacementItem, ctx: PlacementContext, now: string): Signal {
  const due = dateSignal(item.due, now, ctx.urgencyWindowDays, 'due', 'due_past', 'due_within_window');
  if (due) return due;

  const target = dateSignal(
    item.target,
    now,
    ctx.urgencyWindowDays,
    'target',
    'target_past',
    'target_within_window',
  );
  if (target) return target;

  if (item.follow_up != null) {
    const at = assertDateOnly(item.follow_up, 'follow_up');
    if (at <= now) {
      return {
        reason: 'follow_up_due',
        params: { follow_up: at, days_past: calendarDaysBetween(at, now) },
      };
    }
  }

  const waiting = waitingSignal(item, ctx, now);
  if (waiting) return waiting;

  return stageSignal(item, ctx, now);
}

function goalSignal(item: PlacementItem, goal: PlacementGoal | null): Signal {
  if (goal === null) return null;
  if (goal.id !== item.serves_goal_id) return null;
  if (!declared(goal.importance)) return null;
  return { reason: 'serves_goal', params: { goal: goal.title } };
}

function projectSignal(item: PlacementItem, project: PlacementProject | null): Signal {
  if (project === null) return null;
  if (project.id !== item.project_id) return null;
  if (!declared(project.default_importance)) return null;
  return { reason: 'project_default', params: { project: project.name } };
}

function importanceSignal(item: PlacementItem, ctx: PlacementContext): Signal {
  if (declared(item.importance)) {
    return { reason: 'importance_asserted', params: { importance: item.importance as string } };
  }
  return goalSignal(item, ctx.goal) ?? projectSignal(item, ctx.project);
}

function quadrantFor(important: boolean, urgent: boolean): Quadrant {
  if (important) return urgent ? 'do' : 'schedule';
  return urgent ? 'delegate' : 'eliminate';
}

export function placeItem(item: PlacementItem, ctx: PlacementContext): Placement {
  if (item.quadrant_override != null) {
    return {
      quadrant: item.quadrant_override.quadrant,
      reason: 'placed_by_you',
      params: { set_at: item.quadrant_override.set_at },
    };
  }

  const now = resolveCalendarNow(ctx.now, ctx.timeZone ?? 'UTC');
  const urgency = urgencySignal(item, ctx, now);
  const importance = importanceSignal(item, ctx);
  const quadrant = quadrantFor(importance !== null, urgency !== null);
  const spoken = urgency ?? importance;

  if (spoken === null) {
    return { quadrant, reason: 'no_signal', params: {} };
  }

  return { quadrant, reason: spoken.reason, params: spoken.params };
}

export function defaultPlacementContext(
  overrides: Partial<PlacementContext> & Pick<PlacementContext, 'now'>,
): PlacementContext {
  return {
    urgencyWindowDays: DEFAULT_URGENCY_WINDOW_DAYS,
    waitingPatienceDays: DEFAULT_WAITING_PATIENCE_DAYS,
    timeZone: 'UTC',
    project: null,
    goal: null,
    waitingOn: null,
    stage: null,
    ...overrides,
  };
}
