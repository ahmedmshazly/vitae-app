import { describe, expect, it } from 'vitest';
import { validateNodeCreate } from './validate.js';

/** The 12 long-tail types that graduated from passthrough to typed schemas. */
const LONG_TAIL_VALID: Array<[string, Record<string, unknown>]> = [
  ['publication', { pub_type: 'conference', venue: 'NeurIPS', authors: ['Me', 'Her'], author_position: 2, published_on: '2025-12-10' }],
  ['talk', { talk_type: 'meetup', event_name: 'DevFest', audience_size: 120, delivered_on: '2025-11-02' }],
  ['award', { level: 'national', award_for: 'Best paper', awarded_on: '2025-06-01' }],
  ['goal', { horizon: 'year', goal_status: 'active', key_results: [{ name: 'papers', target: 2, current: 1, unit: 'count' }] }],
  ['habit', { cadence: 'weekly', target_per_period: 3, schedule_days: [1, 3, 5], active: true }],
  ['location', { kind: 'city', lat: 30.0444, lng: 31.2357, country_code: 'EG' }],
  ['trip', { purpose: 'conference', destination: 'Vancouver', transport: ['plane'], budget: { amount: 2000, currency: 'USD' } }],
  ['media_item', { media_kind: 'book', creator: 'C. Alexander', consumption_status: 'in_progress', rating: 5 }],
  ['highlight', { excerpt: 'A pattern language…', loc_ref: 'p. 141', thought: 'applies to schema design' }],
  ['asset', { category: 'electronics', vendor: 'Lenovo', price: { amount: 1400, currency: 'USD' }, asset_status: 'owned' }],
  ['health_log', { metric: 'sleep_h', value: 7.5, unit: 'h', logged_at: '2026-07-01T08:00:00Z' }],
  ['account', { kind: 'subscription', service: 'Cloudflare', cost: { amount: 5, currency: 'USD', period: 'monthly' }, account_status: 'active' }],
];

describe('long-tail node props schemas (SRS §4.3.9-11, 16-17, 22-28)', () => {
  for (const [type, props] of LONG_TAIL_VALID) {
    it(`accepts a well-formed ${type}`, () => {
      const r = validateNodeCreate({ type, title: 'x', props });
      expect(r.ok).toBe(true);
    });
  }

  it('accepts sparse props for every long-tail type (all fields optional)', () => {
    for (const [type] of LONG_TAIL_VALID) {
      const r = validateNodeCreate({ type, title: 'x', props: {} });
      expect(r.ok, `${type} with empty props`).toBe(true);
    }
  });

  it('round-trips unknown keys (passthrough, imported data must never be stripped)', () => {
    const r = validateNodeCreate({
      type: 'media_item',
      title: 'x',
      props: { media_kind: 'book', legacy_import_field: 'kept', nested: { deep: 1 } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.props.legacy_import_field).toBe('kept');
      expect(r.value.props.nested).toEqual({ deep: 1 });
    }
  });

  it('rejects a bad enum value', () => {
    const r = validateNodeCreate({ type: 'goal', title: 'x', props: { horizon: 'decade' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.path).toContain('props.horizon');
  });

  it('rejects an out-of-range rating', () => {
    const r = validateNodeCreate({ type: 'media_item', title: 'x', props: { rating: 9 } });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid schedule days', () => {
    const r = validateNodeCreate({ type: 'habit', title: 'x', props: { schedule_days: [7] } });
    expect(r.ok).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    const r = validateNodeCreate({ type: 'location', title: 'x', props: { lat: 123 } });
    expect(r.ok).toBe(false);
  });

  it('rejects malformed dates', () => {
    const r = validateNodeCreate({ type: 'publication', title: 'x', props: { published_on: 'Dec 2025' } });
    expect(r.ok).toBe(false);
  });
});
