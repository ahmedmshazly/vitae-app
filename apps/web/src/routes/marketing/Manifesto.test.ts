import { describe, expect, it } from 'vitest';
import { MANIFESTO_HOLDINGS } from './Manifesto.js';

describe('MANIFESTO_HOLDINGS', () => {
  it('names four non-negotiable holdings', () => {
    expect(MANIFESTO_HOLDINGS).toHaveLength(4);
    expect(MANIFESTO_HOLDINGS.map((h) => h.title)).toEqual([
      'The data is yours.',
      'Provenance on every fact.',
      'Scores you can decompose.',
      'Keyboard first, dark, calm.',
    ]);
  });

  it('promises export without lock-in theatre', () => {
    const data = MANIFESTO_HOLDINGS.find((h) => h.title.startsWith('The data'));
    expect(data!.body).toMatch(/full export/i);
    expect(data!.body).toMatch(/no gates/i);
  });

  it('keeps ranking decomposable: no oracle copy', () => {
    const scores = MANIFESTO_HOLDINGS.find((h) => h.title.startsWith('Scores'));
    expect(scores!.body).toMatch(/re-weight/i);
    expect(scores!.body).toMatch(/no oracle/i);
  });

  it('does not promise a multi-account product outside the system boundary', () => {
    expect(JSON.stringify(MANIFESTO_HOLDINGS)).not.toMatch(/multi-account/i);
  });
});
