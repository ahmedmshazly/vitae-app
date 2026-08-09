import { describe, expect, it } from 'vitest';
import { findIntroPaths, type PathGraphEdge, type PathGraphNode } from './graph-paths.js';

const nodes: PathGraphNode[] = [
  { id: 'me', type: 'person', title: 'You' },
  { id: 'sarah', type: 'person', title: 'Sarah' },
  { id: 'omar', type: 'person', title: 'Omar' },
  { id: 'yara', type: 'person', title: 'Yara' },
  { id: 'role1', type: 'role', title: 'Staff SWE' },
  { id: 'role2', type: 'role', title: 'Product Lead' },
  { id: 'nile', type: 'organization', title: 'Nile Robotics' },
  { id: 'zap', type: 'organization', title: 'Zap Robotics' },
];

const edges: PathGraphEdge[] = [
  { src: 'me', dst: 'sarah', type: 'KNOWS', strength: 0.74 },
  { src: 'me', dst: 'omar', type: 'KNOWS', strength: 0.61 },
  { src: 'me', dst: 'yara', type: 'KNOWS', strength: 0.28 },
  { src: 'omar', dst: 'yara', type: 'KNOWS', strength: 0.7 },
  { src: 'sarah', dst: 'role1', type: 'HELD' },
  { src: 'role1', dst: 'nile', type: 'ROLE_AT' },
  { src: 'yara', dst: 'role2', type: 'HELD' },
  { src: 'role2', dst: 'zap', type: 'ROLE_AT' },
];

describe('findIntroPaths', () => {
  it('finds the direct affiliation path', () => {
    const paths = findIntroPaths(nodes, edges, 'me', 'nile');
    expect(paths.length).toBeGreaterThan(0);
    const best = paths[0]!;
    expect(best.hops.map((h) => h.nodeId)).toEqual(['me', 'sarah', 'nile']);
    expect(best.score).toBeCloseTo(0.74 * 0.9, 5);
  });

  it('ranks a strong 2-hop path above a weak direct one', () => {
    const paths = findIntroPaths(nodes, edges, 'me', 'zap');
    // via Omar→Yara: 0.61·0.7·0.9 = 0.384 > direct Yara: 0.28·0.9 = 0.252
    expect(paths[0]!.hops.map((h) => h.nodeId)).toEqual(['me', 'omar', 'yara', 'zap']);
    expect(paths[1]!.hops.map((h) => h.nodeId)).toEqual(['me', 'yara', 'zap']);
  });

  it('is deterministic', () => {
    const a = findIntroPaths(nodes, edges, 'me', 'zap');
    const b = findIntroPaths(nodes, [...edges].reverse(), 'me', 'zap');
    expect(a.map((p) => p.hops.map((h) => h.nodeId).join('>'))).toEqual(
      b.map((p) => p.hops.map((h) => h.nodeId).join('>')),
    );
  });

  it('respects maxHops', () => {
    const paths = findIntroPaths(nodes, edges, 'me', 'zap', { maxHops: 1 });
    expect(paths.every((p) => p.hops.length <= 3)).toBe(true);
  });

  it('returns empty for unknown target', () => {
    expect(findIntroPaths(nodes, edges, 'me', 'nowhere')).toEqual([]);
  });
});
