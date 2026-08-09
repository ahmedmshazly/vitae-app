/**
 * One-page enforcement after compile (SRS FR-RES-014).
 *
 * Selection already budgets by line estimate; this loop reacts to the real
 * Tectonic page count. Each iteration prefers a concise-variant swap (same
 * coverage, fewer lines), then drops the lowest-scoring unpinned atom. Cap
 * three iterations; leftover overflow is handed back for manual trim.
 */
import type { SelectionEntry } from './selection.js';

export type FitAction = 'concise-swap' | 'drop';

export interface FitCandidate {
  atomId: string;
  score: number;
  pinned: boolean;
  emphasis: string;
  hasConcise: boolean;
}

export interface FitStep {
  action: FitAction;
  atomId: string;
}

export interface FitDecision {
  iteration: number;
  action: FitAction;
  atomId: string;
  pagesBefore: number;
  emphasisBefore?: string;
  emphasisAfter?: string;
}

/** Next trim step, or null when only pinned atoms remain (manual trim). */
export function planFitStep(candidates: FitCandidate[]): FitStep | null {
  const ordered = [...candidates].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.atomId.localeCompare(b.atomId);
  });

  for (const candidate of ordered) {
    if (candidate.emphasis !== 'concise' && candidate.hasConcise) {
      return { action: 'concise-swap', atomId: candidate.atomId };
    }
  }

  for (const candidate of ordered) {
    if (!candidate.pinned) {
      return { action: 'drop', atomId: candidate.atomId };
    }
  }

  return null;
}

export function applyFitStep(
  entries: SelectionEntry[],
  step: FitStep,
  conciseByAtom: Map<string, Pick<SelectionEntry, 'text' | 'lines'>>,
): SelectionEntry[] {
  if (step.action === 'drop') {
    return entries.filter((entry) => entry.atomId !== step.atomId);
  }
  const concise = conciseByAtom.get(step.atomId);
  if (!concise) return entries;
  return entries.map((entry) =>
    entry.atomId === step.atomId
      ? { ...entry, emphasis: 'concise', text: concise.text, lines: concise.lines }
      : entry,
  );
}
