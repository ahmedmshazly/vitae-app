import { v4 as uuidv4 } from 'uuid';

export const newId = (): string => uuidv4();
export const nowIso = (): string => new Date().toISOString();

/** A plain JSON object, as opposed to null, an array, or a scalar. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A shallow RFC-6902-ish diff between two records: the fields whose values
 * changed, with before/after. Used for the revision `diff` (SRS §4.7).
 *
 * `props` is opened one level and its fields keyed as `props.<field>`, because
 * a node keeps almost everything that matters inside it. Comparing only the
 * top level recorded a single entry called `props` whose `from` and `to` were
 * the whole object, so the Ledger showed the same chip for an application's
 * status moving to `interview` as for a typo fixed in its notes, and the one
 * question the feed exists to answer went unanswered.
 *
 * It stops at one level deliberately. Walking arbitrarily deep would key
 * entries on array indices, which are not stable names, and would turn one
 * edit of a structured field into a dozen unreadable entries. A nested object
 * is reported whole. A props key containing a literal dot is therefore
 * ambiguous with a nested path, which is a trade the field names in this
 * schema (all snake_case, no dots) do not currently make us pay.
 */
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    const from = before[k];
    const to = after[k];
    // Both sides must be objects to pair fields up. When one side has no props
    // at all, naming individual keys would imply a comparison that never
    // happened, so the change is recorded whole.
    if (k === 'props' && isPlainObject(from) && isPlainObject(to)) {
      for (const field of new Set([...Object.keys(from), ...Object.keys(to)])) {
        if (JSON.stringify(from[field]) === JSON.stringify(to[field])) continue;
        diff[`props.${field}`] = { from: from[field], to: to[field] };
      }
      continue;
    }
    diff[k] = { from, to };
  }
  return diff;
}

/** Remove keys with `undefined` values before serialising a record. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
