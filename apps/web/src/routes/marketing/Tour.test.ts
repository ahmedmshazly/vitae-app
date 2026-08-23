import { describe, expect, it } from 'vitest';
import { adjacentTourImages, TOUR_STOPS } from './Tour.js';

describe('TOUR_STOPS', () => {
  it('walks the seven-stop capture-to-career loop in order', () => {
    expect(TOUR_STOPS.map((s) => s.key)).toEqual([
      '01 · CAPTURE',
      '02 · RECORD',
      '03 · CONNECT',
      '04 · DECIDE',
      '05 · EVIDENCE',
      '06 · MOVE',
      '07 · KEEP',
    ]);
  });

  it('labels non-screenshot stages as workflow ledgers', () => {
    const ledgers = TOUR_STOPS.filter((stop) => stop.kind === 'ledger');
    expect(ledgers).toHaveLength(3);
    expect(ledgers.map((stop) => stop.note)).toEqual([
      expect.stringMatching(/illustrative route/i),
      expect.stringMatching(/no generated career claims/i),
      expect.stringMatching(/export/i),
    ]);
  });

  it('points every framed stop at a real landing screenshot', () => {
    for (const stop of TOUR_STOPS.filter((item) => item.kind === 'frame')) {
      expect(stop.img).toMatch(/^\/landing\/.+\.png$/);
      expect(stop.alt).toBeTruthy();
    }
  });

  it('preloads only the neighboring captures', () => {
    expect(adjacentTourImages(0)).toEqual(['/landing/form.png']);
    expect(adjacentTourImages(2)).toEqual(['/landing/form.png']);
    expect(adjacentTourImages(3)).toEqual(['/landing/graph.png']);
    expect(adjacentTourImages(6)).toEqual(['/landing/today.png']);
  });

  it('keeps the warm-path stop explicit about human judgment', () => {
    const decide = TOUR_STOPS.find((stop) => stop.key.includes('DECIDE'));
    expect(decide?.body).toMatch(/not an automatic recommendation/i);
  });
});
