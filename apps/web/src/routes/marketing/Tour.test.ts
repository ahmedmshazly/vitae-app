import { describe, expect, it } from 'vitest';
import { TOUR_STOPS } from './Tour.js';

describe('TOUR_STOPS', () => {
  it('walks five product surfaces in order', () => {
    expect(TOUR_STOPS.map((s) => s.key)).toEqual([
      '01 · CAPTURE',
      '02 · TODAY',
      '03 · PEOPLE',
      '04 · GRAPH',
      '05 · DEPTH',
    ]);
  });

  it('describes Today momentum as a score, not a ring or flame theatre', () => {
    const today = TOUR_STOPS.find((s) => s.key.includes('TODAY'));
    expect(today).toBeDefined();
    expect(today!.body).toMatch(/momentum score/i);
    expect(today!.body).not.toMatch(/momentum ring/i);
    expect(today!.body).not.toMatch(/flame/i);
    expect(today!.alt).toMatch(/momentum score/i);
  });

  it('points each stop at a real landing screenshot', () => {
    for (const stop of TOUR_STOPS) {
      expect(stop.img).toMatch(/^\/landing\/.+\.png$/);
    }
  });
});
