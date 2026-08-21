import { describe, expect, it } from 'vitest';
import { EDGE_TYPES, NODE_TYPES, SOURCE_TYPES } from '@vitae/core';
import { LANDING_FACTS } from './Landing.js';

describe('LANDING_FACTS', () => {
  it('keeps the four product facts for the post-hero strip', () => {
    expect(LANDING_FACTS).toHaveLength(4);
    expect(LANDING_FACTS.map((f) => f.num)).toEqual([
      String(NODE_TYPES.length),
      String(EDGE_TYPES.length),
      String(SOURCE_TYPES.length),
      '0',
    ]);
  });

  it('keeps the runtime-AI boundary explicit', () => {
    expect(LANDING_FACTS.at(-1)).toEqual({ num: '0', label: 'runtime AI calls' });
  });
});
