/**
 * The atlas overview sheet: the ids it has to keep unique while two copies of
 * it are mounted at once, and the literal ink an exported SVG carries once it
 * has left the app's stylesheet behind.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EntityCatalogOverview,
  OVERVIEW_INK,
  OVERVIEW_SVG_EXPORT_STYLE,
} from './EntityCatalogOverview.js';

const SHEET_NAME = /complete entity and relation map/i;

/* The design system's own file, read as text: an assertion against a second
   copy of the token table would only prove the copy agrees with itself.
   Vitest stubs a CSS import to an empty string, and Vite rewrites
   `new URL(literal, import.meta.url)` into an asset URL, so this is the one
   way to reach the real declarations. */
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = readFileSync(join(HERE, '../../../../../packages/ui/src/styles/tokens.css'), 'utf8');

/**
 * What one custom property finally resolves to, following `var()` hops.
 *
 * The `--ae-*` names are compatibility aliases now: each is declared as a
 * `var()` onto one of the new tokens, so reading a single declaration finds
 * the string `var(--bg)` where this test wants `#f7f4ed`. Only the light
 * theme's `:root` values are followed, which is the theme the exported sheet
 * is pinned to; `TOKENS.match` finds the first declaration in the file and the
 * light block is first by construction.
 */
function tokenValue(name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) return `(${name} loops through ${current})`;
    seen.add(current);
    const match = TOKENS.match(new RegExp(`${current}:\\s*([^;]+);`));
    if (!match) return `(${current} is not declared)`;
    const value = match[1].trim();
    const hop = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!hop) return value;
    current = hop[1];
  }
}

function idsWithin(sheet: Element): string[] {
  return Array.from(sheet.querySelectorAll('[id]')).map((node) => node.id);
}

describe('EntityCatalogOverview states', () => {
  it('holds every exported colour equal to the token it claims to mirror', () => {
    for (const [token, literal] of Object.entries(OVERVIEW_INK)) {
      expect(`${token}: ${literal}`).toBe(`${token}: ${tokenValue(token)}`);
    }
  });

  it('paints the standalone stylesheet only from those colours', () => {
    const declared = new Set(Object.values(OVERVIEW_INK).map((value) => value.toLowerCase()));
    const used = OVERVIEW_SVG_EXPORT_STYLE.match(/#[0-9a-f]{3,8}\b/gi) ?? [];

    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect([...declared]).toContain(hex.toLowerCase());
  });

  it('keeps element ids out of the standalone stylesheet, because they move per instance', () => {
    expect(OVERVIEW_SVG_EXPORT_STYLE).not.toContain('url(#');
    expect(OVERVIEW_SVG_EXPORT_STYLE).not.toContain('#ec-');
  });

  it('gives two copies on one page their own ids and their own wildcard pattern', () => {
    render(
      <>
        <EntityCatalogOverview />
        <EntityCatalogOverview />
      </>,
    );

    const sheets = screen.getAllByRole('img', { name: SHEET_NAME });
    expect(sheets).toHaveLength(2);

    const patternIds = sheets.map((sheet) => {
      const pattern = sheet.querySelector('pattern');
      const wildcard = sheet.querySelector('path[fill^="url("]');
      expect(pattern?.id).toBeTruthy();
      // The node resolves its hatch through the pattern in its own subtree,
      // not through whichever copy happens to have mounted first.
      expect(wildcard?.getAttribute('fill')).toBe(`url(#${pattern?.id})`);
      return pattern?.id;
    });

    expect(patternIds[0]).not.toBe(patternIds[1]);

    const allIds = sheets.flatMap(idsWithin);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('lets a caller name the id space when it needs a stable one', () => {
    render(<EntityCatalogOverview idPrefix="ec-print" />);
    const sheet = screen.getByRole('img', { name: SHEET_NAME });
    expect(sheet.querySelector('pattern')?.id).toBe('ec-print-any-pattern');
    expect(idsWithin(sheet)).toEqual(
      expect.arrayContaining(['ec-print-title', 'ec-print-desc', 'ec-print-any-pattern']),
    );
  });

  it('sends a reader after exact endpoints to the sheet that lists them', () => {
    render(<EntityCatalogOverview />);
    expect(screen.getByRole('img', { name: /canonical\s+relation\s+matrix/i })).toBeInTheDocument();
  });
});
