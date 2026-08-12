/**
 * Eases a displayed number toward a target over --ae-dur, in JS.
 *
 * Meter is the only design-system component whose value already eases, because
 * a width can be handed to a CSS transition. ChargeRing, StrengthDonut,
 * StrengthBar, FactorBar, DotGrid and ClosenessDots all snap: their value is
 * an SVG geometry or a count of filled cells, which CSS cannot interpolate.
 * A score changing is a nameable state change, which is what brand-book ch.08
 * says motion is for, so those components get the same 130ms as Meter through
 * this hook instead of going without.
 *
 * Deliberately not a spring, not a runtime, not a dependency: one requestAnimationFrame
 * loop over the single easing curve, --ae-ease. It reports the change and stops.
 *
 * ## The stylesheet is the master switch
 *
 * The hook eases only while the document reports a non-zero `--ae-dur`. The
 * token is read from the root element once per mount, and when it is absent or
 * zero the hook snaps: it sets the target in one commit and schedules no frame.
 * Three things fall out of that, all of them wanted.
 *
 * 1. `tokens.css` already zeroes `--ae-dur` under `prefers-reduced-motion`, so
 *    the CSS preference now governs this JS animation the same way it governs
 *    every CSS one, without a second source of truth. `useReducedMotion` stays
 *    as the belt to that braces, for a page that sets the preference some other
 *    way.
 * 2. Before the stylesheet has loaded there is no `--ae-dur`, so a value that
 *    renders early lands rather than easing from a half-styled frame.
 * 3. Under jsdom, where `tokens.css` is not loaded, the hook never calls
 *    requestAnimationFrame. A component using it can be rendered in an ordinary
 *    component test with no rAF stub and no `act(...)` warnings, and its
 *    displayed number is the target as soon as the target changes. A test that
 *    wants the easing itself, as this module's own test does, opts in by
 *    setting `--ae-dur` on the root element.
 *
 * The `duration` option chooses how long the ease runs, not whether it runs:
 * with no token there is no motion whatever it says. Pass `--ae-dur-slow`'s
 * 220ms for a value that needs longer; that is the only other sensible number.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion.js';

// --ae-ease control points. The CSS is cubic-bezier(0.32, 0.72, 0, 1); the
// curve's endpoints are fixed at (0,0) and (1,1), so these four numbers are
// the whole definition.
const P1X = 0.32;
const P1Y = 0.72;
const P2X = 0;
const P2Y = 1;

const EPSILON = 1e-6;

/** One axis of the cubic at parameter t, endpoints implied at 0 and 1. */
function axis(a: number, b: number, t: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * a + 3 * inv * t * t * b + t * t * t;
}

/** d/dt of `axis`, used to steer the Newton search below. */
function slope(a: number, b: number, t: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * a + 6 * inv * t * (b - a) + 3 * t * t * (1 - b);
}

/**
 * The eased fraction for a linear progress fraction. A cubic bezier is
 * parametric, so getting y from x means solving x(t) first: Newton from a
 * sensible seed, bisection when the curve is too flat for Newton to bite.
 */
export function easeFraction(x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;

  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const error = axis(P1X, P2X, t) - x;
    if (Math.abs(error) < EPSILON) return axis(P1Y, P2Y, t);
    const d = slope(P1X, P2X, t);
    if (Math.abs(d) < EPSILON) break;
    t -= error / d;
  }

  let low = 0;
  let high = 1;
  t = x;
  for (let i = 0; i < 24; i += 1) {
    const error = axis(P1X, P2X, t) - x;
    if (Math.abs(error) < EPSILON) break;
    if (error < 0) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return axis(P1Y, P2Y, t);
}

interface Frames {
  request: (cb: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

/** requestAnimationFrame, or null when there is no DOM to paint into. */
function frames(): Frames | null {
  if (typeof window === 'undefined') return null;
  const request = window.requestAnimationFrame;
  if (typeof request !== 'function') return null;
  const cancel = window.cancelAnimationFrame;
  return {
    request: (cb) => request.call(window, cb),
    cancel: (id) => {
      if (typeof cancel === 'function') cancel.call(window, id);
    },
  };
}

/** Fallback clock for a stub that calls back without a timestamp. */
function clock(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** A CSS <time> in milliseconds. Null for anything that is not one. */
function milliseconds(raw: string): number | null {
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2] === 's' ? amount * 1000 : amount;
}

/**
 * `--ae-dur` as read from the root element, or null when there is no DOM, no
 * stylesheet, or a value that is not a time. Null and 0 both mean "no motion";
 * see the module header for why that is the switch.
 */
export function readDurationToken(): number | null {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null;
  const root = typeof document === 'undefined' ? null : document.documentElement;
  if (!root) return null;
  try {
    return milliseconds(window.getComputedStyle(root).getPropertyValue('--ae-dur'));
  } catch {
    // A partial stub is still a stub. No readable token is no motion.
    return null;
  }
}

export interface AnimatedNumberOptions {
  /**
   * Milliseconds the ease runs for, when it runs at all. Defaults to the
   * document's own --ae-dur (130ms once tokens.css is loaded). It cannot turn
   * motion on where the stylesheet says there is none.
   */
  duration?: number;
}

/**
 * The value to render right now, easing toward `target` whenever `target`
 * changes. Returns `target` verbatim on first render, under reduced motion,
 * where the document reports no --ae-dur, and anywhere requestAnimationFrame is
 * missing: a value appearing is not a value changing, and there is nothing to
 * report.
 */
export function useAnimatedNumber(target: number, options?: AnimatedNumberOptions): number {
  // Whether the page has a motion duration at all is a property of the
  // document, not of this value, so it is read once per mount rather than on
  // every frame this hook renders.
  const [token] = useState(readDurationToken);
  const duration = options?.duration ?? token ?? 0;
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  // The last finite value on screen, readable synchronously inside a frame
  // callback so a target change mid-flight can pick up exactly where the last
  // frame left off. A non-finite target never lands here: it is passed through
  // to the caller untouched, and the next finite target eases from this.
  const shown = useRef(target);
  const motion = !reduced && (token ?? 0) > 0 && duration > 0 && frames() !== null;
  // A non-finite value is not a thing to ease, either as the destination or as
  // the origin. Both cases hand the target straight back.
  const animates = motion && Number.isFinite(target) && Number.isFinite(value);

  useEffect(() => {
    const api = frames();
    if (!motion || !Number.isFinite(target) || !api) {
      // Store only what can be eased from later. Writing a non-finite target
      // here used to poison the ref, so the next finite target eased out of
      // NaN and the hook returned NaN for its whole duration.
      if (Number.isFinite(target)) {
        shown.current = target;
        setValue(target);
      }
      return;
    }

    const from = shown.current;
    // `from === target` is true on mount, and whenever the target lands where
    // the value already is. A non-finite `from` is the value having never been
    // finite at all, which is an appearance rather than a change. Both land.
    if (!Number.isFinite(from) || from === target) {
      shown.current = target;
      setValue(target);
      return;
    }

    let start: number | null = null;
    let id: number | null = null;

    const step = (stamp: number) => {
      const at = Number.isFinite(stamp) ? stamp : clock();
      if (start === null) start = at;
      const elapsed = at - start;
      const progress = elapsed >= duration ? 1 : Math.max(0, elapsed / duration);
      // The last frame assigns the target itself, never an interpolation of it,
      // so the value lands exactly and cannot overshoot.
      const next = progress >= 1 ? target : from + (target - from) * easeFraction(progress);
      shown.current = next;
      setValue(next);
      id = progress >= 1 ? null : api.request(step);
    };

    id = api.request(step);
    return () => {
      if (id !== null) api.cancel(id);
      id = null;
    };
    // `motion` folds in the reduced motion preference and the --ae-dur token,
    // so both re-run this effect the way a target change does.
  }, [target, duration, motion]);

  // While the effect has not run yet (first render, or the render that sees a
  // new target), state still holds the old value. That is what we want mid
  // animation, and wrong everywhere else.
  return animates ? value : target;
}
