import { describe, expect, it } from 'vitest';
import { MANIFESTO_HOLDINGS } from './Manifesto.js';

describe('MANIFESTO_HOLDINGS', () => {
  it('names four non-negotiable holdings', () => {
    expect(MANIFESTO_HOLDINGS).toHaveLength(4);
    expect(MANIFESTO_HOLDINGS.map((h) => h.title)).toEqual([
      'The record remains yours.',
      'Every conclusion needs a trail.',
      'Your professional history is not generated.',
      'Attention is not the business model.',
    ]);
  });

  it('promises export without lock-in theatre', () => {
    const data = MANIFESTO_HOLDINGS.find((h) => h.title.startsWith('The record'));
    expect(data!.body).toMatch(/full export/i);
    expect(data!.body).toMatch(/archive/i);
  });

  it('keeps career claims out of runtime AI', () => {
    const career = MANIFESTO_HOLDINGS.find((h) => h.title.startsWith('Your professional'));
    expect(career!.body).toMatch(/deterministic/i);
    expect(career!.body).toMatch(/runtime AI provider/i);
  });

  it('keeps attention extraction outside the business model', () => {
    const attention = MANIFESTO_HOLDINGS.find((h) => h.title.startsWith('Attention'));
    expect(attention!.body).toMatch(/no public feed/i);
    expect(attention!.body).toMatch(/behavioral advertising/i);
  });
});
