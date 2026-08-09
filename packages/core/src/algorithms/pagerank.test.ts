import { describe, expect, it } from 'vitest';
import { personalizedPageRank } from './pagerank.js';

describe('personalizedPageRank (SRS §10.7.3)', () => {
  it('converges to a probability distribution summing to ~1', () => {
    const nodes = ['self', 'a', 'b', 'c'];
    const edges = [
      { src: 'self', dst: 'a', type: 'KNOWS' },
      { src: 'a', dst: 'self', type: 'KNOWS' },
      { src: 'a', dst: 'b', type: 'WORKED_ON' },
      { src: 'b', dst: 'c', type: 'ATTENDED' },
    ];
    const r = personalizedPageRank(nodes, edges, { self: 1 });
    const total = [...r.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('ranks nodes closer to the seed higher', () => {
    const nodes = ['self', 'near', 'far'];
    const edges = [
      { src: 'self', dst: 'near', type: 'KNOWS' },
      { src: 'near', dst: 'self', type: 'KNOWS' },
      { src: 'near', dst: 'far', type: 'ATTENDED' },
      { src: 'far', dst: 'near', type: 'ATTENDED' },
    ];
    const r = personalizedPageRank(nodes, edges, { self: 1 });
    expect(r.get('near')!).toBeGreaterThan(r.get('far')!);
  });

  it('weights stronger edge types as better conduits', () => {
    const nodes = ['self', 'viaKnows', 'viaAbout'];
    const edges = [
      { src: 'self', dst: 'viaKnows', type: 'KNOWS' },
      { src: 'self', dst: 'viaAbout', type: 'ABOUT' },
    ];
    const r = personalizedPageRank(nodes, edges, { self: 1 });
    expect(r.get('viaKnows')!).toBeGreaterThan(r.get('viaAbout')!);
  });

  it('handles empty graphs and dangling nodes', () => {
    expect(personalizedPageRank([], [], {}).size).toBe(0);
    const r = personalizedPageRank(['self', 'sink'], [{ src: 'self', dst: 'sink', type: 'KNOWS' }], {
      self: 1,
    });
    const total = [...r.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 3);
  });
});
