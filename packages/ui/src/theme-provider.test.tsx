/**
 * ThemeProvider decides which of the three themes a document is in, and it is
 * the only thing that writes `data-theme` on `<html>`.
 *
 * The order it resolves them in is the whole design, so each precedence step
 * gets its own test: a stored choice beats the operating system, and among the
 * system preferences high contrast beats dark. High contrast wins because it
 * is an accessibility need rather than a taste — a reader who has asked for
 * more contrast and also has a dark desktop wants the contrast.
 *
 * jsdom's own `matchMedia` answers `false` to everything and cannot be told
 * otherwise, so every test here installs one it controls. `setPreferences`
 * takes the queries it should answer true to, which keeps each test's setup
 * readable as the situation it is describing.
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider.js';

const STORAGE_KEY = 'vitae.theme';

/** Listeners the component registered, so a test can announce a change the way
 * a real MediaQueryList would rather than only flipping a getter. */
let listeners: Array<{ media: string; fire: () => void }> = [];
let matching: string[] = [];

function setPreferences(...queries: string[]) {
  matching = queries;
}

/** Tells every subscriber the preferences moved, as the browser would. */
function announce() {
  act(() => {
    for (const listener of [...listeners]) listener.fire();
  });
}

function theme(): string | null {
  return document.documentElement.getAttribute('data-theme');
}

beforeEach(() => {
  listeners = [];
  matching = [];
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('matchMedia', (media: string) => ({
    get matches() {
      return matching.some((query) => media.includes(query));
    },
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, fire: () => void) => {
      listeners.push({ media, fire });
    },
    removeEventListener: (_type: string, fire: () => void) => {
      listeners = listeners.filter((listener) => listener.fire !== fire);
    },
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function mount() {
  return renderHook(() => useTheme(), { wrapper: ThemeProvider });
}

describe('ThemeProvider initial theme', () => {
  it('is light when nothing is stored and the system asks for nothing', () => {
    const { result } = mount();
    expect(result.current.theme).toBe('light');
    expect(theme()).toBe('light');
  });

  it('takes a stored choice from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = mount();
    expect(result.current.theme).toBe('dark');
    expect(theme()).toBe('dark');
  });

  it('follows prefers-color-scheme: dark when nothing is stored', () => {
    setPreferences('prefers-color-scheme: dark');
    const { result } = mount();
    expect(result.current.theme).toBe('dark');
  });

  it('follows prefers-contrast: more when nothing is stored', () => {
    setPreferences('prefers-contrast: more');
    const { result } = mount();
    expect(result.current.theme).toBe('hc');
  });

  // An accessibility need outranks a preference: a reader who asked for more
  // contrast and happens to run a dark desktop wants the contrast.
  it('prefers high contrast over dark when the system asks for both', () => {
    setPreferences('prefers-contrast: more', 'prefers-color-scheme: dark');
    const { result } = mount();
    expect(result.current.theme).toBe('hc');
  });

  it('lets a stored choice override the system preference', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    setPreferences('prefers-contrast: more', 'prefers-color-scheme: dark');
    const { result } = mount();
    expect(result.current.theme).toBe('light');
    expect(theme()).toBe('light');
  });
});

describe('ThemeProvider changing theme', () => {
  it('persists an explicit choice even when it matches the inferred theme', () => {
    const { result, unmount } = mount();
    expect(result.current.followsSystem).toBe(true);
    act(() => result.current.setTheme('light'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(result.current.followsSystem).toBe(false);
    unmount();
    setPreferences('prefers-color-scheme: dark');
    expect(mount().result.current.theme).toBe('light');
  });

  it('writes the new theme onto the document element', () => {
    const { result } = mount();
    act(() => result.current.setTheme('hc'));
    expect(theme()).toBe('hc');
  });

  it('remembers the choice, so a reload does not undo it', () => {
    const { result } = mount();
    act(() => result.current.setTheme('dark'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  /* Storing the inferred theme on mount is the bug this guards: it made the
     key always present, which pinned a reader who had chosen nothing to
     whatever their desktop happened to be on their first visit. */
  it('stores nothing for a theme it only inferred from the system', () => {
    setPreferences('prefers-color-scheme: dark');
    const { result } = mount();
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reports the theme it resolved as well as the one that was asked for', () => {
    const { result } = mount();
    act(() => result.current.setTheme('dark'));
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('accepts an updater, so a toggle does not have to read the value first', () => {
    const { result } = mount();
    act(() => result.current.setTheme((current) => (current === 'light' ? 'dark' : 'light')));
    expect(result.current.theme).toBe('dark');
  });
});

describe('ThemeProvider following the system', () => {
  it('can return to the current system setting and keep following after a reload', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result, unmount } = mount();
    setPreferences('prefers-color-scheme: dark');
    announce();
    expect(result.current.theme).toBe('light');
    act(() => result.current.followSystem());
    expect(result.current.theme).toBe('dark');
    expect(result.current.followsSystem).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    setPreferences('prefers-contrast: more');
    announce();
    expect(result.current.theme).toBe('hc');
    unmount();
    expect(mount().result.current.followsSystem).toBe(true);
  });

  it('moves with the system while the reader has made no choice of their own', () => {
    const { result } = mount();
    expect(result.current.theme).toBe('light');

    setPreferences('prefers-color-scheme: dark');
    announce();

    expect(result.current.theme).toBe('dark');
    expect(theme()).toBe('dark');
  });

  it('stops following once the reader has chosen for themselves', () => {
    const { result } = mount();
    act(() => result.current.setTheme('light'));

    setPreferences('prefers-color-scheme: dark');
    announce();

    expect(result.current.theme).toBe('light');
    expect(theme()).toBe('light');
  });

  it('does not follow the system for a document that already had a stored choice', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = mount();

    setPreferences('prefers-contrast: more');
    announce();

    expect(result.current.theme).toBe('light');
  });

  it('unsubscribes on unmount, so a preference change cannot reach a dead tree', () => {
    const { unmount } = mount();
    expect(listeners.length).toBeGreaterThan(0);
    unmount();
    expect(listeners).toEqual([]);
  });
});

describe('ThemeProvider hostile storage', () => {
  it('ignores a stored name it does not ship, rather than writing it onto <html>', () => {
    localStorage.setItem(STORAGE_KEY, 'solarized');
    const { result } = mount();
    expect(result.current.theme).toBe('light');
    expect(theme()).toBe('light');
  });

  it('still themes the document when localStorage throws, as it does in private mode', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is not available');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is not available');
    });
    try {
      const { result } = mount();
      expect(result.current.theme).toBe('light');
      act(() => result.current.setTheme('dark'));
      expect(theme()).toBe('dark');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('useTheme', () => {
  it('throws outside a provider rather than handing back a silent default', () => {
    // The error is the point: a component reading the theme with no provider
    // above it would otherwise render light forever and look merely wrong.
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });

  it('is available to anything inside the provider', () => {
    function Readout() {
      return <output>{useTheme().theme}</output>;
    }
    localStorage.setItem(STORAGE_KEY, 'hc');
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('hc');
  });
});
