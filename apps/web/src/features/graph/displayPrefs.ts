import { useCallback, useState } from 'react';

const STORAGE_KEY = 'vitae.graph.displayPrefs';

export type GraphLabelMode = 'auto' | 'always' | 'selection';

export interface GraphDisplayPrefs {
  dimOnHover: boolean;
  dimOffPath: boolean;
  fadeByHop: boolean;
  accentHoverLinks: boolean;
  labels: GraphLabelMode;
}

export const DEFAULT_DISPLAY_PREFS: GraphDisplayPrefs = {
  dimOnHover: true,
  dimOffPath: true,
  fadeByHop: true,
  accentHoverLinks: true,
  labels: 'auto',
};

function isLabelMode(v: unknown): v is GraphLabelMode {
  return v === 'auto' || v === 'always' || v === 'selection';
}

export function loadDisplayPrefs(): GraphDisplayPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_DISPLAY_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_PREFS };
    const parsed = JSON.parse(raw) as Partial<GraphDisplayPrefs>;
    return {
      dimOnHover: typeof parsed.dimOnHover === 'boolean' ? parsed.dimOnHover : DEFAULT_DISPLAY_PREFS.dimOnHover,
      dimOffPath: typeof parsed.dimOffPath === 'boolean' ? parsed.dimOffPath : DEFAULT_DISPLAY_PREFS.dimOffPath,
      fadeByHop: typeof parsed.fadeByHop === 'boolean' ? parsed.fadeByHop : DEFAULT_DISPLAY_PREFS.fadeByHop,
      accentHoverLinks:
        typeof parsed.accentHoverLinks === 'boolean'
          ? parsed.accentHoverLinks
          : DEFAULT_DISPLAY_PREFS.accentHoverLinks,
      labels: isLabelMode(parsed.labels) ? parsed.labels : DEFAULT_DISPLAY_PREFS.labels,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_PREFS };
  }
}

export function saveDisplayPrefs(prefs: GraphDisplayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / private mode, ignore.
  }
}

export function useGraphDisplayPrefs(): [
  GraphDisplayPrefs,
  (patch: Partial<GraphDisplayPrefs>) => void,
  () => void,
] {
  const [prefs, setPrefs] = useState<GraphDisplayPrefs>(() => loadDisplayPrefs());

  const patchPrefs = useCallback((patch: Partial<GraphDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveDisplayPrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULT_DISPLAY_PREFS };
    saveDisplayPrefs(next);
    setPrefs(next);
  }, []);

  return [prefs, patchPrefs, resetPrefs];
}
