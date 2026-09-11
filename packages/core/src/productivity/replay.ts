/**
 * Deterministic revision replay. Applies field-level diffs in revision order.
 * No clock, no store.
 */
import type { RevisionOp } from '../types.js';
import type { RuleActionValue } from './contracts.js';

export interface ReplayRevision {
  readonly rev: number;
  readonly op: RevisionOp;
  readonly at: string;
  readonly diff: Readonly<Record<string, RuleActionValue>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Overlay `revisions` onto `base` in ascending `rev` order.
 * The same revisions applied twice yield the same object shape.
 */
export function replayRevisions<T extends Record<string, unknown>>(
  base: T,
  revisions: readonly ReplayRevision[],
): T {
  const ordered = [...revisions].sort((left, right) => {
    if (left.rev !== right.rev) return left.rev - right.rev;
    return left.at.localeCompare(right.at);
  });

  let state: Record<string, unknown> = { ...base };
  for (const revision of ordered) {
    if (revision.op === 'delete') {
      state = { ...state, deleted: true };
      continue;
    }
    if (revision.op === 'restore') {
      const { deleted: _deleted, ...rest } = state;
      state = rest;
      continue;
    }
    if (!isRecord(revision.diff)) continue;
    state = { ...state, ...revision.diff };
  }
  return state as T;
}

export function revisionHasFieldDiff(revision: ReplayRevision): boolean {
  return isRecord(revision.diff) && Object.keys(revision.diff).length > 0;
}
