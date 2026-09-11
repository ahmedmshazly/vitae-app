/**
 * Productivity list filters over Vitae task read models.
 *
 * Does not replace `parseFilterQuery` in `@vitae/core` algorithms. Field
 * names follow the compatibility map (`due`, `target`, Vitae statuses).
 * Only fields `TaskReadModel` can satisfy are accepted; a `field:value`
 * token the matcher cannot honour is invalid, not a silent miss.
 */
import { tokenizeQuery } from '../algorithms/filter-grammar.js';
import { DATE_ONLY, isValidDateOnly } from './calendar.js';
import { IMPORTANCE, QUADRANTS, VITAE_PRIORITIES, VITAE_TASK_STATUSES } from './contracts.js';
import type { TaskReadModel } from './read-models.js';

/** Closed set: every member has a `clauseMatches` arm that can return true. */
export const PRODUCTIVITY_FILTER_FIELDS = [
  'status',
  'importance',
  'priority',
  'quadrant',
  'project',
  'has',
  'is',
  'due_before',
  'due_after',
  'target_before',
  'target_after',
] as const;

export type ProductivityFilterField = (typeof PRODUCTIVITY_FILTER_FIELDS)[number];

export const PRODUCTIVITY_FILTER_INVALID_REASONS = [
  'empty_value',
  'unknown_field',
  'unknown_value',
  'invalid_date',
] as const;

export type ProductivityFilterInvalidReason = (typeof PRODUCTIVITY_FILTER_INVALID_REASONS)[number];

export interface ProductivityFilterClause {
  readonly field: ProductivityFilterField;
  readonly value: string;
  readonly raw: string;
}

export interface ProductivityFilterAst {
  readonly text: string;
  readonly clauses: readonly ProductivityFilterClause[];
  readonly invalid: readonly { readonly raw: string; readonly reason: ProductivityFilterInvalidReason }[];
}

const FIELD_SET = new Set<string>(PRODUCTIVITY_FILTER_FIELDS);
const HAS_VALUES = new Set(['due', 'target', 'follow_up']);
const IS_VALUES = new Set(['waiting', 'dropped', 'open', 'placed']);
const STATUS_SET = new Set<string>(VITAE_TASK_STATUSES);
const PRIORITY_SET = new Set<string>(VITAE_PRIORITIES);
const IMPORTANCE_SET = new Set<string>(IMPORTANCE);
const QUADRANT_SET = new Set<string>(QUADRANTS);

function validate(field: ProductivityFilterField, value: string): ProductivityFilterInvalidReason | null {
  if (value === '') return 'empty_value';
  switch (field) {
    case 'status':
      return STATUS_SET.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'priority':
      return PRIORITY_SET.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'importance':
      return IMPORTANCE_SET.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'quadrant':
      return QUADRANT_SET.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'has':
      return HAS_VALUES.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'is':
      return IS_VALUES.has(value.toLowerCase()) ? null : 'unknown_value';
    case 'due_before':
    case 'due_after':
    case 'target_before':
    case 'target_after':
      return DATE_ONLY.test(value) && isValidDateOnly(value) ? null : 'invalid_date';
    case 'project':
      return null;
  }
}

export function parseProductivityFilter(query: string): ProductivityFilterAst {
  const clauses: ProductivityFilterClause[] = [];
  const invalid: ProductivityFilterAst['invalid'][number][] = [];
  const textParts: string[] = [];

  for (const token of tokenizeQuery(query)) {
    const colon = token.indexOf(':');
    if (colon > 0) {
      const field = token.slice(0, colon).toLowerCase();
      let value = token.slice(colon + 1);
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        value = value.slice(1, -1);
      }
      if (FIELD_SET.has(field)) {
        const typed = field as ProductivityFilterField;
        const reason = validate(typed, value);
        if (reason === null) {
          clauses.push({ field: typed, value, raw: token });
        } else {
          invalid.push({ raw: token, reason });
        }
        continue;
      }
      invalid.push({ raw: token, reason: 'unknown_field' });
      continue;
    }
    textParts.push(token.replace(/^"|"$/g, ''));
  }

  return { text: textParts.join(' ').trim(), clauses, invalid };
}

function isSet(value: unknown): boolean {
  if (value == null) return false;
  if (value === '') return false;
  return true;
}

function clauseMatches(task: TaskReadModel, clause: ProductivityFilterClause): boolean {
  const value = clause.value.toLowerCase();
  switch (clause.field) {
    case 'status':
      return task.status === value;
    case 'importance':
      return (task.importance ?? '').toLowerCase() === value;
    case 'priority':
      return (task.priority ?? '').toLowerCase() === value;
    case 'quadrant':
      return (task.placement?.quadrant ?? task.quadrant ?? '') === value;
    case 'project':
      return (task.project_id ?? '').toLowerCase() === value;
    case 'has':
      if (value === 'due') return isSet(task.due);
      if (value === 'target') return isSet(task.target);
      if (value === 'follow_up') return isSet(task.follow_up);
      return false;
    case 'is':
      if (value === 'waiting') return task.status === 'waiting';
      if (value === 'dropped') return task.status === 'dropped';
      if (value === 'open') return task.open === true || ['inbox', 'next', 'doing'].includes(task.status);
      if (value === 'placed') return task.placement != null || task.quadrant != null;
      return false;
    case 'due_before':
      return task.due != null && task.due <= clause.value;
    case 'due_after':
      return task.due != null && task.due >= clause.value;
    case 'target_before':
      return task.target != null && task.target <= clause.value;
    case 'target_after':
      return task.target != null && task.target >= clause.value;
  }
}

export function matchTask(task: TaskReadModel, ast: ProductivityFilterAst): boolean {
  if (ast.invalid.length > 0) return false;
  if (!ast.clauses.every((clause) => clauseMatches(task, clause))) return false;
  if (ast.text === '') return true;
  return task.title.toLowerCase().includes(ast.text.toLowerCase());
}

export function filterTasks(tasks: readonly TaskReadModel[], query: string): TaskReadModel[] {
  const ast = parseProductivityFilter(query);
  return tasks.filter((task) => matchTask(task, ast));
}
