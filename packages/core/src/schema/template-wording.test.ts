import { describe, expect, it } from 'vitest';
import { resumeConfigSchema } from './resume.js';

describe('resumeConfig wording fields', () => {
  it('defaults variant_by_atom and accepts per-atom emphasis overrides', () => {
    const parsed = resumeConfigSchema.parse({
      accent: '#0f766e',
      emphasis: 'technical',
      variant_by_atom: { atom_1: 'leadership' },
    });
    expect(parsed.accent).toBe('#0f766e');
    expect(parsed.emphasis).toBe('technical');
    expect(parsed.variant_by_atom).toEqual({ atom_1: 'leadership' });
  });

  it('rejects unknown per-atom emphasis values', () => {
    expect(() =>
      resumeConfigSchema.parse({
        variant_by_atom: { atom_1: 'poetic' },
      }),
    ).toThrow();
  });
});
