/**
 * The motion system has two layers: six pure functions that take the
 * reduced-motion flag, and six hooks that read it themselves. These tests hold
 * the two layers to the same values, because the whole point of the hooks is
 * that swapping one for the other changes nothing about what animates.
 *
 * The jsdom stub reports `matches: false` forever, so under it a hook can only
 * ever observe "motion allowed" and the one thing the hook layer adds, reading
 * the preference, has no observable behaviour. Every test here therefore runs
 * against a matchMedia this file controls: `setPreference()` flips the answer
 * and notifies subscribers the way a real MediaQueryList would.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Transition, Variants } from 'motion/react';
import {
  DUR,
  DUR_FAST,
  DUR_SLOW,
  EASE,
  STAGGER_CAP,
  emphasis,
  enter,
  enterItem,
  exit,
  reorder,
  route,
  staggered,
  useEmphasis,
  useEnter,
  useEnterItem,
  useExit,
  useReorder,
  useRoute,
} from './motion.js';

/** The shape of a single variant, narrowed to the properties this system
 * actually sets. Framer's own `Variant` is a union wide enough that reading
 * `.transition.duration` off it needs a cast either way. */
interface Frame {
  opacity?: number;
  y?: number;
  filter?: string | string[];
  transition?: {
    duration?: number;
    delay?: number;
    ease?: unknown;
    staggerChildren?: number;
  };
}

function frame(variants: Variants, key: string): Frame {
  return variants[key] as unknown as Frame;
}

function timing(transition: Transition): Frame['transition'] {
  return transition as unknown as Frame['transition'];
}

const MOVING = false;
const REDUCED = true;
const STEP = 0.025;

/* Controllable `prefers-reduced-motion`. ------------------------------------ */

/** Everything currently subscribed to the media query, so a preference change
 * can be announced to real subscribers instead of only to a getter. */
const subscribers = new Set<() => void>();
let prefersReduced = false;
const realMatchMedia = window.matchMedia;

function stubMatchMedia() {
  window.matchMedia = ((media: string) => ({
    matches: media.includes('prefers-reduced-motion') ? prefersReduced : false,
    media,
    onchange: null,
    addListener: (fn: () => void) => subscribers.add(fn),
    removeListener: (fn: () => void) => subscribers.delete(fn),
    addEventListener: (_type: string, fn: () => void) => subscribers.add(fn),
    removeEventListener: (_type: string, fn: () => void) => subscribers.delete(fn),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Flip the OS preference and tell every subscriber, as a real MediaQueryList
 * does when the user changes the setting with the page open. */
function setPreference(reduced: boolean) {
  prefersReduced = reduced;
  act(() => {
    for (const notify of subscribers) notify();
  });
}

beforeEach(() => {
  subscribers.clear();
  prefersReduced = false;
  stubMatchMedia();
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('motion hooks', () => {
  // With no preference expressed, every hook must land on exactly the object
  // its function returns for the unreduced case. Deep equality, not a spot
  // check: a hook that dropped the stagger or the easing would still pass a
  // shallow assertion.
  it('useEnter returns what enter returns', () => {
    const { result } = renderHook(() => useEnter());
    expect(result.current).toEqual(enter(MOVING));
  });

  it('useEnterItem returns what enterItem returns for the same index', () => {
    const { result } = renderHook(() => useEnterItem(2));
    expect(result.current).toEqual(enterItem(MOVING, 2));
  });

  it('useExit returns what exit returns', () => {
    const { result } = renderHook(() => useExit());
    expect(result.current).toEqual(exit(MOVING));
  });

  it('useEmphasis returns what emphasis returns', () => {
    const { result } = renderHook(() => useEmphasis());
    expect(result.current).toEqual(emphasis(MOVING));
  });

  it('useReorder returns what reorder returns', () => {
    const { result } = renderHook(() => useReorder());
    expect(result.current).toEqual(reorder(MOVING));
  });

  it('useRoute returns what route returns', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual(route(MOVING));
  });

  // Framer re-reads a variants object whose identity changed. A hook handing
  // back a fresh object on every render would restart animations on unrelated
  // state changes, which reads as a flicker rather than a state change.
  it('keeps the same object across re-renders', () => {
    const { result, rerender } = renderHook(() => useEnter());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('gives a new object when the item index changes', () => {
    const { result, rerender } = renderHook(({ i }: { i: number }) => useEnterItem(i), {
      initialProps: { i: 0 },
    });
    const first = result.current;
    rerender({ i: 1 });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(enterItem(MOVING, 1));
  });

  // A partial stub with no way to subscribe is the jsdom default and also the
  // shape of several test setups. The answer there is "motion allowed", the
  // same as CSS: motion plays unless the user asked otherwise.
  it('allows motion when matchMedia offers no way to subscribe', () => {
    window.matchMedia = ((media: string) => ({
      matches: false,
      media,
    })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useEnter());
    expect(result.current).toEqual(enter(MOVING));
  });
});

// The hooks exist to read the preference. Under the jsdom stub that read has no
// observable consequence, so this block drives the query itself: if the hooks
// stopped consulting it, every assertion here would return the moving shape.
describe('motion hooks, preference set to reduce', () => {
  beforeEach(() => {
    setPreference(true);
  });

  it('useEnter collapses to zero duration and no rise', () => {
    const { result } = renderHook(() => useEnter());
    expect(result.current).toEqual(enter(REDUCED));
    expect(result.current).not.toEqual(enter(MOVING));
  });

  it('useEnterItem collapses to zero duration and no delay', () => {
    const { result } = renderHook(() => useEnterItem(3));
    expect(result.current).toEqual(enterItem(REDUCED, 3));
    expect(result.current.transition.delay).toBe(0);
  });

  it('useExit collapses to zero duration', () => {
    const { result } = renderHook(() => useExit());
    expect(result.current).toEqual(exit(REDUCED));
    expect(frame(result.current, 'exit').transition?.duration).toBe(0);
  });

  it('useEmphasis collapses to a single resting brightness', () => {
    const { result } = renderHook(() => useEmphasis());
    expect(result.current).toEqual(emphasis(REDUCED));
    expect(frame(result.current, 'animate').filter).toBe('brightness(1)');
  });

  it('useReorder collapses to zero duration', () => {
    const { result } = renderHook(() => useReorder());
    expect(result.current).toEqual(reorder(REDUCED));
    expect(timing(result.current)?.duration).toBe(0);
  });

  it('useRoute collapses to zero duration and full opacity throughout', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual(route(REDUCED));
    expect(frame(result.current, 'initial').opacity).toBe(1);
  });

  // The preference is a setting, not a constant: someone can turn it on with
  // the app open, and the running app has to answer to that without a reload.
  it('follows the preference changing while mounted', () => {
    setPreference(false);
    const { result } = renderHook(() => useEnter());
    expect(result.current).toEqual(enter(MOVING));

    setPreference(true);
    expect(result.current).toEqual(enter(REDUCED));

    setPreference(false);
    expect(result.current).toEqual(enter(MOVING));
  });
});

describe('reduced motion', () => {
  it('collapses enter to zero duration and no rise', () => {
    const variants = enter(REDUCED);
    expect(frame(variants, 'initial').y).toBe(0);
    expect(frame(variants, 'animate').transition?.duration).toBe(0);
    expect(frame(variants, 'animate').transition?.staggerChildren).toBe(0);
  });

  it('collapses enterItem to zero duration, no rise, no delay', () => {
    const props = enterItem(REDUCED, 3);
    expect(props.initial.y).toBe(0);
    expect(props.transition.duration).toBe(0);
    expect(props.transition.delay).toBe(0);
  });

  it('collapses exit to zero duration', () => {
    expect(frame(exit(REDUCED), 'exit').transition?.duration).toBe(0);
  });

  it('collapses emphasis to a single resting brightness', () => {
    const variants = emphasis(REDUCED);
    expect(frame(variants, 'animate').filter).toBe('brightness(1)');
    expect(frame(variants, 'animate').transition?.duration).toBe(0);
  });

  it('collapses reorder to zero duration', () => {
    expect(timing(reorder(REDUCED))?.duration).toBe(0);
  });

  // A route swap that fades has nothing to report when motion is off: the new
  // content is simply there. Both opacities stay at 1 so no frame is spent
  // transparent.
  it('collapses route to zero duration and full opacity throughout', () => {
    const variants = route(REDUCED);
    expect(frame(variants, 'initial').opacity).toBe(1);
    expect(frame(variants, 'animate').transition?.duration).toBe(0);
    expect(frame(variants, 'exit').opacity).toBe(1);
    expect(frame(variants, 'exit').transition?.duration).toBe(0);
  });

  it('still moves when motion is allowed', () => {
    expect(frame(enter(MOVING), 'initial').y).toBe(4);
    expect(frame(enter(MOVING), 'animate').transition?.duration).toBe(0.26);
  });
});

describe('stagger cap', () => {
  it('caps the enterItem delay at the fifth item', () => {
    const fifth = enterItem(MOVING, STAGGER_CAP - 1).transition.delay;
    expect(fifth).toBeCloseTo(0.1, 5);
    expect(enterItem(MOVING, STAGGER_CAP).transition.delay).toBe(fifth);
    expect(enterItem(MOVING, 40).transition.delay).toBe(fifth);
  });

  it('steps one item at a time below the cap', () => {
    expect(enterItem(MOVING, 0).transition.delay).toBe(0);
    expect(enterItem(MOVING, 1).transition.delay).toBeCloseTo(0.025, 5);
    expect(enterItem(MOVING, 2).transition.delay).toBeCloseTo(0.05, 5);
  });

  it('staggered pairs every item with a capped index', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(staggered(rows)).toEqual([
      { item: 'a', index: 0 },
      { item: 'b', index: 1 },
      { item: 'c', index: 2 },
      { item: 'd', index: 3 },
      { item: 'e', index: 4 },
      { item: 'f', index: 4 },
      { item: 'g', index: 4 },
    ]);
  });

  it('staggered keeps the items themselves untouched', () => {
    const first = { id: 'r1' };
    const [only] = staggered([first]);
    expect(only.item).toBe(first);
  });

  it('staggered handles an empty list', () => {
    expect(staggered([])).toEqual([]);
  });

  // A list can stagger two ways: through `enter` on a Framer parent, or item by
  // item through `enterItem`. Both are the same 25ms step, so a list that
  // switches from one to the other keeps its rhythm.
  it('drives the parent stagger at the same step as the item delay', () => {
    const step = frame(enter(MOVING), 'animate').transition?.staggerChildren;
    expect(step).toBeCloseTo(STEP, 5);
    expect(step).toBeCloseTo(enterItem(MOVING, 1).transition.delay, 5);
  });
});

describe('easing', () => {
  // Everything leaving is linear: a departing element should not decelerate
  // into nothing, it should just go. Everything else uses the single easing.
  it('exit uses linear easing', () => {
    expect(frame(exit(MOVING), 'exit').transition?.ease).toBe('linear');
    expect(frame(route(MOVING), 'exit').transition?.ease).toBe('linear');
  });

  // The identity ships three curves, but only --e-out reaches these variants:
  // --e-pop and --e-settle overshoot, and none of the five states below is a
  // thing that should sail past where it is going. So "one easing" still holds
  // inside the motion system, it is just no longer the only one in the product.
  it('every other variant uses the one easing curve', () => {
    const curve = [0.2, 0.7, 0.2, 1];
    expect(frame(enter(MOVING), 'animate').transition?.ease).toEqual(curve);
    expect(enterItem(MOVING, 0).transition.ease).toEqual(curve);
    expect(frame(emphasis(MOVING), 'animate').transition?.ease).toEqual(curve);
    expect(timing(reorder(MOVING))?.ease).toEqual(curve);
    expect(frame(route(MOVING), 'animate').transition?.ease).toEqual(curve);
  });
});

/**
 * Framer takes seconds and a control-point tuple; CSS takes milliseconds and a
 * `cubic-bezier()`. There is no way to share one literal between them, so this
 * module retypes the token values and this is the test that says so out loud.
 *
 * It reads packages/ui/src/styles/tokens.css as text rather than through
 * `getComputedStyle`, because jsdom does not load the stylesheet and does not
 * substitute custom properties. That is also why it reads the `--d-*` and
 * `--e-out` tokens directly rather than the `--ae-*` aliases: an alias's
 * declared value is the string `var(--d-base)`, which says nothing about what
 * it resolves to.
 */
describe('the JS mirror of the motion tokens', () => {
  const TOKENS = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/ui/src/styles/tokens.css'),
    'utf8',
  );

  /** The first declared value of one custom property, stopped at the semicolon. */
  function token(name: string): string {
    const match = TOKENS.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`tokens.css does not declare ${name}`);
    return match[1].trim();
  }

  it('spends the same durations tokens.css declares', () => {
    expect(token('--d-quick')).toBe(`${DUR_FAST * 1000}ms`);
    expect(token('--d-base')).toBe(`${DUR * 1000}ms`);
    expect(token('--d-long')).toBe(`${DUR_SLOW * 1000}ms`);
  });

  it('spends the stagger step tokens.css declares', () => {
    expect(token('--motion-stagger')).toBe(`${STEP * 1000}ms`);
  });

  it('draws the same curve --e-out draws', () => {
    expect(token('--e-out')).toBe(`cubic-bezier(${EASE.join(', ')})`);
  });

  it('rises by the distance --motion-rise declares', () => {
    expect(token('--motion-rise')).toBe(`${frame(enter(MOVING), 'initial').y}px`);
  });
});
