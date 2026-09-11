import { describe, expect, it } from 'vitest';
import { placementCopy, reasonSentence } from './model.js';

describe('reasonSentence', () => {
  it('renders a factual sentence from a reason key and does not invent a score', () => {
    expect(reasonSentence('due_within_window', { due: '2026-09-12' })).toBe(
      'Due on 2026-09-12, which is inside the urgency window.',
    );
    expect(reasonSentence('placed_by_you')).toBe('You placed this item here.');
    expect(reasonSentence('no_signal')).not.toMatch(/\d+\.\d+/);
  });

  it('reads placement copy off a task', () => {
    expect(
      placementCopy({
        id: 't1',
        title: 'Ship',
        status: 'next',
        rev: 1,
        placement: { quadrant: 'do', reason: 'due_past', params: { due: '2026-09-01' } },
      }),
    ).toBe('The due date 2026-09-01 has passed.');
  });
});
