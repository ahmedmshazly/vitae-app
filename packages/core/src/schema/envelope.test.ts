import { describe, expect, it } from 'vitest';
import { identityKey, nodeCreateEnvelope, nodeUpdateEnvelope } from './envelope.js';

describe('identityKey', () => {
  it('lowercases a well-formed external identity', () => {
    expect(identityKey.parse('LinkedIn:Person:JSmith')).toBe('linkedin:person:jsmith');
  });

  it('rejects keys that are missing a segment', () => {
    expect(() => identityKey.parse('linkedin:jsmith')).toThrow(/expected/);
  });
});

describe('nodeCreateEnvelope', () => {
  it('applies defaults for optional envelope fields', () => {
    const parsed = nodeCreateEnvelope.parse({ type: 'person', title: 'Ada' });
    expect(parsed.props).toEqual({});
    expect(parsed.date_precision).toBe('day');
    expect(parsed.pinned).toBe(false);
    expect(parsed.sensitivity).toBe('normal');
    expect(parsed.source).toBe('manual');
    expect(parsed.confidence).toBe(1);
  });

  it('rejects non-ISO start dates', () => {
    const r = nodeCreateEnvelope.safeParse({
      type: 'person',
      title: 'Ada',
      start_date: '01/02/2024',
    });
    expect(r.success).toBe(false);
  });
});

describe('nodeUpdateEnvelope', () => {
  it('omits type so clients cannot change it', () => {
    const parsed = nodeUpdateEnvelope.parse({ title: 'Renamed', type: 'role' });
    expect(parsed).toEqual({ title: 'Renamed' });
    expect('type' in parsed).toBe(false);
  });
});
