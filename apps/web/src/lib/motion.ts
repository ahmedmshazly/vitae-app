/**
 * The five-variant motion system (brand-book.html ch.08). Nothing outside
 * this list gets animated without being added here first, if you can't name
 * the state change an animation reports, delete it.
 *
 * Every variant takes the caller's `useReducedMotion()` value explicitly and
 * collapses to an instant, zero-duration state change when true. State
 * changes still happen, they just happen immediately, nothing is left
 * mid-transition.
 */
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
