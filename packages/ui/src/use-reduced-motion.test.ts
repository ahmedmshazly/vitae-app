import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './use-reduced-motion.js';

type ListenerApi = 'modern' | 'legacy' | 'none';

interface FakeMedia {
  /** Flip the preference and notify whoever managed to subscribe. */
  set(next: boolean): void;
  listenerCount(): number;
  queries(): string[];
}

/**
 * Installs a matchMedia stub whose listener surface we choose, because the
 * three shapes the hook has to survive (modern, legacy, neither) cannot be
 * produced by jsdom's own implementation.
 */
function stubMatchMedia(initial: boolean, api: ListenerApi): FakeMedia {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];

  const mql: Record<string, unknown> = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    dispatchEvent: () => false,
  };

  if (api === 'modern') {
    mql.addEventListener = (_type: string, fn: () => void) => {
      listeners.add(fn);
    };
    mql.removeEventListener = (_type: string, fn: () => void) => {
      listeners.delete(fn);
    };
  }
  if (api === 'legacy') {
    mql.addListener = (fn: () => void) => {
      listeners.add(fn);
    };
    mql.removeListener = (fn: () => void) => {
      listeners.delete(fn);
    };
  }

  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return mql;
  });

  return {
    set(next: boolean) {
      matches = next;
      for (const fn of [...listeners]) fn();
    },
    listenerCount: () => listeners.size,
    queries: () => queries,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('reports false under the default jsdom stub, which always answers matches false', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('asks for the prefers-reduced-motion query and reports what it answers', () => {
    const media = stubMatchMedia(true, 'modern');
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    expect(media.queries()).toContain('(prefers-reduced-motion: reduce)');
  });

  it('re-renders when the preference changes through the modern listener', () => {
    const media = stubMatchMedia(false, 'modern');
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('falls back to the deprecated addListener when addEventListener is missing', () => {
    const media = stubMatchMedia(false, 'legacy');
    const { result } = renderHook(() => useReducedMotion());
    expect(media.listenerCount()).toBe(1);

    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount, through either listener API', () => {
    const modern = stubMatchMedia(false, 'modern');
    const first = renderHook(() => useReducedMotion());
    expect(modern.listenerCount()).toBe(1);
    first.unmount();
    expect(modern.listenerCount()).toBe(0);

    vi.unstubAllGlobals();
    const legacy = stubMatchMedia(false, 'legacy');
    const second = renderHook(() => useReducedMotion());
    expect(legacy.listenerCount()).toBe(1);
    second.unmount();
    expect(legacy.listenerCount()).toBe(0);
  });

  it('survives a stub carrying neither listener API', () => {
    const media = stubMatchMedia(true, 'none');
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    expect(media.listenerCount()).toBe(0);
    expect(() => unmount()).not.toThrow();
  });

  it('reports false when matchMedia is absent entirely', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('reports false when matchMedia throws', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported');
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
