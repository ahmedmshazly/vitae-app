/**
 * List state that lives in the URL.
 *
 * Four screens keep their filters in four different places, and one screen
 * (routes/Atoms.tsx) keeps `owner` in the URL while its search box and its two
 * dropdowns sit in `useState`, so half of a filtered view can be linked and
 * half of it cannot. This module is the one place that answer lives: declare
 * the list state a screen has, and it round-trips to the query string.
 *
 * Four rules, each of them a bug found in the code this replaces.
 *
 * 1. **A declared default is absent from the URL.** `?kind=all&sort=recent`
 *    is the same view as `/atoms`, and the shorter one is the link a person
 *    will paste. Encoding a value that equals its default is how a "clean"
 *    view ends up with a query string nobody can read.
 * 2. **Unrelated params survive.** `applyListParams` starts from the params
 *    that are already there and touches only the keys the schema declares.
 *    features/timeline/TimelineView.tsx and features/map/AtlasView.tsx both
 *    build a fresh `URLSearchParams` and hand it to `setParams`, so every
 *    other key on the URL, `owner`, `new`, a deep link's anchor, is dropped
 *    the first time the zoom changes.
 * 3. **Malformed input falls back, it never throws.** A query string is user
 *    input: `?sort=;drop&kind=unicorn` has to render the default view, not a
 *    blank screen.
 * 4. **Typing replaces, it does not push.** Same 250ms debounce and same
 *    `replace` that routes/SearchResults.tsx already uses, so the back button
 *    points at wherever you came from rather than at every keystroke. A facet
 *    or a sort change does push: that one *is* a step you should be able to
 *    undo.
 *
 * No `useEffect` sets state here. The URL is read during render, and the one
 * piece of state (the keystrokes not yet written) is adjusted during render
 * from the value the URL reports, which is React's documented alternative to
 * the setState-in-effect pattern the lint config is trying to shrink. The two
 * effects that do exist only keep a ref current and clear timers on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** What routes/SearchResults.tsx waits after the last keystroke. */
export const TYPING_DEBOUNCE_MS = 250;

export type SortDir = 'asc' | 'desc';

/** Free text: a search box. */
export interface TextSpec {
  kind: 'text';
  default: string;
  /** ms after the last keystroke before the URL is rewritten. */
  debounce: number;
}

/** One value out of a closed set: a kind, a state, a tab. */
export interface FacetSpec<V extends string = string> {
  kind: 'facet';
  values: readonly V[];
  default: V;
}

/** A sort key and a direction, carried in one param. */
export interface SortSpec<K extends string = string> {
  kind: 'sort';
  keys: readonly K[];
  default: K;
  defaultDir: SortDir;
}

export interface SortValue<K extends string = string> {
  key: K;
  dir: SortDir;
}

export type ListParamSpec = TextSpec | FacetSpec | SortSpec;
export type ListParamSchema = Readonly<Record<string, ListParamSpec>>;

/** The value a single spec decodes to. */
export type ListParamValue<S extends ListParamSpec> = S extends TextSpec
  ? string
  : S extends FacetSpec<infer V>
    ? V
    : S extends SortSpec<infer K>
      ? SortValue<K>
      : never;

/** The whole declared state, decoded. */
export type ListValues<S extends ListParamSchema> = {
  [K in keyof S]: ListParamValue<S[K]>;
};

/** Just the names whose spec is free text, so `drafts` cannot be indexed by a facet. */
export type TextParamName<S extends ListParamSchema> = {
  [K in keyof S]: S[K] extends TextSpec ? K : never;
}[keyof S] &
  string;

// ── Declaring a schema ───────────────────────────────────────────────────────

export function textParam(options: { default?: string; debounce?: number } = {}): TextSpec {
  return {
    kind: 'text',
    default: options.default ?? '',
    debounce: options.debounce ?? TYPING_DEBOUNCE_MS,
  };
}

/**
 * `const` on the type parameter so `facetParam(['all', 'pinned'], 'all')`
 * infers `'all' | 'pinned'` rather than `string`: a facet whose values are
 * widened to `string` is a facet the compiler cannot check a screen against.
 */
export function facetParam<const V extends string>(
  values: readonly V[],
  defaultValue: V,
): FacetSpec<V> {
  return { kind: 'facet', values, default: defaultValue };
}

export function sortParam<const K extends string>(
  keys: readonly K[],
  defaultKey: K,
  defaultDir: SortDir = 'desc',
): SortSpec<K> {
  return { kind: 'sort', keys, default: defaultKey, defaultDir };
}

// ── Encoding ─────────────────────────────────────────────────────────────────

function isSortDir(value: unknown): value is SortDir {
  return value === 'asc' || value === 'desc';
}

/**
 * One param, off the URL. Total by construction: every branch has an answer
 * for `null`, for a value outside the declared set, and for a shape the spec
 * does not recognise.
 */
function decode(spec: ListParamSpec, raw: string | null): unknown {
  switch (spec.kind) {
    case 'text': {
      // A param that is present but blank reads as absent. Whitespace is not
      // a search term, and `?q=` should not narrow anything.
      const text = (raw ?? '').trim();
      return text === '' ? spec.default : text;
    }
    case 'facet':
      return raw != null && (spec.values as readonly string[]).includes(raw) ? raw : spec.default;
    case 'sort': {
      // `key` when the direction is the declared one, `key:asc` otherwise.
      // Each half falls back on its own, so `?sort=nonsense:asc` still sorts
      // ascending by the default key rather than discarding the direction too.
      const [rawKey = '', rawDir = ''] = (raw ?? '').split(':');
      const key = (spec.keys as readonly string[]).includes(rawKey) ? rawKey : spec.default;
      const dir = isSortDir(rawDir) ? rawDir : spec.defaultDir;
      return { key, dir };
    }
  }
}

/** The string to put on the URL, or `null` to leave the key off it entirely. */
function encode(spec: ListParamSpec, value: unknown): string | null {
  switch (spec.kind) {
    case 'text': {
      const text = typeof value === 'string' ? value.trim() : '';
      return text === '' || text === spec.default ? null : text;
    }
    case 'facet': {
      // A value outside the declared set is written as the default, which is
      // to say it is not written at all. The screen cannot put junk on the URL
      // through this door, only a hand-typed URL can, and `decode` handles it.
      if (typeof value !== 'string') return null;
      if (!(spec.values as readonly string[]).includes(value)) return null;
      return value === spec.default ? null : value;
    }
    case 'sort': {
      const v = (value ?? {}) as Partial<SortValue>;
      const key =
        typeof v.key === 'string' && (spec.keys as readonly string[]).includes(v.key)
          ? v.key
          : spec.default;
      const dir = isSortDir(v.dir) ? v.dir : spec.defaultDir;
      if (key === spec.default && dir === spec.defaultDir) return null;
      return dir === spec.defaultDir ? key : `${key}:${dir}`;
    }
  }
}

// ── Pure helpers, usable without React ───────────────────────────────────────

/** Decode the whole schema out of a query string. Never throws. */
export function readListParams<S extends ListParamSchema>(
  params: URLSearchParams,
  schema: S,
): ListValues<S> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(schema)) {
    out[name] = decode(schema[name]!, params.get(name));
  }
  return out as ListValues<S>;
}

/**
 * Apply a patch on top of the params that are already on the URL.
 *
 * The clone is the whole point: keys the schema says nothing about are copied
 * across untouched, repeated keys and all.
 */
export function applyListParams<S extends ListParamSchema>(
  current: URLSearchParams,
  schema: S,
  patch: Partial<ListValues<S>>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const name of Object.keys(schema)) {
    if (!(name in patch)) continue;
    const value = (patch as Record<string, unknown>)[name];
    const encoded = encode(schema[name]!, value);
    if (encoded == null) next.delete(name);
    else next.set(name, encoded);
  }
  return next;
}

/** Every declared param back to its default. Anything else on the URL stays. */
export function clearListParams<S extends ListParamSchema>(
  current: URLSearchParams,
  schema: S,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const name of Object.keys(schema)) next.delete(name);
  return next;
}

/** True when nothing is narrowed, which is to say the link is the clean one. */
export function isDefaultListParams<S extends ListParamSchema>(
  schema: S,
  values: ListValues<S>,
): boolean {
  return Object.keys(schema).every(
    (name) => encode(schema[name]!, (values as Record<string, unknown>)[name]) == null,
  );
}

// ── The hook ─────────────────────────────────────────────────────────────────

export interface SetListParamOptions {
  /**
   * Overrides the default: text replaces the current entry, everything else
   * pushes a new one.
   */
  replace?: boolean;
}

export interface ListParams<S extends ListParamSchema> {
  /** What the screen is actually showing. Read off the URL every render. */
  values: ListValues<S>;
  /**
   * What a text control displays: the committed value, or the keystrokes that
   * have not reached the URL yet. Facets have no draft, they commit at once.
   */
  drafts: Record<TextParamName<S>, string>;
  /** The declaration, so a control can ask what its default is. */
  schema: S;
  set: <K extends keyof S>(
    name: K,
    value: ListValues<S>[K],
    options?: SetListParamOptions,
  ) => void;
  /** Write a pending text param now rather than on the debounce (Enter). */
  commit: (name: TextParamName<S>) => void;
  /** Every declared param back to its default, in one history entry. */
  reset: () => void;
  isDefault: boolean;
}

/**
 * The keystrokes not yet on the URL, plus the two bookkeeping maps that tell a
 * write of ours from a write of somebody else's.
 *
 * - `seen` is the committed text this component has already reconciled with.
 * - `pending[name]` is the committed value an in-flight write of ours will
 *   produce once it lands. Absent means nothing of ours is in flight.
 */
interface TextSync {
  seen: Record<string, string>;
  draft: Record<string, string>;
  pending: Record<string, string>;
}

export function useListParams<S extends ListParamSchema>(schema: S): ListParams<S> {
  const [params, setParams] = useSearchParams();
  const values = readListParams(params, schema);

  const textNames = Object.keys(schema).filter((name) => schema[name]!.kind === 'text');
  const committed: Record<string, string> = {};
  for (const name of textNames) committed[name] = values[name] as string;

  const [sync, setSync] = useState<TextSync>(() => ({
    seen: committed,
    draft: committed,
    pending: {},
  }));

  // Two different things can make the URL disagree with the draft, and they
  // want opposite answers. Our own debounced write landing must leave the field
  // alone, because `encode` trims and drops defaults, so the committed value is
  // often not the string that was typed. Anybody else's write must land in the
  // field. `pending` is the only thing that separates them: comparing the draft
  // or comparing `seen` alone cannot, because the write arrives over two
  // renders (the state update and the navigation do not commit together), and
  // the render in between looks identical from both sides.
  const landed: string[] = [];
  const moved: string[] = [];
  for (const name of textNames) {
    if (sync.pending[name] === committed[name]) landed.push(name);
    else if (sync.seen[name] !== committed[name]) moved.push(name);
  }
  if (landed.length > 0 || moved.length > 0) {
    // Adjusting state during render, not in an effect: the back button, a link
    // into ?q=... or another control writing the same param all have to land in
    // the input, and this is the one pattern that does it without a second
    // render pass and without tripping set-state-in-effect. It cannot loop:
    // after this, `seen` equals `committed` and nothing is pending for either
    // list.
    const draft = { ...sync.draft };
    const seen = { ...sync.seen };
    const pending = { ...sync.pending };
    for (const name of landed) {
      seen[name] = committed[name]!;
      delete pending[name];
    }
    for (const name of moved) {
      draft[name] = committed[name]!;
      seen[name] = committed[name]!;
      delete pending[name];
    }
    setSync({ seen, draft, pending });
  }

  // react-router's `setSearchParams` is a `useCallback` over the `searchParams`
  // of the render that produced it, so even its functional form hands you that
  // render's params rather than the live URL. A debounced write firing 250ms
  // later would otherwise be built on a base that predates every facet and sort
  // change made while typing, and would silently put them all back. Keeping the
  // newest callback in a ref is what makes the base current.
  const latestSetParams = useRef(setParams);
  useEffect(() => {
    latestSetParams.current = setParams;
  });

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const armed = timers.current;
    return () => {
      for (const timer of armed.values()) clearTimeout(timer);
      armed.clear();
    };
  }, []);

  function write(name: string, value: unknown, replace: boolean) {
    latestSetParams.current(
      (prev) => applyListParams(prev, schema, { [name]: value } as Partial<ListValues<S>>),
      { replace },
    );
  }

  function flush(name: string, text: string, replace: boolean) {
    const armed = timers.current;
    const timer = armed.get(name);
    if (timer != null) clearTimeout(timer);
    armed.delete(name);
    // What the URL will report back once this write lands, which is rarely the
    // string that was typed: `encode` trims, and a value equal to the default
    // leaves the key off the URL entirely, so `decode` then answers with the
    // default. Claiming that value as ours is what stops a trailing space, or a
    // cleared field whose default is not empty, from being pulled back into the
    // input a quarter second later.
    const spec = schema[name]!;
    const nextCommitted = decode(spec, encode(spec, text)) as string;
    setSync((s) => ({
      seen: s.seen,
      draft: s.draft,
      pending: { ...s.pending, [name]: nextCommitted },
    }));
    write(name, text, replace);
  }

  function set<K extends keyof S>(
    name: K,
    value: ListValues<S>[K],
    options?: SetListParamOptions,
  ): void {
    const key = name as string;
    const spec = schema[key]!;
    if (spec.kind !== 'text') {
      write(key, value, options?.replace ?? false);
      return;
    }
    const text = typeof value === 'string' ? value : '';
    setSync((s) => ({ seen: s.seen, draft: { ...s.draft, [key]: text }, pending: s.pending }));
    const armed = timers.current;
    const existing = armed.get(key);
    if (existing != null) clearTimeout(existing);
    const replace = options?.replace ?? true;
    armed.set(
      key,
      setTimeout(() => flush(key, text, replace), spec.debounce),
    );
  }

  function commit(name: TextParamName<S>): void {
    const key = name as string;
    flush(key, sync.draft[key] ?? '', true);
  }

  function reset(): void {
    const armed = timers.current;
    for (const timer of armed.values()) clearTimeout(timer);
    armed.clear();
    // Drafts are emptied here rather than left to the render sync, because a
    // half-typed search that never reached the URL would otherwise survive
    // "Clear filters": the URL has nothing to change, so nothing would tell
    // the input to let go of it. `seen` keeps the values the URL still holds,
    // so the sync above stays quiet until the navigation actually lands.
    const defaults: Record<string, string> = {};
    for (const name of textNames) defaults[name] = (schema[name] as TextSpec).default;
    setSync({ seen: committed, draft: defaults, pending: {} });
    latestSetParams.current((prev) => clearListParams(prev, schema), { replace: false });
  }

  return {
    values,
    drafts: sync.draft as Record<TextParamName<S>, string>,
    schema,
    set,
    commit,
    reset,
    isDefault: isDefaultListParams(schema, values),
  };
}
