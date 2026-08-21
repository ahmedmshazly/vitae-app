import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'network.css'), 'utf8');

describe('Network screen-family stylesheet', () => {
  it('ships dossier, intelligence-lens, contact-ranking, and path primitives', () => {
    for (const selector of [
      '.network-dossier__facts',
      '.network-lenses__item',
      '.network-result__detail',
      '.network-factor-evidence',
      '.network-target',
      '.network-path__connector',
    ]) {
      expect(css).toContain(selector);
    }
  });

  it('adapts the relationship evidence for narrow and touch screens', () => {
    expect(css).toContain('@media (max-width: 680px)');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('flex-direction: column');
    expect(css).toContain('min-height: var(--ae-hit-target)');
  });

  it('removes local transitions for reduced-motion users', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none');
  });
});
