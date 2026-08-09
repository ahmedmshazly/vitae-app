import { describe, expect, it } from 'vitest';
import { hashStr, linkEndId, type FgNode } from './types.js';

describe('linkEndId', () => {
  it('returns a string end unchanged and reads id from a node', () => {
    expect(linkEndId('n1')).toBe('n1');
    const node = { id: 'n2', title: 'Ada', type: 'person' } as FgNode;
    expect(linkEndId(node)).toBe('n2');
  });
});

describe('hashStr', () => {
  it('is stable for the same input', () => {
    expect(hashStr('vitae')).toBe(hashStr('vitae'));
    expect(hashStr('a')).not.toBe(hashStr('b'));
  });
});
