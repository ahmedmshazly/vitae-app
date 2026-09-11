import { describe, expect, it } from 'vitest';
import { dependsOnCycle } from './dependencies.js';

describe('dependsOnCycle', () => {
  it('detects a 3-cycle', () => {
    expect(
      dependsOnCycle([
        { src: 'a', dst: 'b' },
        { src: 'b', dst: 'c' },
        { src: 'c', dst: 'a' },
      ]),
    ).toBe(true);
  });

  it('accepts a DAG', () => {
    expect(
      dependsOnCycle([
        { src: 'a', dst: 'b' },
        { src: 'b', dst: 'c' },
        { src: 'a', dst: 'c' },
      ]),
    ).toBe(false);
  });

  it('treats a self-loop as a cycle and an empty graph as a DAG', () => {
    expect(dependsOnCycle([{ src: 'a', dst: 'a' }])).toBe(true);
    expect(dependsOnCycle([])).toBe(false);
  });
});
