/**
 * One loading / empty / error contract for every screen.
 *
 * IDENTITY.md non-negotiable 9 asks every screen for four states. An audit of
 * the 40 routes found four different spellings of "is it loading" instead:
 * `isLoading || !data`, `isLoading` alone, `isFetching && !isLoading`, and
 * three hand-rolled `useState` booleans. `isPending` was never used. Eight
 * secondary queries destructured only `data`, so a failed request rendered as
 * an empty list: the screen stated facts it did not have.
 *
 * This component is the one place that decides. It takes a TanStack Query
 * result, or several, and renders exactly one of:
 *
 * - **loading** while any of them is pending or has no data yet. Defaults to
 *   `SkeletonRows`; pass `loading` a skeleton shaped like the content, because
 *   a skeleton that is not the shape of what arrives is worse than none.
 * - **error** when any of them failed. Defaults to `ErrorState` with Retry
 *   wired to `refetch()` on every query handed in.
 * - **empty**, in the caller's words. `empty` is "there is nothing here yet",
 *   `emptyFiltered` is "your filter matched nothing", and they are different
 *   states with different copy and different exits. See routes/People.tsx and
 *   routes/Atoms.tsx, which got this right by hand.
 * - **children**, called with the resolved data, which is not `undefined` by
 *   the time it is called.
 *
 * Plus one thing that is not a state of its own: `secondary`. A secondary
 * query that fails must not blank a region the primary query can fill, so its
 * failure surfaces as a compact `Banner` above children that still render.
 * routes/Record.tsx is the screen that already degrades its history query this
 * way, in longhand.
 *
 * Motion is the ch.08 rule "skeleton stops, content enters, never cross-fade",
 * implemented once: the loading slot is a plain `div` that does not animate,
 * and every resolved phase is a `motion.div` keyed on the phase, so the
 * skeleton unmounts in the same commit that mounts the content and nothing
 * overlaps. There is no `AnimatePresence` here on purpose, an exit animation is
 * what a cross-fade is made of. Timing comes from `useEnter()`, which reads the
 * reduced-motion preference itself.
 *
 * Every phase, loading included, is exactly one element carrying `className`.
 * A skeleton that stands in for a grid has to be the same box as the grid: if
 * the loading phase spilled its rows straight into the caller's element, a
 * parent laying out a grid would receive six rows as its own children and then
 * one wrapper a commit later, and the region would change shape at the moment
 * the data landed.
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { keepPreviousData } from '@tanstack/react-query';
import type { QueryFunction, QueryKey } from '@tanstack/react-query';
import { Banner, Button, ErrorState, SkeletonRows } from '@vitae/ui';
import { useEnter } from '../lib/motion.js';

/**
 * The part of a TanStack Query result this component reads. Structural rather
 * than `UseQueryResult`, so a `useQueries` entry, a wrapper hook or a test
 * double satisfies it without pretending to be a full query observer.
 */
export interface QueryLike<TData = unknown> {
  data: TData | undefined;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  refetch?: () => unknown;
}

export type SomeQuery = QueryLike<unknown>;
/** One query, or a tuple of queries that must all resolve together. */
export type QuerySource = SomeQuery | readonly SomeQuery[];

type DataOf<Q> = Q extends { data: infer D } ? Exclude<D, undefined> : never;

/**
 * What `children` is handed: the query's data, or one datum per query in the
 * same order, both with `undefined` already ruled out.
 */
export type ResolvedData<S> = S extends readonly unknown[]
  ? { -readonly [K in keyof S]: DataOf<S[K]> }
  : DataOf<S>;

export interface SecondaryQuery {
  query: SomeQuery;
  /**
   * What could not be loaded, in words, in the middle of a sentence:
   * "the history", "the favour ledger". The banner says
   * "Couldn't load {label}".
   */
  label: string;
}

export interface QueryBoundaryProps<S extends QuerySource> {
  query: S;
  children: (data: ResolvedData<S>) => ReactNode;
  /** Shape-matched skeleton. Defaults to `SkeletonRows`. */
  loading?: ReactNode;
  /** Rows for the default skeleton. Ignored when `loading` is given. */
  skeletonRows?: number;
  /** What failed, in the user's terms: "Couldn't load your people". */
  errorTitle?: string;
  /** "There is nothing here yet." Usually an `EmptyState` with an action. */
  empty?: ReactNode;
  /** "Your filter matched nothing." Its action clears the filter. */
  emptyFiltered?: ReactNode;
  /**
   * Is a filter, search or facet narrowing the data right now? Decides which
   * of the two empties is the true one when `isSourceEmpty` is not given.
   */
  filtered?: boolean;
  /**
   * Would `children` render nothing? Defaults to "the data is an empty array
   * or null". Screens that filter in the component close over the derived
   * list: `isEmpty={() => shown.length === 0}`.
   */
  isEmpty?: (data: ResolvedData<S>) => boolean;
  /**
   * Is the whole underlying set empty, before any filter? This is the Atoms
   * case: a filter is active *and* you own no atoms at all, which is
   * "No atoms yet", not "No atoms match these filters". Defaults to false, so
   * `filtered` decides on its own.
   */
  isSourceEmpty?: (data: ResolvedData<S>) => boolean;
  /**
   * Queries this region can do without. Their failures gather into one compact
   * banner that names all of them, above children that keep rendering instead
   * of being replaced.
   */
  secondary?: readonly SecondaryQuery[];
  /**
   * This boundary guards a sub-region, not a page, so its own error is a
   * compact banner too rather than a full-height panel.
   */
  compact?: boolean;
  className?: string;
}

/** First readable message among the failed queries, for the error detail. */
function firstMessage(queries: readonly SomeQuery[]): string | undefined {
  for (const q of queries) {
    const message = (q.error as Error | null | undefined)?.message;
    if (message) return message;
  }
  return undefined;
}

/** Empty when there is nothing to show, unless the caller knows better. */
function looksEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    // No list endpoint in this app answers with a bare array. They all wrap it
    // in one key: `{ people: [] }`, `{ nodes: [] }`, `{ atoms: [] }`. Unwrap
    // that one list and read it, ignoring keys that carry nothing (a cursor
    // that is not set, a total the server left off). A response with two things
    // in it is past what a default can guess at, so it is the caller's to judge
    // with `isEmpty`.
    const carried = Object.values(data as Record<string, unknown>).filter((v) => v != null);
    return carried.length === 1 && Array.isArray(carried[0]) && carried[0].length === 0;
  }
  return false;
}

/**
 * The failed labels as one phrase: "the history", "the history and the favour
 * ledger", "a, b and c". One banner names all of them, because a banner per
 * failure would put two controls called Retry on the screen and have each one
 * claim everything else is current while the other had in fact failed.
 */
function phrase(labels: readonly string[]): string {
  if (labels.length < 2) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function QueryBoundary<const S extends QuerySource>({
  query,
  children,
  loading,
  skeletonRows = 6,
  errorTitle = 'Couldn’t load this',
  empty,
  emptyFiltered,
  filtered = false,
  isEmpty,
  isSourceEmpty,
  secondary,
  compact = false,
  className,
}: QueryBoundaryProps<S>) {
  const enter = useEnter();

  const queries: readonly SomeQuery[] = Array.isArray(query) ? query : [query as SomeQuery];
  const degraded = (secondary ?? []).filter((s) => s.query.isError);

  function retry(targets: readonly SomeQuery[]) {
    for (const q of targets) void q.refetch?.();
  }

  /**
   * The one entrance in this file. Keyed on the phase so a phase change
   * remounts and replays it, and deliberately without an `exit`: the skeleton
   * is gone before this mounts.
   */
  function present(phase: string, node: ReactNode, withDegraded = true) {
    return (
      <motion.div key={phase} className={className} variants={enter} initial="initial" animate="animate">
        {withDegraded && degraded.length > 0 && (
          <Banner
            tone="danger"
            title={`Couldn’t load ${phrase(degraded.map((s) => s.label))}`}
            action={
              degraded.some((s) => s.query.refetch) ? (
                <Button size="sm" onClick={() => retry(degraded.map((s) => s.query))}>
                  Retry
                </Button>
              ) : undefined
            }
          >
            Everything else on this screen is current.
          </Banner>
        )}
        {node}
      </motion.div>
    );
  }

  const failed = queries.filter((q) => q.isError);
  if (failed.length > 0) {
    const detail = firstMessage(failed);
    return present(
      'error',
      compact ? (
        <Banner
          tone="danger"
          title={errorTitle}
          action={
            <Button size="sm" onClick={() => retry(queries)}>
              Retry
            </Button>
          }
        >
          {detail}
        </Banner>
      ) : (
        <ErrorState title={errorTitle} detail={detail} onRetry={() => retry(queries)} />
      ),
      false,
    );
  }

  // `isPending` is the honest question, and `data === undefined` is the guard
  // the routes were hand-rolling as `isLoading || !data`. Keeping both means a
  // query holding placeholder data from the previous parameters renders its
  // children instead of blanking to a skeleton on every filter change.
  const values = queries.map((q) => q.data);
  if (queries.some((q) => q.isPending) || values.some((v) => v === undefined)) {
    // Same one element and same `className` as every resolved phase, so the
    // region keeps its box while the data is in flight. Not a `motion.div`: a
    // skeleton that animates in is a second entrance for one arrival, and it is
    // the content that enters.
    return <div className={className}>{loading ?? <SkeletonRows rows={skeletonRows} />}</div>;
  }

  const data = (Array.isArray(query) ? values : values[0]) as ResolvedData<S>;

  if (isEmpty ? isEmpty(data) : looksEmpty(data)) {
    // Two empties, two exits. "Nothing yet" invites the first record; "nothing
    // matched" offers the way back out of the filter. A filter over a set that
    // is itself empty is still the first one.
    const nothingAtAll = isSourceEmpty ? isSourceEmpty(data) : !filtered;
    const node = nothingAtAll ? (empty ?? emptyFiltered) : (emptyFiltered ?? empty);
    if (node != null) return present('empty', node);
  }

  return present('content', children(data));
}

/**
 * Parameterised list queries keep the last results on screen while the next
 * ones fly, so changing a filter does not strobe the list through a skeleton.
 * Exactly one query in the app did this before, the search box.
 *
 * ```ts
 * const q = useQuery({ queryKey: ['people', filter], queryFn: fetchPeople, ...keepLastResults });
 * ```
 */
export const keepLastResults = { placeholderData: keepPreviousData } as const;

/**
 * The same thing as a factory, for a call site that would rather name its
 * query than spread a constant into it.
 *
 * ```ts
 * const q = useQuery(listQueryOptions({ queryKey: ['atoms', kind], queryFn: () => api.get<Resp>(url) }));
 * ```
 */
export function listQueryOptions<TData>(config: {
  queryKey: QueryKey;
  queryFn: QueryFunction<TData>;
  enabled?: boolean;
  staleTime?: number;
}) {
  return { ...config, ...keepLastResults };
}
