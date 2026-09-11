/**
 * Evaluate stored rule conditions and apply action patches. No I/O.
 * An unauthored `{}` matches nothing. `now` / `timeZone` are arguments.
 */
import { addCalendarDays, resolveCalendarNow } from './calendar.js';
import {
  MATCH_FIELDS,
  PREDICATE_OPERATORS,
  type PredicateOperator,
  type RuleAction,
  type RuleActionValue,
  type RuleCondition,
} from './contracts.js';
import {
  defaultPlacementContext,
  placeItem,
  type PlacementContext,
  type PlacementItem,
} from './placement.js';

const MATCH_FIELD_SET = new Set<string>(MATCH_FIELDS);
const PREDICATE_OPERATOR_SET = new Set<string>(PREDICATE_OPERATORS);
const DATE_FIELDS = new Set(['due', 'target', 'scheduled', 'follow_up']);
const CONTAINS_FIELDS = new Set(['title']);

const ACTIONABLE_FIELDS = new Set<string>([
  ...MATCH_FIELDS,
  'status',
  'priority',
  'importance',
  'due',
  'target',
  'scheduled',
  'follow_up',
  'title',
  'effort_min',
]);

export interface RuleItem extends PlacementItem {
  readonly title?: string;
  readonly type?: string;
  readonly status?: string;
  readonly priority?: string | null;
  readonly scheduled?: string | null;
  readonly completed_at?: string | null;
  readonly waiting_on?: string | null;
  readonly effort_min?: number | null;
  readonly quadrant?: string;
  readonly [key: string]: unknown;
}

export interface RuleContext extends PlacementContext {}

export interface StoredRule {
  readonly enabled: boolean;
  readonly condition: RuleCondition | Record<string, never>;
  readonly actions: readonly RuleAction[];
}

export interface RuleEvaluation {
  readonly matches: boolean;
  readonly patch?: Record<string, RuleActionValue>;
}

export class ImmutableFieldError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`apply: '${field}' is not a writable item field`);
    this.name = 'ImmutableFieldError';
    this.field = field;
  }
}

function isCondition(value: unknown): value is RuleCondition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((entry, index) => structurallyEqual(entry, right[index]));
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    return leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && structurallyEqual(leftRecord[key], rightRecord[key]),
    );
  }
  return false;
}

function isSet(value: unknown): boolean {
  if (value == null) return false;
  if (value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function sameValue(field: string, left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  if (DATE_FIELDS.has(field) && typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  return structurallyEqual(left, right);
}

function readField(item: RuleItem, field: string, ctx: RuleContext): unknown {
  if (field === 'quadrant') {
    return placeItem(item, ctx).quadrant;
  }
  if (field === 'waiting_on') {
    return item.waiting_on;
  }
  return item[field];
}

function titleContains(title: unknown, needle: unknown): boolean {
  if (typeof title !== 'string' || typeof needle !== 'string') return false;
  if (needle.length === 0) return false;
  return title.toLowerCase().includes(needle.toLowerCase());
}

function compareToOffset(
  field: string,
  actual: unknown,
  value: unknown,
  now: string,
  side: 'before' | 'after',
): boolean {
  if (!DATE_FIELDS.has(field)) {
    throw new RangeError(`evaluate: operator '${side}' does not apply to '${field}'`);
  }
  if (typeof actual !== 'string') return false;
  if (typeof value !== 'object' || value === null || !('days' in value)) {
    throw new RangeError('evaluate: before/after requires { days: number }');
  }
  const days = (value as { days: unknown }).days;
  if (typeof days !== 'number' || !Number.isFinite(days)) {
    throw new RangeError('evaluate: before/after requires { days: number }');
  }
  const edge = addCalendarDays(now, days);
  return side === 'before' ? actual <= edge : actual >= edge;
}

function evaluatePredicate(
  condition: Extract<RuleCondition, { kind: 'predicate' }>,
  item: RuleItem,
  ctx: RuleContext,
): boolean {
  if (!MATCH_FIELD_SET.has(condition.field)) {
    throw new RangeError(`evaluate: '${condition.field}' is not a matchable field`);
  }
  if (!PREDICATE_OPERATOR_SET.has(condition.operator)) {
    throw new RangeError(`evaluate: operator '${condition.operator}' is not on the menu`);
  }

  const actual = readField(item, condition.field, ctx);
  const operator = condition.operator as PredicateOperator;

  switch (operator) {
    case 'eq':
      return sameValue(condition.field, actual, condition.value);
    case 'neq':
      return !sameValue(condition.field, actual, condition.value);
    case 'is_set':
      return isSet(actual);
    case 'is_not_set':
      return !isSet(actual);
    case 'contains':
      if (!CONTAINS_FIELDS.has(condition.field)) {
        throw new RangeError(`evaluate: operator 'contains' does not apply to '${condition.field}'`);
      }
      return titleContains(actual, condition.value);
    case 'before':
      return compareToOffset(
        condition.field,
        actual,
        condition.value,
        resolveCalendarNow(ctx.now, ctx.timeZone ?? 'UTC'),
        'before',
      );
    case 'after':
      return compareToOffset(
        condition.field,
        actual,
        condition.value,
        resolveCalendarNow(ctx.now, ctx.timeZone ?? 'UTC'),
        'after',
      );
    default:
      return false;
  }
}

export function evaluateCondition(
  condition: RuleCondition | Record<string, never>,
  item: RuleItem,
  ctx: RuleContext,
): boolean {
  if (!isCondition(condition)) return false;
  switch (condition.kind) {
    case 'all':
      return condition.conditions.every((child) => evaluateCondition(child, item, ctx));
    case 'any':
      return condition.conditions.some((child) => evaluateCondition(child, item, ctx));
    case 'not':
      return !evaluateCondition(condition.condition, item, ctx);
    case 'predicate':
      return evaluatePredicate(condition, item, ctx);
    default:
      return false;
  }
}

export function applyActions(
  actions: readonly RuleAction[],
  item: Readonly<Record<string, unknown>>,
): Record<string, RuleActionValue> {
  for (const action of actions) {
    if (!ACTIONABLE_FIELDS.has(action.field)) {
      throw new ImmutableFieldError(action.field);
    }
  }

  const intended: Record<string, RuleActionValue> = {};
  for (const action of actions) {
    intended[action.field] = action.value;
  }

  const patch: Record<string, RuleActionValue> = {};
  for (const [field, value] of Object.entries(intended)) {
    if (!sameValue(field, item[field], value)) {
      patch[field] = value;
    }
  }
  return patch;
}

export function evaluateRule(rule: StoredRule, item: RuleItem, ctx?: Partial<RuleContext>): RuleEvaluation {
  if (!rule.enabled) return { matches: false };

  const resolved = defaultPlacementContext({
    now: ctx?.now ?? '1970-01-01',
    ...ctx,
  });

  const matches = evaluateCondition(rule.condition, item, resolved);
  if (!matches) return { matches: false };

  const patch = applyActions(rule.actions, item);
  return { matches: true, patch };
}
