import { describe, expect, it } from 'vitest';
import {
  canonicalCountryCode,
  canonicalOrganizationName,
  canonicalPersonName,
  compareEntities,
  comparePersons,
  scorePair,
} from './dedup.js';

describe('Fellegi-Sunter dedup (SRS §10.7.6)', () => {
  it('an exact email match is a probable duplicate', () => {
    const comps = comparePersons(
      { title: 'Sarah Chen', emails: ['sarah@nile.com'] },
      { title: 'Sara Chen', emails: ['sarah@nile.com'] },
    );
    const r = scorePair(comps);
    expect(r.verdict).toBe('probable');
    expect(r.weight).toBeGreaterThan(10);
  });

  it('similar names + shared org queue as possible/probable, not auto-merge', () => {
    const comps = comparePersons(
      { title: 'Sarah Chen', orgDomains: ['nile.com'] },
      { title: 'Sara Chen', orgDomains: ['nile.com'] },
    );
    const r = scorePair(comps);
    expect(['possible', 'probable']).toContain(r.verdict);
  });

  it('unrelated people are a non-match', () => {
    const comps = comparePersons(
      { title: 'Sarah Chen', emails: ['sarah@a.com'] },
      { title: 'Omar Khaled', emails: ['omar@b.com'] },
    );
    expect(scorePair(comps).verdict).toBe('non_match');
  });

  it('missing fields contribute zero weight (missing-at-random)', () => {
    const comps = comparePersons({ title: 'Sarah Chen' }, { title: 'Sarah Chen' });
    const emailWeight = scorePair(comps).breakdown.find((b) => b.field === 'email')!;
    expect(emailWeight.weight).toBe(0);
  });

  it('breakdown weights sum to the total (explainable evidence)', () => {
    const comps = comparePersons(
      { title: 'Sarah Chen', emails: ['s@x.com'], orgDomains: ['x.com'] },
      { title: 'Sarah Chen', emails: ['s@x.com'], orgDomains: ['x.com'] },
    );
    const r = scorePair(comps);
    const sum = r.breakdown.reduce((a, b) => a + b.weight, 0);
    expect(sum).toBeCloseTo(r.weight, 3);
  });
});

describe('type-aware entity linkage', () => {
  it('normalizes person and organization decoration', () => {
    expect(canonicalPersonName('Dr. Jordan (Kym), PhD')).toBe('jordan kym');
    expect(canonicalOrganizationName('Nile Robotics, LLC')).toBe('nile robotics');
  });

  it('resolves country names, codes, and Arabic aliases', () => {
    expect(canonicalCountryCode('Egypt')).toBe('EG');
    expect(canonicalCountryCode('EGY')).toBe('EG');
    expect(canonicalCountryCode('مصر')).toBe('EG');
  });

  it('finds a person spelling variant when identity is corroborated', () => {
    const result = compareEntities(
      { type: 'person', title: 'Jordan Kim', props: { emails: ['jordan@example.com'] } },
      { type: 'person', title: 'Jordyn Kym', props: { emails: ['jordan@example.com'] } },
    );
    expect(result.verdict).toBe('probable');
    expect(result.signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(['email', 'name']));
  });

  it('keeps fuzzy name-only identity below probable', () => {
    const result = compareEntities(
      { type: 'person', title: 'Jordan Kim' },
      { type: 'person', title: 'Jordyn Kym' },
    );
    expect(result.verdict).not.toBe('probable');
  });

  it('matches country locations through canonical identity', () => {
    const result = compareEntities(
      { type: 'location', title: 'Egypt', props: { kind: 'country', country_code: 'EG' } },
      { type: 'location', title: 'EGY', props: { kind: 'country' } },
    );
    expect(result.verdict).toBe('probable');
  });
});
