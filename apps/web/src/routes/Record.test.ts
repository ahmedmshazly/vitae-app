/**
 * The pure parts of the record page: how a stored property key becomes a
 * label, which properties are worth showing, and how revisions become ticks
 * on the register rule.
 */
import { describe, expect, it } from 'vitest';
import {
  formatVal,
  humanizeKey,
  isSensitiveRecord,
  isUnsafePropertyKey,
  revisionTicks,
  shownProps,
} from './Record.js';

describe('humanizeKey', () => {
  it.each([
    ['tech_stack', 'Tech stack'],
    ['employment_type', 'Employment type'],
    ['team', 'Team'],
    ['next-step-date', 'Next step date'],
    ['job_url', 'Job url'],
  ])('%s → %s', (key, label) => {
    // Storage keys were rendered raw, so the page showed `tech_stack` as a label.
    expect(humanizeKey(key)).toBe(label);
  });

  it('leaves an already-readable key alone apart from its case', () => {
    expect(humanizeKey('headline')).toBe('Headline');
  });
});

describe('shownProps', () => {
  it('drops nothing that carries information', () => {
    const shown = shownProps({ a: 'x', b: 0, c: false, d: ['one'] });
    // 0 and false are values, not absence.
    expect(shown.map(([k]) => k)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops null, undefined, blank strings and empty lists', () => {
    expect(shownProps({ a: null, b: undefined, c: '', d: [], e: 'keep' })).toEqual([['e', 'keep']]);
  });
});

describe('sensitive record presentation', () => {
  it.each(['health_log', 'account'])(
    '%s stays private even when a legacy import omitted sensitivity',
    (type) => {
      expect(isSensitiveRecord({ type })).toBe(true);
    },
  );

  it('honours an explicit sensitive classification for every other record type', () => {
    expect(isSensitiveRecord({ type: 'repository', sensitivity: 'sensitive' })).toBe(true);
    expect(isSensitiveRecord({ type: 'repository', sensitivity: 'normal' })).toBe(false);
  });

  it('redacts credential-shaped properties, including unexpectedly nested imports', () => {
    expect(isUnsafePropertyKey('api_token')).toBe(true);
    expect(formatVal('live-token', 'api_token')).toMatch(/Redacted/);
    expect(formatVal({ owner: 'Jordan', nested: { password: 'do-not-show' } })).not.toContain(
      'do-not-show',
    );
  });

  it('renders structured values as readable key/value prose, never JSON storage syntax', () => {
    expect(
      formatVal({
        amount: 125000,
        currency: 'USD',
        period: 'yearly',
        contacts: [{ label: 'Recruiter', email: 'sam@example.com' }],
      }),
    ).toBe(
      'Amount: 125000 · Currency: USD · Period: yearly · Contacts: Label: Recruiter · Email: sam@example.com',
    );
  });

  it('keeps credential-shaped values redacted inside structured lists', () => {
    expect(formatVal([{ label: 'API', api_token: 'do-not-show' }])).toBe(
      'Label: API · Api token: Redacted: credentials are never displayed.',
    );
  });
});

describe('revisionTicks', () => {
  const rev = (n: number, op = 'update') => ({ rev: n, op, at: `2026-08-0${n}T00:00:00Z` });

  it('orders by revision number and marks the latest as the one being viewed', () => {
    const { ticks, index } = revisionTicks([rev(3), rev(1, 'create'), rev(2)]);
    expect(ticks.map((t) => t.label)).toEqual([
      'revision 1: create',
      'revision 2: update',
      'revision 3: update',
    ]);
    expect(index).toBe(2);
  });

  it('places every tick strictly inside the rule', () => {
    for (const t of revisionTicks([rev(1), rev(2), rev(3)]).ticks) {
      expect(t.at).toBeGreaterThan(0);
      expect(t.at).toBeLessThan(1);
    }
  });

  it('caps a long history at the most recent revisions, and admits to it', () => {
    const many = Array.from({ length: 40 }, (_, i) => rev(i + 1));
    const { ticks, index, truncated } = revisionTicks(many);
    // Beyond a couple of dozen the rule reads as noise rather than a scale.
    expect(ticks).toHaveLength(24);
    expect(ticks[0].label).toBe('revision 17: update');
    expect(ticks[index].label).toBe('revision 40: update');
    // Drawing 24 ticks for 40 revisions without saying so is the rule stating
    // something untrue, which is exactly what it did until a real record
    // crossed the line and the e2e assertion caught it.
    expect(truncated).toBe(true);
  });

  it('does not claim truncation when every revision is drawn', () => {
    expect(revisionTicks([rev(1), rev(2)]).truncated).toBe(false);
    const exactly = Array.from({ length: 24 }, (_, i) => rev(i + 1));
    expect(revisionTicks(exactly).truncated).toBe(false);
  });

  it('reports no ticks rather than a faked scale when there is no history', () => {
    expect(revisionTicks([])).toEqual({ ticks: [], index: -1, truncated: false });
  });
});
