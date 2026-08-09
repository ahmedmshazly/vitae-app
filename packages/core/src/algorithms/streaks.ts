/**
 * Habit streaks (SRS Today view): pure date arithmetic over a set of checked
 * days. All dates are ISO `YYYY-MM-DD` strings; "today" is passed in so the
 * function stays deterministic and testable.
 */

export interface StreakResult {
  /** Consecutive checked days ending today or yesterday (a miss today doesn't break it yet). */
  current: number;
  /** Longest run ever. */
  best: number;
  /** Last `gridDays` days, oldest → newest; true = checked. */
  grid: boolean[];
}

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function computeStreak(checkedDates: string[], today: string, gridDays = 30): StreakResult {
  const days = new Set(checkedDates);
  const todayMs = toUtcMs(today);

  // Current streak: walk back from today; if today unchecked, allow starting yesterday.
  let current = 0;
  let cursor = todayMs;
  if (!days.has(today)) cursor -= DAY_MS;
  while (days.has(fromUtcMs(cursor))) {
    current += 1;
    cursor -= DAY_MS;
  }

  // Best streak: scan sorted unique days.
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prevMs = Number.NaN;
  for (const d of sorted) {
    const ms = toUtcMs(d);
    run = ms - prevMs === DAY_MS ? run + 1 : 1;
    prevMs = ms;
    if (run > best) best = run;
  }

  const grid: boolean[] = [];
  for (let i = gridDays - 1; i >= 0; i--) {
    grid.push(days.has(fromUtcMs(todayMs - i * DAY_MS)));
  }

  return { current, best, grid };
}
