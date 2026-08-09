import { NODE_TYPES } from '@vitae/core';
import { describe, expect, it } from 'vitest';
import { COLLECTION_TILE_GROUPS } from './Collections.js';

describe('Collections tile coverage', () => {
  it('exposes every NODE_TYPES entry (same catalog as + New)', () => {
    const tileTypes = COLLECTION_TILE_GROUPS.flatMap((group) => group.types);
    expect([...tileTypes].sort()).toEqual([...NODE_TYPES].sort());
  });
});
