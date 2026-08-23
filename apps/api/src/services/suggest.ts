/**
 * Existing-value autocompletions for form fields (FR-CAP-003).
 *
 * Every text field in the app now asks this service what has been typed before,
 * so the same value stops being re-entered under three spellings. That is ~96
 * fields rather than the five semantic pools this started as, and the old
 * implementation did a full `allLiveNodes()` read *per request*, at 140 ms
 * debounce, a burst of typing would have made autocomplete the single largest
 * database workload in the product.
 *
 * So the scan happens once and indexes **every** prop at the same time: the
 * hundredth field costs nothing more than the first, and a typing burst is one
 * read rather than dozens. The snapshot is memoised per data space and reused
 * until the write generation moves, so a value created a moment ago appears
 * immediately without polling; the TTL is only a ceiling on staleness from
 * writes this process did not make.
 */
import type { SuggestKind } from '@vitae/core';
import { repository } from '../db/repository.js';
import { currentWorkspaceId } from '../db/space.js';
import { writeGeneration } from '../db/write-signal.js';

export interface SuggestValue {
  value: string;
  count: number;
}

/** Semantic pools that deliberately cross-cut types and props. */
export const SUGGEST_KINDS = ['skill', 'tech', 'topic', 'tag', 'city'] as const;
export function isSuggestKind(v: string): v is SuggestKind {
  return (SUGGEST_KINDS as readonly string[]).includes(v);
}

type Counts = Map<string, number>;

interface ValueIndex {
  builtAt: number;
  /** Write generation this snapshot was built at. */
  generation: number;
  /** kind → value → frequency. */
  byKind: Map<string, Counts>;
  /** `${ownerType}.${prop}` → value → frequency. */
  byProp: Map<string, Counts>;
}

/**
 * A ceiling, not the primary invalidation. Writes bump the generation and the
 * index rebuilds immediately; the TTL only bounds staleness from writes this
 * process did not make (another instance, a script, a direct console edit).
 */
const TTL_MS = 120_000;

const cache = new Map<string, ValueIndex>();

/** Drop the memoised index. Exposed for tests and for out-of-band mutations. */
export function invalidateSuggestCache(): void {
  cache.clear();
}

function bump(counts: Counts, raw: unknown): void {
  if (typeof raw !== 'string') return;
  const v = raw.trim();
  if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
}

function counts(map: Map<string, Counts>, key: string): Counts {
  return map.get(key) ?? map.set(key, new Map()).get(key)!;
}

/** Bump a prop's value(s), flattening string arrays so list fields index too. */
function bumpProp(index: ValueIndex, ownerType: string, key: string, raw: unknown): void {
  const target = counts(index.byProp, `${ownerType}.${key}`);
  if (Array.isArray(raw)) for (const item of raw) bump(target, item);
  else bump(target, raw);
}

async function build(): Promise<ValueIndex> {
  const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
  const index: ValueIndex = {
    builtAt: Date.now(),
    generation: writeGeneration(),
    byKind: new Map(),
    byProp: new Map(),
  };

  const kind = (k: string): Counts => counts(index.byKind, k);

  for (const n of nodes) {
    const props = (n.props ?? {}) as Record<string, unknown>;
    for (const [key, raw] of Object.entries(props)) bumpProp(index, n.type, key, raw);

    // The curated pools. These read across types on purpose, which a per-field
    // query cannot do: a city typed on a role should suggest on an org too.
    if (n.type === 'skill') {
      bump(kind('skill'), n.title);
      if (Array.isArray(props.aliases)) for (const a of props.aliases) bump(kind('skill'), a);
      bump(kind('tech'), n.title);
    }
    if (Array.isArray(props.tech_stack)) for (const t of props.tech_stack) bump(kind('tech'), t);
    if (n.type === 'location') bump(kind('city'), n.title);
    bump(kind('city'), props.city);
    // `topic` and `tag` overlap deliberately: a topic is a usable tag and vice
    // versa, but coursework is subject matter only, it should not become a tag.
    const pools: Array<[string, readonly string[]]> = [
      ['topics', ['topic', 'tag']],
      ['coursework', ['topic']],
      ['tags', ['topic', 'tag']],
    ];
    for (const [listKey, targets] of pools) {
      const list = props[listKey];
      if (!Array.isArray(list)) continue;
      for (const item of list) for (const t of targets) bump(kind(t), item);
    }
  }

  for (const e of edges) {
    const props = (e.props ?? {}) as Record<string, unknown>;
    for (const [key, raw] of Object.entries(props)) bumpProp(index, e.type, key, raw);
    if (Array.isArray(props.topics)) for (const t of props.topics) bump(kind('topic'), t);
  }

  return index;
}

async function indexFor(): Promise<ValueIndex> {
  const workspaceId = currentWorkspaceId();
  const hit = cache.get(workspaceId);
  // Reuse only while the graph has not moved and the snapshot is not stale.
  if (hit && hit.generation === writeGeneration() && Date.now() - hit.builtAt < TTL_MS) return hit;
  const fresh = await build();
  cache.set(workspaceId, fresh);
  return fresh;
}

export interface SuggestQuery {
  /** A curated cross-cutting pool. */
  kind?: string;
  /** Or this field's own previous values: owner node/edge type + prop key. */
  type?: string;
  prop?: string;
  q?: string;
}

const LIMIT = 12;

/**
 * Distinct existing values, most-used first, filtered by `q`.
 *
 * An unknown kind or an unindexed field returns an empty list rather than an
 * error: a field with nothing typed into it yet is the normal first case, not a
 * failure, and the input must stay usable.
 */
export async function suggestValues(query: SuggestQuery): Promise<SuggestValue[]> {
  const index = await indexFor();
  const source =
    query.kind !== undefined
      ? index.byKind.get(query.kind)
      : query.type && query.prop
        ? index.byProp.get(`${query.type}.${query.prop}`)
        : undefined;
  if (!source) return [];

  const q = (query.q ?? '').trim().toLowerCase();
  let entries = [...source.entries()];
  if (q) entries = entries.filter(([v]) => v.toLowerCase().includes(q));
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.slice(0, LIMIT).map(([value, count]) => ({ value, count }));
}
