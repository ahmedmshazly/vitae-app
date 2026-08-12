import { act, cleanup, render as renderDom, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { easeFraction, readDurationToken, useAnimatedNumber } from './use-animated-number.js';

interface Frame {
  id: number;
  cb: FrameRequestCallback;
}

let now = 0;
let nextId = 1;
let queue: Frame[] = [];
let cancel: ReturnType<typeof vi.fn>;

/** Runs every frame queued up to this point at the new clock reading. */
function flush(ms: number) {
  now += ms;
  const due = queue;
  queue = [];
  act(() => {
    for (const frame of due) frame.cb(now);
  });
}

function pending(): number {
  return queue.length;
}

/** matchMedia answering a fixed preference, for the reduced motion path. */
function stubPreference(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function render(initial: number, options?: { duration?: number }) {
  return renderHook(({ target }: { target: number }) => useAnimatedNumber(target, options), {
    initialProps: { target: initial },
  });
}

/**
 * tokens.css is not loaded under jsdom, and the hook treats a missing --ae-dur
 * as "this page has no motion". Every test that wants the easing says so.
 */
function setDurationToken(value: string) {
  document.documentElement.style.setProperty('--ae-dur', value);
}

describe('useAnimatedNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    nextId = 1;
    queue = [];
    setDurationToken('130ms');
    cancel = vi.fn((id: number) => {
      queue = queue.filter((frame) => frame.id !== id);
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      queue.push({ id, cb });
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--ae-dur');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the target on mount and schedules nothing, a value appearing is not a change', () => {
    const { result } = render(42);
    expect(result.current).toBe(42);
    expect(pending()).toBe(0);
  });

  it('still shows the old value on the render that receives a new target', () => {
    const { result, rerender } = render(50);
    rerender({ target: 100 });
    expect(result.current).toBe(50);
    expect(pending()).toBe(1);
  });

  it('eases toward a new target and lands on it exactly', () => {
    const { result, rerender } = render(50);
    rerender({ target: 100 });

    flush(0);
    expect(result.current).toBe(50);

    flush(65);
    expect(result.current).toBeGreaterThan(50);
    expect(result.current).toBeLessThan(100);

    flush(65);
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('stays inside the span it is crossing and only ever moves forward', () => {
    const { result, rerender } = render(20);
    rerender({ target: 80 });

    const samples: number[] = [];
    flush(0);
    samples.push(result.current);
    for (let i = 0; i < 7; i += 1) {
      flush(20);
      samples.push(result.current);
    }

    for (const [i, value] of samples.entries()) {
      expect(value).toBeGreaterThanOrEqual(20);
      expect(value).toBeLessThanOrEqual(80);
      if (i > 0) expect(value).toBeGreaterThanOrEqual(samples[i - 1] as number);
    }
    expect(samples.at(-1)).toBe(80);
  });

  it('counts down as readily as up', () => {
    const { result, rerender } = render(90);
    rerender({ target: 10 });
    flush(0);
    flush(65);
    expect(result.current).toBeLessThan(90);
    expect(result.current).toBeGreaterThan(10);
    flush(65);
    expect(result.current).toBe(10);
  });

  it('cancels the in flight frame when the target moves and resumes from where it was', () => {
    const { result, rerender } = render(0);
    rerender({ target: 100 });
    flush(0);
    flush(65);
    const midflight = result.current;
    expect(midflight).toBeGreaterThan(0);
    expect(midflight).toBeLessThan(100);

    rerender({ target: 0 });
    expect(cancel).toHaveBeenCalled();
    expect(pending()).toBe(1);

    flush(0);
    expect(result.current).toBe(midflight);
    flush(65);
    expect(result.current).toBeLessThan(midflight);
    flush(65);
    expect(result.current).toBe(0);
    expect(pending()).toBe(0);
  });

  it('cancels its frame on unmount', () => {
    const { rerender, unmount } = render(0);
    rerender({ target: 100 });
    flush(0);
    expect(pending()).toBe(1);

    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(pending()).toBe(0);
  });

  it('returns the target immediately when reduced motion is on', () => {
    stubPreference(true);
    const { result, rerender } = render(10);
    expect(result.current).toBe(10);

    rerender({ target: 90 });
    expect(result.current).toBe(90);
    expect(pending()).toBe(0);
  });

  it('returns the target when requestAnimationFrame is missing', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const { result, rerender } = render(10);
    rerender({ target: 90 });
    expect(result.current).toBe(90);
    expect(pending()).toBe(0);
  });

  it('honours a custom duration', () => {
    const { result, rerender } = render(0, { duration: 220 });
    rerender({ target: 100 });
    flush(0);
    flush(130);
    expect(result.current).toBeLessThan(100);
    flush(90);
    expect(result.current).toBe(100);
  });

  it('treats a zero duration as an instant change', () => {
    const { result, rerender } = render(0, { duration: 0 });
    rerender({ target: 100 });
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('passes a non finite target straight through', () => {
    const { result, rerender } = render(0);
    rerender({ target: Number.NaN });
    expect(result.current).toBeNaN();
    expect(pending()).toBe(0);
  });

  it('eases from the last finite value after a non finite target has passed through', () => {
    const { result, rerender } = render(10);

    rerender({ target: Number.NaN });
    expect(result.current).toBeNaN();
    expect(pending()).toBe(0);

    rerender({ target: 100 });
    flush(0);
    expect(result.current).toBe(10);

    flush(65);
    expect(result.current).toBeGreaterThan(10);
    expect(result.current).toBeLessThan(100);

    flush(65);
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('lands without easing when the only value it has ever held is non finite', () => {
    const { result, rerender } = render(Number.NaN);
    expect(result.current).toBeNaN();

    rerender({ target: 100 });
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('hands back no non finite render once a real target has arrived', () => {
    const seen: number[] = [];
    const view = renderHook(
      ({ target }: { target: number }) => {
        const value = useAnimatedNumber(target);
        seen.push(value);
        return value;
      },
      { initialProps: { target: Number.NaN } },
    );

    seen.length = 0;
    view.rerender({ target: 100 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((value) => !Number.isFinite(value))).toEqual([]);
    expect(view.result.current).toBe(100);
  });

  it('takes its duration from --ae-dur when the caller names none', () => {
    setDurationToken('220ms');
    const { result, rerender } = render(0);
    rerender({ target: 100 });

    flush(0);
    flush(130);
    expect(result.current).toBeLessThan(100);
    flush(90);
    expect(result.current).toBe(100);
  });

  it('schedules nothing when the document reports no --ae-dur', () => {
    document.documentElement.style.removeProperty('--ae-dur');
    const { result, rerender } = render(0);
    rerender({ target: 100 });
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('schedules nothing when --ae-dur is zeroed, which is what reduced motion does to it', () => {
    setDurationToken('0ms');
    const { result, rerender } = render(0);
    rerender({ target: 100 });
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });

  it('will not let a named duration animate on a page whose --ae-dur is gone', () => {
    document.documentElement.style.removeProperty('--ae-dur');
    const { result, rerender } = render(0, { duration: 220 });
    rerender({ target: 100 });
    expect(result.current).toBe(100);
    expect(pending()).toBe(0);
  });
});

describe('readDurationToken', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--ae-dur');
  });

  it('is null on a page that has not loaded tokens.css', () => {
    expect(readDurationToken()).toBeNull();
  });

  it('reads milliseconds', () => {
    setDurationToken('130ms');
    expect(readDurationToken()).toBe(130);
  });

  it('reads seconds as milliseconds', () => {
    setDurationToken('0.22s');
    expect(readDurationToken()).toBe(220);
  });

  it('is null for a value that is not a time', () => {
    setDurationToken('fast');
    expect(readDurationToken()).toBeNull();
  });
});

/**
 * The reason the --ae-dur token is the switch: jsdom has requestAnimationFrame
 * but no stylesheet, so a consumer gets a hook that commits once and schedules
 * nothing. Note what this test does not do: stub requestAnimationFrame, stub
 * matchMedia, pass a duration, or wrap anything in act.
 */
describe('a component that animates a number, in an ordinary component test', () => {
  function Counter({ target }: { target: number }) {
    const value = useAnimatedNumber(target);
    return createElement('output', null, String(Math.round(value)));
  }

  afterEach(() => {
    cleanup();
  });

  it('shows the new target at once and never warns about act', async () => {
    const logged: unknown[] = [];
    const console_ = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args[0]);
    });
    const raf = vi.spyOn(window, 'requestAnimationFrame');

    try {
      const view = renderDom(createElement(Counter, { target: 10 }));
      expect(view.container.textContent).toBe('10');

      view.rerender(createElement(Counter, { target: 100 }));
      expect(view.container.textContent).toBe('100');

      // Long enough for several real frames, had any been asked for.
      await new Promise((resolve) => {
        setTimeout(resolve, 80);
      });

      expect(raf).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    } finally {
      raf.mockRestore();
      console_.mockRestore();
    }
  });
});

describe('easeFraction', () => {
  it('pins both ends of the curve and clamps outside them', () => {
    expect(easeFraction(0)).toBe(0);
    expect(easeFraction(1)).toBe(1);
    expect(easeFraction(-0.5)).toBe(0);
    expect(easeFraction(2)).toBe(1);
    expect(easeFraction(Number.NaN)).toBe(0);
  });

  it('rises monotonically and never leaves the unit range, so nothing overshoots', () => {
    let previous = 0;
    for (let i = 1; i <= 100; i += 1) {
      const y = easeFraction(i / 100);
      expect(y).toBeGreaterThanOrEqual(previous);
      expect(y).toBeLessThanOrEqual(1);
      previous = y;
    }
  });

  it('front loads the travel, the curve is fast out of the gate and settles late', () => {
    expect(easeFraction(0.5)).toBeGreaterThan(0.5);
    expect(easeFraction(0.25)).toBeGreaterThan(0.25);
  });
});
