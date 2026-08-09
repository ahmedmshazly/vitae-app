import { describe, expect, it } from 'vitest';
import { applyFitStep, planFitStep, type FitCandidate } from './fit-loop.js';
import type { SelectionEntry } from './selection.js';

function candidate(partial: Partial<FitCandidate> & Pick<FitCandidate, 'atomId'>): FitCandidate {
  return {
    score: 1,
    pinned: false,
    emphasis: 'technical',
    hasConcise: true,
    ...partial,
  };
}

describe('planFitStep (FR-RES-014)', () => {
  it('prefers concise-swap on the lowest-scoring atom that still has a concise variant', () => {
    const step = planFitStep([
      candidate({ atomId: 'high', score: 9, hasConcise: true }),
      candidate({ atomId: 'low', score: 2, hasConcise: true }),
      candidate({ atomId: 'mid', score: 5, hasConcise: false }),
    ]);
    expect(step).toEqual({ action: 'concise-swap', atomId: 'low' });
  });

  it('skips atoms already on concise and drops the lowest unpinned instead', () => {
    const step = planFitStep([
      candidate({ atomId: 'a', score: 1, emphasis: 'concise', hasConcise: true, pinned: true }),
      candidate({ atomId: 'b', score: 3, emphasis: 'concise', hasConcise: true }),
      candidate({ atomId: 'c', score: 4, emphasis: 'concise', hasConcise: true }),
    ]);
    expect(step).toEqual({ action: 'drop', atomId: 'b' });
  });

  it('returns null when only pinned atoms remain', () => {
    expect(
      planFitStep([
        candidate({ atomId: 'p1', score: 1, pinned: true, emphasis: 'concise', hasConcise: true }),
        candidate({ atomId: 'p2', score: 2, pinned: true, emphasis: 'concise', hasConcise: false }),
      ]),
    ).toBeNull();
  });

  it('breaks score ties by atom id for determinism', () => {
    const step = planFitStep([
      candidate({ atomId: 'z', score: 1, hasConcise: true }),
      candidate({ atomId: 'a', score: 1, hasConcise: true }),
    ]);
    expect(step).toEqual({ action: 'concise-swap', atomId: 'a' });
  });
});

describe('applyFitStep', () => {
  const entries: SelectionEntry[] = [
    { atomId: 'a', ownerId: 'r1', emphasis: 'technical', text: 'Long technical bullet.', lines: 3 },
    { atomId: 'b', ownerId: 'r1', emphasis: 'leadership', text: 'Leadership bullet.', lines: 2 },
  ];

  it('swaps wording to the concise variant', () => {
    const next = applyFitStep(entries, { action: 'concise-swap', atomId: 'a' }, new Map([
      ['a', { text: 'Short bullet.', lines: 1 }],
    ]));
    expect(next[0]).toMatchObject({ atomId: 'a', emphasis: 'concise', text: 'Short bullet.', lines: 1 });
    expect(next[1]).toEqual(entries[1]);
  });

  it('drops the chosen atom', () => {
    const next = applyFitStep(entries, { action: 'drop', atomId: 'b' }, new Map());
    expect(next.map((entry) => entry.atomId)).toEqual(['a']);
  });
});
