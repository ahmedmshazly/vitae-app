import { describe, expect, it } from 'vitest';
import { jaroWinkler, ngrams, normalizeForMatch, stem, tokenize, trigramSimilarity } from './text.js';

describe('normalizeForMatch', () => {
  it('lowercases and preserves technical characters', () => {
    expect(normalizeForMatch('C++ and C# on .NET, Node.js!')).toBe('c++ and c# on .net node.js');
  });
  it('collapses whitespace', () => {
    expect(normalizeForMatch('a   b\t c')).toBe('a b c');
  });
});

describe('tokenize', () => {
  it('keeps technical tokens intact', () => {
    expect(tokenize('React, gRPC & C++')).toEqual(['react', 'grpc', 'c++']);
  });
});

describe('ngrams', () => {
  it('produces contiguous n-grams', () => {
    expect(ngrams(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c', 'a b', 'b c']);
  });
});

describe('stem', () => {
  it('reduces common suffixes', () => {
    expect(stem('running')).toBe('runn');
    expect(stem('deployed')).toBe('deploy');
    expect(stem('services')).toBe('service');
  });
  it('leaves short words alone', () => {
    expect(stem('go')).toBe('go');
  });
  it('returns a stable stem when suffix rules overlap', () => {
    expect(stem('aaasly')).toBe('aaa');
    expect(stem(stem('aaasly'))).toBe('aaa');
  });
});

describe('trigramSimilarity', () => {
  it('is 1 for identical strings', () => {
    expect(trigramSimilarity('sarah chen', 'sarah chen')).toBe(1);
  });
  it('is high for near-duplicates and low for unrelated', () => {
    expect(trigramSimilarity('sarah chen', 'sara chen')).toBeGreaterThan(0.6);
    expect(trigramSimilarity('sarah chen', 'omar khaled')).toBeLessThan(0.2);
  });
});

describe('jaroWinkler', () => {
  it('rewards common prefixes', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9);
    expect(jaroWinkler('sarah', 'sara')).toBeGreaterThan(0.9);
  });
  it('is 1 for equal and 0 for disjoint', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });
});
