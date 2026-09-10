import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';

type Theme = 'light' | 'dark' | 'hc';

interface ThemeContextValue {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  resolvedTheme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'vitae.theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  if (stored) return stored;
  if (window.matchMedia('(prefers-contrast: more)').matches) return 'hc';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(theme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    setResolvedTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    const mqContrast = window.matchMedia('(prefers-contrast: more)');

    const handleChange = () => {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (!stored) {
        const next = mqContrast.matches ? 'hc' : mqDark.matches ? 'dark' : 'light';
        setTheme(next);
      }
    };

    mqDark.addEventListener('change', handleChange);
    mqContrast.addEventListener('change', handleChange);
    return () => {
      mqDark.removeEventListener('change', handleChange);
      mqContrast.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
