/**
 * What an import would change about a record it has already matched by identity
 * key (SRS FR-SYNC-001: imports propose field-level updates, FR-SYNC-002:
 * re-import is longitudinal).
 *
 * Once a staged row resolves to an existing record, the interesting question
 * stops being "is this a duplicate" and becomes "what is different", and the
 * answer has to be per field: the reviewer accepts or rejects each one, and the
 * batch report counts a row with no differences as *unchanged* rather than as
 * an update nobody asked for.
 *
 * Two rules make that count mean something.
 *
 * The comparison walks the incoming record, not the stored one. An importer has
 * an opinion about the handful of fields it writes and none at all about
 * everything else on the record, so a field the importer never sets is not a
 * removal and must not appear in the diff.
 *
 * Sync bookkeeping is excluded. `last_synced_at` moves on every GitHub run
 * whatever GitHub said, so comparing it makes every record look changed, the
 * unchanged bucket reads zero forever, and the report satisfies FR-SYNC-002 in
 * name while telling the owner nothing.
 */

/** One field an import proposes to change, with both sides of the change. */
export interface FieldChange {
  /** Dotted for nested props: `title`, `props.headline`. */
  key: string;
  from: unknown;
  to: unknown;
}

/**
 * Fields a sync writes on every run regardless of what the source said, so
 * their movement is evidence of nothing. Excluded from change comparison; see
 * the module note above for why the unchanged count depends on it.
 */
export const SYNC_BOOKKEEPING_FIELDS: readonly string[] = ['props.last_synced_at'];

/**
 * The fields `incoming` would change about `current`.
 *
 * Descends exactly one level, so `props` compares key by key and reports
 * `props.headline` rather than the whole bag. One level is deliberate: it is
 * the depth at which a reviewer can still say yes or no to a single fact, and
 * the depth the revision diff uses, so a proposal and the Ledger entry it
 * produces describe the change in the same words.
 */
export function changedFields(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  opts: { ignore?: readonly string[] } = {},
): FieldChange[] {
  const ignore = new Set(opts.ignore ?? []);
  const changes: FieldChange[] = [];
  for (const [key, next] of Object.entries(incoming)) {
    if (next === undefined || ignore.has(key)) continue;
    const prev = current[key];
    if (isPlainObject(next) && (prev === undefined || isPlainObject(prev))) {
      const prevBag = (prev ?? {}) as Record<string, unknown>;
      for (const [nestedKey, nestedNext] of Object.entries(next)) {
        const dotted = `${key}.${nestedKey}`;
        if (nestedNext === undefined || ignore.has(dotted)) continue;
        if (!deepEqual(prevBag[nestedKey], nestedNext)) {
          changes.push({ key: dotted, from: prevBag[nestedKey], to: nestedNext });
        }
      }
      continue;
    }
    if (!deepEqual(prev, next)) changes.push({ key, from: prev, to: next });
  }
  return changes;
}

/**
 * A top-level patch that sets the given dotted keys, for `stageNodeUpdate`'s
 * spread-over-the-record shape.
 *
 * A nested key rebuilds its whole parent from `current`, because the patch is
 * spread over the record and half a `props` bag would erase the other half.
 * Setting a nested key to `undefined` deletes it, which is what reversing a
 * change that *added* a field has to mean.
 */
export function patchForFields(
  current: Record<string, unknown>,
  values: ReadonlyArray<{ key: string; value: unknown }>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const { key, value } of values) {
    const dot = key.indexOf('.');
    if (dot < 0) {
      patch[key] = value;
      continue;
    }
    const parent = key.slice(0, dot);
    const child = key.slice(dot + 1);
    const bag = (patch[parent] as Record<string, unknown> | undefined) ?? {
      ...((current[parent] as Record<string, unknown> | undefined) ?? {}),
    };
    if (value === undefined) delete bag[child];
    else bag[child] = value;
    patch[parent] = bag;
  }
  return patch;
}

/**
 * A record with its empty values removed, one level deep.
 *
 * An importer always produces a value for every field its destination needs,
 * because creating a record needs one: a vCard with no TEL still yields
 * `phones: []` and `socials: {}`. On a create that is harmless. On an update it
 * is a lie, and comparing it would propose wiping the phone numbers and the
 * profile URL already stored because this particular export happened to be
 * sparse.
 *
 * So an import proposes what its source states. Deciding that something the
 * source is silent about should be removed is the owner's call, not a file's,
 * which does mean a value genuinely deleted at the source is not proposed for
 * deletion here. That is the safe direction to be wrong in.
 */
export function statedFieldsOnly(record: Record<string, unknown>): Record<string, unknown> {
  const stated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isEmptyValue(value)) continue;
    if (isPlainObject(value)) {
      const bag: Record<string, unknown> = {};
      for (const [nested, nestedValue] of Object.entries(value)) {
        if (!isEmptyValue(nestedValue)) bag[nested] = nestedValue;
      }
      stated[key] = bag;
      continue;
    }
    stated[key] = value;
  }
  return stated;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** Reads a dotted key off a record, so a rollback can capture what it replaces. */
export function readField(record: Record<string, unknown>, key: string): unknown {
  const dot = key.indexOf('.');
  if (dot < 0) return record[key];
  const parent = record[key.slice(0, dot)];
  return isPlainObject(parent) ? parent[key.slice(dot + 1)] : undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Structural equality, key order included as noise rather than signal.
 *
 * `JSON.stringify` comparison was the obvious shortcut and is wrong here: props
 * bags are rebuilt from scratch on every import, so two identical bags written
 * in a different key order would serialise differently and every re-import
 * would report a change that is not one.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!deepEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}
