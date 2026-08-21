import { describe, expect, it } from 'vitest';
import { accentLabel, accentName, DEFAULT_ACCENT, RESUME_ACCENTS } from './accent-palette.js';

describe('accentName', () => {
  it('names every accent the product ships', () => {
    for (const accent of RESUME_ACCENTS) {
      expect(accentName(accent.value)).toBe(accent.name);
    }
  });

  it('matches regardless of hex casing', () => {
    expect(accentName('#2563EB')).toBe('Cobalt');
  });

  it('falls back to the hex for a palette a template declared', () => {
    expect(accentName('#abcdef')).toBe('#abcdef');
  });
});

describe('accentLabel', () => {
  it('reads as an instruction, not a colour code', () => {
    expect(accentLabel('#0f766e')).toBe('Use Teal accent');
    expect(accentLabel('#abcdef')).toBe('Use #abcdef accent');
  });
});

describe('DEFAULT_ACCENT', () => {
  it('is one of the shipped accents', () => {
    expect(RESUME_ACCENTS.some((a) => a.value === DEFAULT_ACCENT)).toBe(true);
  });
});
