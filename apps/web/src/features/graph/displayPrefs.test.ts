import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_PREFS,
  loadDisplayPrefs,
  saveDisplayPrefs,
} from './displayPrefs.js';

const KEY = 'vitae.graph.displayPrefs';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('graph displayPrefs', () => {
  it('loads defaults when nothing is stored', () => {
    expect(loadDisplayPrefs()).toEqual(DEFAULT_DISPLAY_PREFS);
  });

  it('merges saved booleans and label mode, then round-trips', () => {
    saveDisplayPrefs({
      ...DEFAULT_DISPLAY_PREFS,
      dimOnHover: false,
      labels: 'always',
    });
    const loaded = loadDisplayPrefs();
    expect(loaded.dimOnHover).toBe(false);
    expect(loaded.labels).toBe('always');
    expect(loaded.dimOffPath).toBe(DEFAULT_DISPLAY_PREFS.dimOffPath);

    localStorage.setItem(KEY, JSON.stringify({ dimOnHover: 'nope', labels: 'always' }));
    const merged = loadDisplayPrefs();
    expect(merged.dimOnHover).toBe(DEFAULT_DISPLAY_PREFS.dimOnHover);
    expect(merged.labels).toBe('always');
  });
});
