/**
 * theme.css must keep the Quiet Tailwind names as var() aliases. Hundreds of
 * className call sites still spell text-muted / text-sm / bg-canvas; dropping
 * the keys makes those utilities resolve to body colour or Tailwind defaults.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8');

function themeValue(name: string): string | undefined {
  const m = css.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`));
  return m?.[1]?.replace(/\s+/g, ' ').trim();
}

describe('Quiet Tailwind bridge', () => {
  it.each([
    ['--color-muted', 'var(--ae-muted)'],
    ['--color-faint', 'var(--ae-faint)'],
    ['--color-canvas', 'var(--ae-bg)'],
    ['--color-success', 'var(--ae-success)'],
    ['--text-xs', 'var(--ae-text-xs)'],
    ['--text-sm', 'var(--ae-text-sm)'],
    ['--text-base', 'var(--ae-text-base)'],
    ['--text-4xl', 'var(--ae-text-4xl)'],
    ['--ease-quiet', 'var(--ae-ease)'],
  ] as const)('aliases %s through the compatibility token', (name, value) => {
    expect(themeValue(name)).toBe(value);
  });

  it('keeps the Fourfold keys alongside the bridge', () => {
    expect(themeValue('--color-ground')).toBe('var(--bg)');
    expect(themeValue('--text-hero')).toBe('var(--t-hero)');
    expect(themeValue('--color-deleg')).toBe('var(--deleg)');
  });
});
