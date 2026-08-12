/**
 * The five-variant motion system (brand-book.html ch.08). Nothing outside
 * this list gets animated without being added here first, if you can't name
 * the state change an animation reports, delete it.
 *
 * Every variant takes the caller's `useReducedMotion()` value explicitly and
 * collapses to an instant, zero-duration state change when true. State
 * changes still happen, they just happen immediately, nothing is left
 * mid-transition.
 *
 * Two layers live here. The six functions are the primitive: pure, testable,
 * and explicit about the reduced-motion flag. The `use*` hooks below wrap each
 * one and read `useReducedMotion()` themselves, which is the layer components
 * should reach for, because a flag you have to remember to pass is a flag that
 * gets forgotten. Reach past the hooks only where the value has to come from
 * somewhere other than the media query.
 *
 * The preference has one source in this repo, `useReducedMotion` from
 * `@vitae/ui`. Framer ships a hook of the same name; running both inside one
 * component means two subscriptions to one media query that can disagree for a
 * render, so only the `Transition` and `Variants` types are taken from
 * `motion/react` here, and those are erased at compile time.
 */
import { useMemo } from 'react';
import { useReducedMotion } from '@vitae/ui';
import type { Transition, Variants } from 'motion/react';

const EASE = [0.32, 0.72, 0, 1] as const; // --ae-ease, the only easing
const DUR = 0.13; // --ae-dur
const DUR_FAST = 0.09; // --ae-dur-fast, exits, hover, anything leaving
const DUR_SLOW = 0.22; // --ae-dur-slow, reorder and layout shifts only
const STAGGER_STEP = 0.025; // 25ms

/** enter's stagger caps at 5 children, slice lists to 5 before mapping;
 * the 6th item onward appears alongside the 5th. `Variants` can't enforce
 * this, the calling list is responsible for the slice. */
export const STAGGER_CAP = 5;

/**
 * Entrances, list loads, dialogs opening: opacity + 4px rise. Also the
 * stagger coordinator, apply the same `enter(reduced)` variants to a list's
 * parent and its children and Framer Motion propagates the stagger timing
 * through the shared `animate` state.
 */
export function enter(reduced: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 4 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduced ? 0 : DUR,
        ease: EASE,
        staggerChildren: reduced ? 0 : STAGGER_STEP,
      },
    },
  };
}

/**
 * `enter` for one item of a list that isn't driving the stagger through a
 * Framer parent, returns the motion props to spread onto the child. The delay
 * is capped at STAGGER_CAP steps, which is the cap `enter`'s own
 * `staggerChildren` cannot express: the sixth item onward arrives with the
 * fifth instead of trickling in for the length of the list.
 */
export function enterItem(reduced: boolean, index: number) {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 4 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduced ? 0 : DUR,
      ease: EASE,
      delay: reduced ? 0 : Math.min(index, STAGGER_CAP - 1) * STAGGER_STEP,
    },
  } as const;
}

/** Anything leaving: opacity only, linear. A leaving element shouldn't
 * decelerate into nothing, it should just go. */
export function exit(reduced: boolean): Variants {
  return {
    exit: { opacity: 0, transition: { duration: reduced ? 0 : DUR_FAST, ease: 'linear' } },
  };
}

/** A value changed in place, an optimistic save, a row updating. Brightness
 * pulse only, no movement, returns to rest on its own. */
export function emphasis(reduced: boolean): Variants {
  return {
    animate: {
      filter: reduced ? 'brightness(1)' : ['brightness(1)', 'brightness(1.35)', 'brightness(1)'],
      transition: { duration: reduced ? 0 : DUR, ease: EASE },
    },
  };
}

/** Reorder and layout shifts only: transform via Framer Motion's `layout`
 * prop (FLIP), pair with `<motion.div layout transition={reorder(reduced)}>`. */
export function reorder(reduced: boolean): Transition {
  return { duration: reduced ? 0 : DUR_SLOW, ease: EASE };
}

/** Route/content-region swaps: opacity only, no movement. The shell never
 * animates on navigation, only the content region does. */
export function route(reduced: boolean): Variants {
  return {
    initial: { opacity: reduced ? 1 : 0 },
    animate: { opacity: 1, transition: { duration: reduced ? 0 : DUR, ease: EASE } },
    exit: {
      opacity: reduced ? 1 : 0,
      transition: { duration: reduced ? 0 : DUR_FAST, ease: 'linear' },
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Hooks. One per variant, each reading the reduced-motion preference itself.
 * They return exactly what the function of the same name returns, so a
 * component can swap `enter(reduced)` for `useEnter()` and change nothing
 * else. The memo is for referential stability: Framer re-reads a `variants`
 * object whose identity changed, and a fresh object every render is a
 * re-render that looks like a state change when it isn't.
 * ------------------------------------------------------------------------- */

/**
 * The one reduced-motion subscription for the whole app: the design system's
 * native `matchMedia` hook, so the app layer and `packages/ui` never run two
 * different subscriptions inside a single component. It returns a plain
 * boolean, there is no "not resolved yet" third state to narrow away.
 */
function useReducedFlag(): boolean {
  return useReducedMotion();
}

/** `enter` for the current reduced-motion preference. */
export function useEnter(): Variants {
  const reduced = useReducedFlag();
  return useMemo(() => enter(reduced), [reduced]);
}

/** `enterItem` for the current reduced-motion preference. Pass the item's
 * index, or the capped index from `staggered()`, the cap applies either way. */
export function useEnterItem(index: number): ReturnType<typeof enterItem> {
  const reduced = useReducedFlag();
  return useMemo(() => enterItem(reduced, index), [reduced, index]);
}

/** `exit` for the current reduced-motion preference. */
export function useExit(): Variants {
  const reduced = useReducedFlag();
  return useMemo(() => exit(reduced), [reduced]);
}

/** `emphasis` for the current reduced-motion preference. */
export function useEmphasis(): Variants {
  const reduced = useReducedFlag();
  return useMemo(() => emphasis(reduced), [reduced]);
}

/** `reorder` for the current reduced-motion preference. */
export function useReorder(): Transition {
  const reduced = useReducedFlag();
  return useMemo(() => reorder(reduced), [reduced]);
}

/** `route` for the current reduced-motion preference. */
export function useRoute(): Variants {
  const reduced = useReducedFlag();
  return useMemo(() => route(reduced), [reduced]);
}

/** One list item paired with the stagger index it should animate on. */
export interface StaggeredItem<T> {
  item: T;
  /** Position in the stagger sequence, never above `STAGGER_CAP - 1`. */
  index: number;
}

/**
 * Pairs each item of a list with its stagger index, capped at STAGGER_CAP so
 * the sixth item onward arrives with the fifth instead of trickling in for the
 * length of the list. This is the cap `enter`'s `staggerChildren` cannot
 * express, and the reason every list was hand-rolling the same `Math.min`.
 *
 * ```tsx
 * interface Row {
 *   id: string;
 *   label: string;
 * }
 *
 * function RowItem({ index, row }: { index: number; row: Row }) {
 *   return <motion.li {...useEnterItem(index)}>{row.label}</motion.li>;
 * }
 *
 * function RowList({ rows }: { rows: Row[] }) {
 *   return (
 *     <ul>
 *       {staggered(rows).map(({ item, index }) => (
 *         <RowItem key={item.id} index={index} row={item} />
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * A hook cannot be called from inside `.map()`, so the row is its own
 * component, and it is a component rather than a value called `Row`, which
 * would shadow the data type in its own signature. Where that is too much
 * ceremony, call the `enterItem` primitive in the loop and read the preference
 * once in the parent.
 */
export function staggered<T>(items: readonly T[]): StaggeredItem<T>[] {
  return items.map((item, i) => ({ item, index: Math.min(i, STAGGER_CAP - 1) }));
}
