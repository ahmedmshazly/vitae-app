import { describe, expect, it } from 'vitest';
import { extractGmailObservation, parseMailAddresses } from './gmail.js';

describe('gmail extraction', () => {
  it('derives direction from participants across multiple self accounts', () => {
    expect(
      extractGmailObservation(
        {
          id: '1',
          from: 'Me <old@example.com>',
          to: 'Other <p@example.com>',
          sent_at: '2026-01-01T10:00:00+02:00',
        },
        ['me@example.com', 'old@example.com'],
      ).direction,
    ).toBe('out');
    expect(
      extractGmailObservation(
        { id: '2', from: 'Me <me@example.com>', to: 'Old <old@example.com>' },
        ['me@example.com', 'old@example.com'],
      ).direction,
    ).toBe('self');
  });

  it('does not turn automated or bulk messages into personal facts', () => {
    const observation = extractGmailObservation(
      {
        id: '1',
        from: 'no-reply@example.com',
        to: 'me@example.com',
        body_text: 'My phone number is +20 100 123 4567. Unsubscribe here.',
      },
      ['me@example.com'],
    );
    expect(observation.category).toBe('automated');
    expect(observation.facts).toEqual([]);
  });

  it('extracts only explicit, compactly cited facts', () => {
    const observation = extractGmailObservation(
      {
        id: '1',
        from: 'Lina <lina@example.com>',
        to: 'me@example.com',
        sent_at: '2026-02-03T10:00:00Z',
        body_text: 'For the form, my phone number is +20 100 123 4567. I am based in Cairo.',
      },
      ['me@example.com'],
    );
    expect(observation.facts.map((fact) => [fact.field, fact.value])).toEqual([
      ['props.phones', ['+20 100 123 4567']],
      ['props.city', 'Cairo'],
    ]);
    expect(observation.facts.every((fact) => fact.excerpt.length <= 160)).toBe(true);
    expect(parseMailAddresses('"Doe, Jane" <JANE@example.com>, other@example.org')).toEqual([
      { name: 'Doe, Jane', address: 'jane@example.com' },
      { name: null, address: 'other@example.org' },
    ]);
  });
});
