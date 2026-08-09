import { v4 as uuidv4 } from 'uuid';

export const newId = (): string => uuidv4();
export const nowIso = (): string => new Date().toISOString();

/**
 * A shallow RFC-6902-ish diff between two records: the fields whose values
 * changed, with before/after. Used for the revision `diff` (SRS §4.7).
 */
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      diff[k] = { from: before[k], to: after[k] };
    }
  }
  return diff;
}

/** Remove keys with `undefined` values before serialising a record. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
