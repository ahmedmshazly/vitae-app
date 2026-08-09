import { describe, expect, it } from 'vitest';
import { calibrationSummary, type Template } from './Templates.js';

const template = (over: Partial<Template> = {}): Template => ({
  key: 'cobalt',
  name: 'Cobalt',
  version: '1.0.0',
  ats_strict: false,
  traits: [],
  page_size: 'A4',
  accent_options: ['#2563eb'],
  line_model: { chars_per_line: 108, lines_per_page: 58, entry_overhead: 2, section_overhead: 2 },
  ...over,
});

describe('calibrationSummary', () => {
  it('only calls the catalogue calibrated when every listed version was warmed', () => {
    const templates = [template(), template({ key: 'onyx', name: 'Onyx' })];

    expect(
      calibrationSummary(templates, {
        ok: true,
        templates_warmed: ['cobalt@1.0.0', 'onyx@1.0.0'],
        calibrated_at: '2026-08-09T12:00:00.000Z',
      }),
    ).toEqual({
      state: 'ready',
      label: 'Calibrated',
      title: 'All 2 layouts calibrated',
      detail: 'Last verified 2026-08-09.',
    });
  });

  // `healthz.ok` means Tectonic and at least one warm fixture, not that every
  // template has been checked. This was the screen's headline false claim.
  it('reports a partial warmup instead of calling it ready', () => {
    const templates = [template(), template({ key: 'onyx', name: 'Onyx' })];
    const result = calibrationSummary(templates, {
      ok: true,
      templates_warmed: ['cobalt@1.0.0', 'removed-layout@1.0.0'],
    });

    expect(result).toMatchObject({
      state: 'partial',
      label: '1 of 2',
      title: '1 of 2 layouts calibrated',
    });
  });

  it('does not count a warm manifest entry for the wrong template version', () => {
    const result = calibrationSummary([template({ version: '2.0.0' })], {
      ok: true,
      templates_warmed: ['cobalt@1.0.0'],
    });

    expect(result.state).toBe('partial');
    expect(result.label).toBe('0 of 1');
  });

  it('names an offline service rather than leaving it in a perpetual checking state', () => {
    expect(calibrationSummary([template()], { ok: false })).toMatchObject({
      state: 'unavailable',
      label: 'Unavailable',
      title: 'Build service unavailable',
    });
  });

  it('keeps an empty catalogue distinct from build-service availability', () => {
    expect(calibrationSummary([], { ok: true, templates_warmed: ['cobalt@1.0.0'] })).toMatchObject({
      state: 'unavailable',
      label: 'No layouts',
      title: 'No layouts available',
    });
  });
});
