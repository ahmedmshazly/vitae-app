import { describe, expect, it } from 'vitest';
import { LANDING_FACTS } from './Landing.js';

describe('LANDING_FACTS', () => {
  it('keeps the four product facts for the post-hero strip', () => {
    expect(LANDING_FACTS).toHaveLength(4);
    expect(LANDING_FACTS.map((f) => f.num)).toEqual(['28', '18', '1', '0']);
  });

  it('never claims lock-in', () => {
    expect(LANDING_FACTS.some((f) => /lock-in/i.test(f.label))).toBe(true);
  });
});
