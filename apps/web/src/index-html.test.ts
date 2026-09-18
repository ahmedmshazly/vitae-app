/**
 * The HTML shell must not pin Quiet dark. ThemeProvider writes data-theme
 * after mount; first paint and no-JS documents follow CSS :root / system
 * fallbacks. A static data-theme="dark" made those fallbacks unreachable.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');

describe('apps/web/index.html identity shell', () => {
  it('does not pin a theme on <html>, so CSS fallbacks and ThemeProvider own it', () => {
    expect(html).not.toMatch(/<html\b[^>]*\bdata-theme=/);
  });

  it('uses the light --bg as theme-color, not Quiet canvas', () => {
    expect(html).toMatch(/name="theme-color" content="#f7f4ed"/);
    expect(html).not.toMatch(/theme-color" content="#0F0F0F"/i);
  });

  it('does not claim fonts still come from @fontsource', () => {
    expect(html).not.toMatch(/@fontsource/);
  });
});
