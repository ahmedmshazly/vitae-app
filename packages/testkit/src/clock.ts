/**
 * Controllable clock for tests. Services that care about "now" should accept an
 * injectable clock; tests freeze time so rankings, retention cutoffs, and
 * date-dependent UI stay deterministic.
 */

export type Clock = {
  now(): Date;
  nowIso(): string;
  todayIso(): string;
};

export function fixedClock(iso = '2026-08-09T12:00:00.000Z'): Clock & {
  advanceMs(ms: number): void;
  set(iso: string): void;
} {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    nowIso: () => current.toISOString(),
    todayIso: () => current.toISOString().slice(0, 10),
    advanceMs(ms: number) {
      current = new Date(current.getTime() + ms);
    },
    set(next: string) {
      current = new Date(next);
    },
  };
}

/** Wall clock for suites that do not need a frozen timeline. */
export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
  todayIso: () => new Date().toISOString().slice(0, 10),
};
