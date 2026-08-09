import { describe, expect, it } from 'vitest';
import { AhoCorasick } from './aho-corasick.js';

describe('AhoCorasick (token-level)', () => {
  it('finds single- and multi-token patterns in one pass', () => {
    const ac = new AhoCorasick<string>();
    ac.add(['python'], 'Python');
    ac.add(['reinforcement', 'learning'], 'RL');
    ac.add(['node.js'], 'Node.js');
    const tokens = 'we use python and reinforcement learning with node.js'.split(' ');
    const found = ac.search(tokens).map((m) => m.meta);
    expect(found).toContain('Python');
    expect(found).toContain('RL');
    expect(found).toContain('Node.js');
  });

  it('reports correct token spans', () => {
    const ac = new AhoCorasick<string>();
    ac.add(['machine', 'learning'], 'ML');
    const m = ac.search(['i', 'do', 'machine', 'learning', 'daily']);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ start: 2, end: 3, length: 2, meta: 'ML' });
  });

  it('matches overlapping/suffix patterns via fail links', () => {
    const ac = new AhoCorasick<string>();
    ac.add(['a', 'b'], 'ab');
    ac.add(['b', 'c'], 'bc');
    const found = ac.search(['a', 'b', 'c']).map((m) => m.meta);
    expect(found).toEqual(expect.arrayContaining(['ab', 'bc']));
  });
});
