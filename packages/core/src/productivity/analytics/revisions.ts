/**
 * Map stored Vitae revisions onto the flattened diffs analytics replay reads.
 * A create snapshot is create *placement* state. It is not field-level history:
 * an inferred create alone cannot mark a trail `complete` or count a completion.
 */
import type { RevisionOp } from '../../types.js';
import { REVISION_OPS } from '../../types.js';
import type { RuleActionValue } from '../contracts.js';
import { revisionHasFieldDiff, type ReplayRevision } from '../replay.js';
import type { HistoryCompleteness } from '../contracts.js';
import type { StoredRevisionLike, WorkspaceRevision } from './types.js';

const TASK_FIELDS = new Set([
  'status',
  'completed_at',
  'due',
  'target',
  'scheduled',
  'follow_up',
  'importance',
  'waiting_on',
  'waiting_since',
  'waiting_patience_days',
  'effort_min',
  'quadrant_override',
  'project_id',
  'serves_goal_id',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevisionOp(value: unknown): value is RevisionOp {
  return typeof value === 'string' && (REVISION_OPS as readonly string[]).includes(value);
}

function isActionValue(value: unknown): value is RuleActionValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  return isRecord(value) && typeof value.days === 'number' && Object.keys(value).length === 1;
}

function takeTo(value: unknown): unknown {
  if (isRecord(value) && 'to' in value) return value.to;
  return value;
}

function assignField(out: Record<string, RuleActionValue>, key: string, value: unknown): void {
  if (!TASK_FIELDS.has(key)) return;
  const next = takeTo(value);
  if (isActionValue(next)) out[key] = next;
}

function flattenStoredDiff(diff: unknown): Record<string, RuleActionValue> {
  if (!isRecord(diff)) return {};
  const out: Record<string, RuleActionValue> = {};
  for (const [key, value] of Object.entries(diff)) {
    if (key.startsWith('props.')) {
      assignField(out, key.slice(6), value);
      continue;
    }
    assignField(out, key, value);
  }
  return out;
}

function fieldsFromSnapshot(snapshot: unknown): Record<string, RuleActionValue> {
  if (!isRecord(snapshot)) return {};
  const props = isRecord(snapshot.props) ? snapshot.props : snapshot;
  const out: Record<string, RuleActionValue> = {};
  for (const [key, value] of Object.entries(props)) {
    assignField(out, key, value);
  }
  return out;
}

/** Flatten a stored diff, or a create snapshot when the diff is empty. */
export function flattenAnalyticsDiff(
  diff: unknown,
  snapshot?: unknown,
  op?: RevisionOp,
): Record<string, RuleActionValue> {
  const fromDiff = flattenStoredDiff(diff);
  if (Object.keys(fromDiff).length > 0) return fromDiff;
  if (op === 'create') return fieldsFromSnapshot(snapshot);
  return fromDiff;
}

export function isInferredCreateDiff(diff: unknown, op?: RevisionOp): boolean {
  return op === 'create' && Object.keys(flattenStoredDiff(diff)).length === 0;
}

export function toWorkspaceRevision(raw: StoredRevisionLike): WorkspaceRevision | null {
  if (typeof raw.subject_id !== 'string' || raw.subject_id.length === 0) return null;
  if (typeof raw.rev !== 'number' || !Number.isInteger(raw.rev)) return null;
  if (typeof raw.at !== 'string' || raw.at.length === 0) return null;
  if (!isRevisionOp(raw.op)) return null;
  const inferred = isInferredCreateDiff(raw.diff, raw.op);
  return {
    subject_id: raw.subject_id,
    rev: raw.rev,
    op: raw.op,
    at: raw.at,
    diff: flattenAnalyticsDiff(raw.diff, raw.snapshot, raw.op),
    ...(inferred ? { inferred: true } : {}),
  };
}

export function toReplayRevision(revision: WorkspaceRevision): ReplayRevision {
  return {
    rev: revision.rev,
    op: revision.op,
    at: revision.at,
    diff: revision.diff,
    ...(revision.inferred ? { inferred: true } : {}),
  };
}

export function historyCompletenessOf(revisions: readonly ReplayRevision[]): HistoryCompleteness {
  if (revisions.length === 0) return 'unknown';
  const stored = revisions.filter((revision) => !revision.inferred);
  if (stored.length === 0) return 'sparse';
  if (stored.some((revision) => !revisionHasFieldDiff(revision))) return 'sparse';
  return 'complete';
}

export function worseCompleteness(
  left: HistoryCompleteness,
  right: HistoryCompleteness,
): HistoryCompleteness {
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  if (left === 'sparse' || right === 'sparse') return 'sparse';
  return 'complete';
}

export function revisionsFor(
  subjectId: string,
  revisions: readonly WorkspaceRevision[],
): WorkspaceRevision[] {
  return revisions.filter((revision) => revision.subject_id === subjectId);
}
