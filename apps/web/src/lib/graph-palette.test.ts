import { describe, expect, it } from 'vitest';
import { withAlpha } from './graph-palette.js';

describe('withAlpha', () => {
  // The canvas draw calls used to carry literals, rgba(46, 42, 36, 0.18) for a
  // dimmed link, rgba(16, 15, 13, 0.78) for a label plate. Both are warm greys
  // from the previous palette; the Quiet ground is neutral. Tokens are hex, so
  // making one translucent for a canvas call has to happen in JS.
  it('makes a hex token translucent', () => {
    expect(withAlpha('#2b2b2b', 0.35)).toBe('rgba(43, 43, 43, 0.35)');
    expect(withAlpha('#0f0f0f', 0.78)).toBe('rgba(15, 15, 15, 0.78)');
  });

  it('tolerates the whitespace getPropertyValue hands back', () => {
    expect(withAlpha('  #ffffff ', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('is case-insensitive about the hex', () => {
    expect(withAlpha('#AABBCC', 0.5)).toBe('rgba(170, 187, 204, 0.5)');
  });

  // A malformed colour must not become an invalid rgba() string: canvas throws
  // nothing for a bad fillStyle, it silently keeps the previous one, which is
  // the hardest kind of drawing bug to see.
  it('hands back anything it cannot parse rather than mangling it', () => {
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)');
    expect(withAlpha('#abc', 0.5)).toBe('#abc');
    expect(withAlpha('', 0.5)).toBe('');
  });

  it('keeps the channels independent, a token is not a greyscale assumption', () => {
    expect(withAlpha('#1f9c86', 0.4)).toBe('rgba(31, 156, 134, 0.4)');
  });
});
