/**
 * The one thing that decides which theme a document is in, and the one thing
 * that writes `data-theme` on `<html>`.
 *
 * Three themes, resolved in this order: a choice the reader made and we stored,
 * then `prefers-contrast: more`, then `prefers-color-scheme: dark`, then light.
 * High contrast outranks dark because it is an accessibility need rather than a
 * taste — someone who asked for more contrast and also runs a dark desktop
 * wants the contrast.
 *
 * ## Stored means chosen
 *
 * `vitae.theme` is written only when someone calls `setTheme`, never for a
 * theme that was merely inferred from the operating system. That distinction is
 * the whole reason the media-query subscription below can work: an inferred
 * theme leaves the key absent, so the document keeps tracking the system, and
 * an explicit choice fills the key in and pins it.
 *
 * Persisting the inferred value instead — which is what this did first — looks
 * identical on the first render and is wrong from the second onward. It meant a
 * key always existed after mount, so the `stored` guard in the subscription was
 * never false, so the subscription was dead code; and a reader who had never
 * expressed a preference was pinned forever to whatever their desktop happened
 * to be set to the first time they opened the app.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export type Theme = 'light' | 'dark' | 'hc';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  /** The theme actually on the document. */
  resolvedTheme: Theme;
  followsSystem: boolean;
  followSystem: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'vitae.theme';
const THEMES: readonly Theme[] = ['light', 'dark', 'hc'];

/** A stored value, or null for anything this version does not recognise. A
 * name we no longer ship is treated as no choice rather than written onto the
 * document, where it would select no theme block at all. */
function storedTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(raw as Theme) ? (raw as Theme) : null;
  } catch {
    // Storage can throw rather than return null: Safari in private browsing,
    // and any document on an origin the user has blocked storage for.
    return null;
  }
}

function asks(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/** What the operating system asks for, for a reader who has chosen nothing. */
function systemTheme(): Theme {
  if (asks('(prefers-contrast: more)')) return 'hc';
  if (asks('(prefers-color-scheme: dark)')) return 'dark';
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(storedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = preference ?? system;

  const setTheme = useCallback<Dispatch<SetStateAction<Theme>>>((next) => {
    setPreference((current) => typeof next === 'function' ? next(current ?? systemTheme()) : next);
  }, []);

  const followSystem = useCallback(() => {
    setSystem(systemTheme());
    setPreference(null);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      if (preference === null) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // The theme is applied either way; not remembering it is the lesser
      // failure, and there is nothing useful to tell the reader about it.
    }
  }, [theme, preference]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const queries = ['(prefers-contrast: more)', '(prefers-color-scheme: dark)'].map((query) =>
      window.matchMedia(query),
    );

    const handleChange = () => {
      setSystem(systemTheme());
    };

    for (const query of queries) query.addEventListener('change', handleChange);
    return () => {
      for (const query of queries) query.removeEventListener('change', handleChange);
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme: theme, followsSystem: preference === null, followSystem }),
    [theme, setTheme, preference, followSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  // Throwing rather than defaulting to light: a component reading the theme
  // with no provider above it would otherwise render plausibly and be wrong
  // everywhere, which is much harder to notice than a crash on first render.
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
