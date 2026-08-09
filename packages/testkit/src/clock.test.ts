import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock.js';

describe('fixedClock', () => {
  it('returns a frozen instant until advanced', () => {
    const clock = fixedClock('2026-08-09T12:00:00.000Z');
    expect(clock.nowIso()).toBe('2026-08-09T12:00:00.000Z');
    expect(clock.todayIso()).toBe('2026-08-09');
    clock.advanceMs(60_000);
    expect(clock.nowIso()).toBe('2026-08-09T12:01:00.000Z');
  });

  it('replaces the current instant with set()', () => {
    const clock = fixedClock();
    clock.set('2025-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
});
