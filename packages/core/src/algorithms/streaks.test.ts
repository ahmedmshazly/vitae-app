import { describe, expect, it } from 'vitest';
import { computeStreak } from './streaks.js';

const T = '2026-07-12';

describe('computeStreak', () => {
  it('returns zeros for no checks', () => {
    const r = computeStreak([], T);
    expect(r.current).toBe(0);
    expect(r.best).toBe(0);
    expect(r.grid).toHaveLength(30);
    expect(r.grid.every((d) => !d)).toBe(true);
  });

  it('counts a run ending today', () => {
    const r = computeStreak(['2026-07-10', '2026-07-11', '2026-07-12'], T);
    expect(r.current).toBe(3);
    expect(r.best).toBe(3);
    expect(r.grid.at(-1)).toBe(true);
  });

  it('does not break the streak if today is not yet checked', () => {
    const r = computeStreak(['2026-07-10', '2026-07-11'], T);
    expect(r.current).toBe(2);
  });

  it('breaks the streak after a missed day', () => {
    const r = computeStreak(['2026-07-08', '2026-07-09', '2026-07-11', '2026-07-12'], T);
    expect(r.current).toBe(2);
    expect(r.best).toBe(2);
  });

  it('best streak can be in the past', () => {
    const r = computeStreak(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-07-12'], T);
    expect(r.current).toBe(1);
    expect(r.best).toBe(4);
  });

  it('grid is oldest → newest over gridDays', () => {
    const r = computeStreak(['2026-07-12'], T, 7);
    expect(r.grid).toEqual([false, false, false, false, false, false, true]);
  });

  it('ignores duplicate dates', () => {
    const r = computeStreak(['2026-07-12', '2026-07-12', '2026-07-11'], T);
    expect(r.current).toBe(2);
    expect(r.best).toBe(2);
  });
});
