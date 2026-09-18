/**
 * The documentation screen has no Print button: browser print is the control.
 * These assertions protect the semantics the print medium supplies, where a
 * reader has no navigation, hover state, or horizontal scroll recovery.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const printCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../styles/docs-print.css'),
  'utf8',
);

describe('documentation print contract', () => {
  it('removes screen-only navigation while retaining the article and its provenance rail', () => {
    expect(printCss).toContain('@media print');
    expect(printCss).toMatch(/\.docs-masthead,[\s\S]*?\.docs-nav,[\s\S]*?display: none !important/);
    expect(printCss).toContain('.docs-rail');
    expect(printCss).toContain('break-inside: avoid');
  });

  it('prints link destinations and prevents code or tables from silently clipping', () => {
    expect(printCss).toContain("content: ' (' attr(href) ')'");
    expect(printCss).toMatch(
      /\.docs-code,[\s\S]*?\.docs-table[\s\S]*?overflow: visible !important/,
    );
    expect(printCss).toContain('white-space: pre-wrap');
    expect(printCss).toContain('overflow-wrap: anywhere');
  });
});
