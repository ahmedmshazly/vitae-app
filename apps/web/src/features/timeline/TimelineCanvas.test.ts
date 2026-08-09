import { describe, expect, it } from 'vitest';
import { itemLabel } from './TimelineCanvas.js';
import type { TimelineItem } from './types.js';

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'i1',
  type: 'role',
  title: 'Senior ML Engineer',
  subtitle: 'Nile Robotics',
  start: '2021-03-01',
  end: null,
  current: false,
  kind: 'span',
  ...over,
});

describe('itemLabel', () => {
  // A timeline exists to say *when*. The dates lived only in a `title`
  // attribute, so the one thing the screen is for was the one thing a screen
  // reader never heard, the accessible name was just the title text.
  it('states when, not only what', () => {
    expect(itemLabel(item({ end: '2023-06-01' }))).toBe(
      'Senior ML Engineer · Nile Robotics · 2021-03-01 to 2023-06-01',
    );
  });

  it('says an open span runs to now rather than leaving it dangling', () => {
    expect(itemLabel(item({ current: true }))).toBe('Senior ML Engineer · Nile Robotics · 2021-03-01 to now');
  });

  it('gives a moment its single date', () => {
    expect(itemLabel(item({ kind: 'moment', subtitle: null, title: 'DevFest Cairo', start: '2025-11-02' }))).toBe(
      'DevFest Cairo · 2025-11-02',
    );
  });

  // An end date wins over `current`: a span that has finished is not ongoing,
  // whatever a stale flag says.
  it('prefers a real end date to the current flag', () => {
    expect(itemLabel(item({ end: '2023-06-01', current: true }))).toContain('to 2023-06-01');
  });

  it('omits a missing subtitle instead of leaving an empty separator', () => {
    expect(itemLabel(item({ subtitle: null, end: '2023-06-01' }))).toBe(
      'Senior ML Engineer · 2021-03-01 to 2023-06-01',
    );
  });
});
