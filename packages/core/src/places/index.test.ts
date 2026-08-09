import { describe, expect, it } from 'vitest';
import {
  fuzzyPlaceMatches,
  lookupBuiltinCity,
  normalizePlaceKey,
  STATIC_PLACE_ALIASES,
} from './index.js';

describe('normalizePlaceKey', () => {
  it('collapses whitespace, case, and diacritics', () => {
    expect(normalizePlaceKey('  Asyūt  ')).toBe('asyut');
    expect(normalizePlaceKey('Al-Qāhirah')).toBe('al qahirah');
    expect(normalizePlaceKey('São Paulo')).toBe('sao paulo');
  });
});

describe('STATIC_PLACE_ALIASES', () => {
  it('maps Egypt transliterations to a shared canonical key', () => {
    expect(STATIC_PLACE_ALIASES.assiut).toBe('asyut');
    expect(STATIC_PLACE_ALIASES.assyout).toBe('asyut');
    expect(STATIC_PLACE_ALIASES['al qahirah']).toBe('cairo');
  });

  it('resolves Assiut and Asyut to the same builtin coords', () => {
    const a = lookupBuiltinCity('Assiut');
    const b = lookupBuiltinCity('Asyut');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).toEqual(b);
  });
});

describe('fuzzyPlaceMatches', () => {
  it('suggests near-duplicate labels', () => {
    const hits = fuzzyPlaceMatches('Assiut', [
      { key: 'asyut', label: 'Asyut' },
      { key: 'cairo', label: 'Cairo' },
    ]);
    expect(hits[0]?.label).toBe('Asyut');
    expect(hits.some((h) => h.label === 'Cairo')).toBe(false);
  });
});
