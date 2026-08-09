import { useCallback, useState } from 'react';
import type { TimelineZoom } from './types.js';
import { ALL_LANES } from './types.js';

const STORAGE_KEY = 'vitae.timeline.displayPrefs';

export interface TimelineDisplayPrefs {
  showSubtitles: boolean;
  showMoments: boolean;
  stickyLabels: boolean;
  density: 'comfortable' | 'compact';
  activeLanes: string[];
}

export const DEFAULT_TIMELINE_PREFS: TimelineDisplayPrefs = {
  showSubtitles: true,
  showMoments: true,
  stickyLabels: true,
  density: 'comfortable',
  activeLanes: [...ALL_LANES],
};

export function loadTimelinePrefs(): TimelineDisplayPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_TIMELINE_PREFS, activeLanes: [...ALL_LANES] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TIMELINE_PREFS, activeLanes: [...ALL_LANES] };
    const parsed = JSON.parse(raw) as Partial<TimelineDisplayPrefs>;
    return {
      showSubtitles:
        typeof parsed.showSubtitles === 'boolean'
          ? parsed.showSubtitles
          : DEFAULT_TIMELINE_PREFS.showSubtitles,
      showMoments:
        typeof parsed.showMoments === 'boolean' ? parsed.showMoments : DEFAULT_TIMELINE_PREFS.showMoments,
      stickyLabels:
        typeof parsed.stickyLabels === 'boolean'
          ? parsed.stickyLabels
          : DEFAULT_TIMELINE_PREFS.stickyLabels,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      activeLanes: Array.isArray(parsed.activeLanes)
        ? parsed.activeLanes.filter((l): l is string => typeof l === 'string')
        : [...ALL_LANES],
    };
  } catch {
    return { ...DEFAULT_TIMELINE_PREFS, activeLanes: [...ALL_LANES] };
  }
}

export function saveTimelinePrefs(prefs: TimelineDisplayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useTimelineDisplayPrefs(): [
  TimelineDisplayPrefs,
  (patch: Partial<TimelineDisplayPrefs>) => void,
  () => void,
] {
  const [prefs, setPrefs] = useState<TimelineDisplayPrefs>(() => loadTimelinePrefs());

  const patch = useCallback((p: Partial<TimelineDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      saveTimelinePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_TIMELINE_PREFS, activeLanes: [...ALL_LANES] };
    saveTimelinePrefs(next);
    setPrefs(next);
  }, []);

  return [prefs, patch, reset];
}

export const ZOOM_ORDER: TimelineZoom[] = ['decade', 'year', 'quarter', 'month'];

export function zoomIn(z: TimelineZoom): TimelineZoom {
  const i = ZOOM_ORDER.indexOf(z);
  return ZOOM_ORDER[Math.min(ZOOM_ORDER.length - 1, i + 1)]!;
}

export function zoomOut(z: TimelineZoom): TimelineZoom {
  const i = ZOOM_ORDER.indexOf(z);
  return ZOOM_ORDER[Math.max(0, i - 1)]!;
}
