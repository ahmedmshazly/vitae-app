import { useCallback, useState } from 'react';

const STORAGE_KEY = 'vitae.atlas.displayPrefs';

export interface AtlasDisplayPrefs {
  showLabels: boolean;
  showArcs: boolean;
  showPatterns: boolean;
  cluster: boolean;
}

export const DEFAULT_ATLAS_PREFS: AtlasDisplayPrefs = {
  showLabels: true,
  showArcs: true,
  showPatterns: true,
  cluster: true,
};

export function loadAtlasPrefs(): AtlasDisplayPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_ATLAS_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ATLAS_PREFS };
    const p = JSON.parse(raw) as Partial<AtlasDisplayPrefs>;
    return {
      showLabels: typeof p.showLabels === 'boolean' ? p.showLabels : DEFAULT_ATLAS_PREFS.showLabels,
      showArcs: typeof p.showArcs === 'boolean' ? p.showArcs : DEFAULT_ATLAS_PREFS.showArcs,
      showPatterns:
        typeof p.showPatterns === 'boolean' ? p.showPatterns : DEFAULT_ATLAS_PREFS.showPatterns,
      cluster: typeof p.cluster === 'boolean' ? p.cluster : DEFAULT_ATLAS_PREFS.cluster,
    };
  } catch {
    return { ...DEFAULT_ATLAS_PREFS };
  }
}

export function saveAtlasPrefs(prefs: AtlasDisplayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useAtlasDisplayPrefs(): [
  AtlasDisplayPrefs,
  (patch: Partial<AtlasDisplayPrefs>) => void,
  () => void,
] {
  const [prefs, setPrefs] = useState<AtlasDisplayPrefs>(() => loadAtlasPrefs());
  const patch = useCallback((p: Partial<AtlasDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      saveAtlasPrefs(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    const next = { ...DEFAULT_ATLAS_PREFS };
    saveAtlasPrefs(next);
    setPrefs(next);
  }, []);
  return [prefs, patch, reset];
}
