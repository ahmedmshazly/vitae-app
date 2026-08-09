/**
 * Template line model (SRS §6.6, FR-RES-009). Estimates how many rendered lines
 * a piece of content will occupy on the page, from per-template constants
 * (chars/line, lines/page, entry/section overheads) calibrated against a real
 * compile in CI. This drives the live page meter and the knapsack budget in
 * atom selection, the résumé engine can fit content to one page BEFORE paying
 * for a LaTeX compile.
 */
import type { LineModel } from '../schema/resume.js';

/** Estimate wrapped lines for a single text string under a line model. */
export function estimateLines(text: string, model: LineModel): number {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return 0;
  // Bullets rarely fill the last line exactly; ceil models the wrap.
  return Math.max(1, Math.ceil(clean.length / model.chars_per_line));
}

export interface EntryGroup {
  /** Header line(s) for the entry (role title, org, dates). */
  header?: string;
  /** Bullet texts. */
  bullets: string[];
}

/** Estimate lines for a whole section = section overhead + each entry. */
export function estimateSectionLines(entries: EntryGroup[], model: LineModel): number {
  let lines = entries.length > 0 ? model.section_overhead : 0;
  for (const entry of entries) {
    lines += model.entry_overhead;
    if (entry.header) lines += estimateLines(entry.header, model);
    for (const bullet of entry.bullets) lines += estimateLines(bullet, model);
  }
  return lines;
}

export interface PageEstimate {
  lines: number;
  pages: number;
  budgetLines: number;
  /** Fraction of the one-page budget used (can exceed 1). */
  fill: number;
  overflowLines: number;
}

/** Estimate total pages against the one-page budget (SRS FR-RES-009 meter). */
export function estimatePages(totalLines: number, model: LineModel): PageEstimate {
  const budget = model.lines_per_page;
  return {
    lines: round(totalLines),
    pages: Math.max(1, Math.ceil(totalLines / budget)),
    budgetLines: budget,
    fill: round(totalLines / budget),
    overflowLines: round(Math.max(0, totalLines - budget)),
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
