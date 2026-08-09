import { describe, expect, it } from 'vitest';
import { resumeConfigSchema, templateSchema } from './resume.js';

describe('template gallery schema', () => {
  it('accepts curated gallery metadata from line-model.json', () => {
    const template = templateSchema.parse({
      key: 'cobalt',
      version: '1.0.0',
      name: 'Cobalt',
      engine: 'tectonic',
      ats_strict: false,
      description: 'Polished serif body with a modern colored hierarchy.',
      traits: ['balanced', 'compact', 'modern'],
      page_size: 'A4',
      accent_options: ['#2563eb', '#0f766e'],
      line_model: {
        chars_per_line: 108,
        lines_per_page: 58,
        entry_overhead: 2,
        section_overhead: 2,
      },
    });
    expect(template.accent_options).toEqual(['#2563eb', '#0f766e']);
    expect(template.traits).toContain('compact');
    expect(template.page_size).toBe('A4');
  });

  it('defaults optional gallery fields when omitted', () => {
    const template = templateSchema.parse({
      key: 'argon',
      version: '1.0.0',
      name: 'Argon',
      engine: 'tectonic',
      ats_strict: true,
      line_model: {
        chars_per_line: 88,
        lines_per_page: 40,
        entry_overhead: 2,
        section_overhead: 2,
      },
    });
    expect(template.traits).toEqual([]);
    expect(template.accent_options).toEqual([]);
    expect(template.page_size).toBe('Letter');
  });

  it('persists an optional accent on résumé config', () => {
    expect(resumeConfigSchema.parse({ accent: '#0f766e' }).accent).toBe('#0f766e');
  });
});
