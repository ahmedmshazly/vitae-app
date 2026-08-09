export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
  current: boolean;
  kind: 'span' | 'moment';
}

export interface TimelineLane {
  name: string;
  items: TimelineItem[];
}

export interface TimelineData {
  years: number[];
  lanes: TimelineLane[];
}

export interface TimelineReviewItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
}

export interface TimelineReviewSection {
  key: string;
  title: string;
  count: number;
  items: TimelineReviewItem[];
}

export interface TimelineReviewResult {
  from: string;
  to: string;
  label: string;
  summary: Record<string, number>;
  sections: TimelineReviewSection[];
}

export type TimelineZoom = 'decade' | 'year' | 'quarter' | 'month';

export type TimelineViewMode = 'chronograph' | 'list';

export interface BrushRange {
  from: string; // YYYY-MM-DD
  to: string;
}

export const PX_PER_YEAR: Record<TimelineZoom, number> = {
  decade: 48,
  year: 120,
  quarter: 220,
  month: 340,
};

export const ALL_LANES = ['Roles', 'Projects', 'Education', 'Events', 'Trips'] as const;

/** Fractional year, e.g. 2024-07-01 → 2024.5. */
export function yearFrac(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7) || '1');
  const d = Number(iso.slice(8, 10) || '1');
  return y + (m - 1) / 12 + (d - 1) / 365;
}

export function fracToIso(frac: number): string {
  const y = Math.floor(frac);
  const rem = frac - y;
  const monthFloat = rem * 12;
  const m = Math.min(11, Math.max(0, Math.floor(monthFloat)));
  const dayFloat = (monthFloat - m) * 28 + 1;
  const d = Math.min(28, Math.max(1, Math.floor(dayFloat)));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Greedy interval partition so overlapping bars stack instead of colliding. */
export function stackRows(
  items: TimelineItem[],
  endOf: (i: TimelineItem) => number,
): Map<string, number> {
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const item of items) {
    const start = yearFrac(item.start);
    let row = rowEnds.findIndex((e) => e <= start + 0.01);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = endOf(item);
    rows.set(item.id, row);
  }
  return rows;
}
