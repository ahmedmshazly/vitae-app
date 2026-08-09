import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_PREFS,
  loadTimelinePrefs,
  saveTimelinePrefs,
  zoomIn,
  zoomOut,
} from './displayPrefs.js';
import { ALL_LANES } from './types.js';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('timeline displayPrefs', () => {
  it('loads defaults and round-trips a save', () => {
    expect(loadTimelinePrefs().activeLanes).toEqual([...ALL_LANES]);
    saveTimelinePrefs({
      ...DEFAULT_TIMELINE_PREFS,
      showMoments: false,
      activeLanes: ['Roles'],
      density: 'compact',
    });
    const loaded = loadTimelinePrefs();
    expect(loaded.showMoments).toBe(false);
    expect(loaded.activeLanes).toEqual(['Roles']);
    expect(loaded.density).toBe('compact');
  });

  it('clamps zoomIn and zoomOut at the ends', () => {
    expect(zoomIn('decade')).toBe('year');
    expect(zoomIn('month')).toBe('month');
    expect(zoomOut('month')).toBe('quarter');
    expect(zoomOut('decade')).toBe('decade');
  });
});
