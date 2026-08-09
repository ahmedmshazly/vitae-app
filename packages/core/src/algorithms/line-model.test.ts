import { describe, expect, it } from 'vitest';
import { estimateLines, estimatePages, estimateSectionLines } from './line-model.js';
import type { LineModel } from '../schema/resume.js';

const ONYX: LineModel = {
  chars_per_line: 96,
  lines_per_page: 54,
  entry_overhead: 2,
  section_overhead: 2,
};

describe('line-model (SRS §6.6, FR-RES-009)', () => {
  it('estimates wrapped lines by character count', () => {
    expect(estimateLines('a'.repeat(96), ONYX)).toBe(1);
    expect(estimateLines('a'.repeat(97), ONYX)).toBe(2);
    expect(estimateLines('', ONYX)).toBe(0);
  });

  it('adds section and entry overheads', () => {
    const lines = estimateSectionLines(
      [{ header: 'Role, Org  2020-2024', bullets: ['short bullet', 'another'] }],
      ONYX,
    );
    // section_overhead(2) + entry_overhead(2) + header(1) + 2 bullets(1+1) = 7
    expect(lines).toBe(7);
  });

  it('computes page fill and overflow against the budget', () => {
    const under = estimatePages(40, ONYX);
    expect(under.pages).toBe(1);
    expect(under.overflowLines).toBe(0);
    const over = estimatePages(60, ONYX);
    expect(over.pages).toBe(2);
    expect(over.overflowLines).toBe(6);
    expect(over.fill).toBeCloseTo(60 / 54, 2);
  });
});
