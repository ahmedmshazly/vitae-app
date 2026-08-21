import { describe, expect, it } from 'vitest';
import {
  contactLensHref,
  factorExplanation,
  factorLabel,
  intentFromParams,
  intentIsAskable,
  intentToParams,
  matchedTheAsk,
  reachLensHref,
} from './Ask.js';

const params = (s: string) => new URLSearchParams(s);

describe('intentIsAskable', () => {
  // Landing on /ask/people must not fire a rank for the default the form
  // happens to be showing, nothing has been asked yet.
  it('is false for a bare visit', () => {
    expect(intentIsAskable(params(''))).toBe(false);
    expect(intentIsAskable(params('need=referral'))).toBe(false);
  });

  it('is true when the link carries something the user chose', () => {
    expect(intentIsAskable(params('topics=ml'))).toBe(true);
    expect(intentIsAskable(params('org=Nile'))).toBe(true);
    expect(intentIsAskable(params('city=Berlin'))).toBe(true);
  });

  // Pressing Ask with only a need selected is a real ask; without the explicit
  // flag it would be indistinguishable from having asked nothing at all.
  it('is true when the ask was explicit, even with only a need', () => {
    expect(intentIsAskable(params('need=advice&run=1'))).toBe(true);
  });
});

describe('intent round-trip', () => {
  it('survives the URL, which is what makes an ask linkable', () => {
    const intent = {
      need: 'intro',
      org: 'Nile Robotics',
      topics: 'reinforcement learning, hiring',
      city: 'Berlin',
    };
    const back = intentFromParams(intentToParams(intent));
    expect(back).toEqual(intent);
  });

  it('marks an explicit ask so a reload re-runs it', () => {
    expect(intentToParams({ need: 'advice', org: '', topics: '', city: '' }).get('run')).toBe('1');
    expect(intentIsAskable(intentToParams({ need: 'advice', org: '', topics: '', city: '' }))).toBe(
      true,
    );
  });

  it('leaves empty fields out of the URL rather than writing org=', () => {
    const q = intentToParams({ need: 'referral', org: '', topics: 'ml', city: '' });
    expect(q.has('org')).toBe(false);
    expect(q.has('city')).toBe(false);
    expect(q.get('topics')).toBe('ml');
  });

  it('keeps an explicit ask on the canonical contact lens', () => {
    expect(
      intentToParams({ need: 'intro', org: 'Nile Robotics', topics: '', city: '' }).get('lens'),
    ).toBe('contact');
  });

  it('defaults a missing need rather than ranking for undefined', () => {
    expect(intentFromParams(params('topics=ml')).need).toBe('referral');
  });
});

describe('network intelligence links', () => {
  it('keeps the current ask on the canonical contact lens', () => {
    const href = contactLensHref(
      { need: 'intro', org: 'Nile Robotics', topics: 'robotics', city: 'Cairo' },
      true,
    );
    const url = new URL(href, 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('contact');
    expect(url.searchParams.get('org')).toBe('Nile Robotics');
    expect(url.searchParams.get('run')).toBe('1');
  });

  it('hands an organization name to the warm-path lens without inventing an id', () => {
    const url = new URL(reachLensHref('Nile Robotics'), 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('reach');
    expect(url.searchParams.get('orgName')).toBe('Nile Robotics');
    expect(url.searchParams.has('org')).toBe(false);
  });
});

describe('factorLabel', () => {
  it('prefers what the ranker said about this particular match', () => {
    expect(factorLabel({ factor: 'topic', raw: 1, weighted: 1.6, detail: 'via topics' })).toBe(
      'via topics',
    );
  });

  // "graph" and "reciprocity" are the algorithm's words, not a reader's.
  it('translates the two factor names that mean nothing to a reader', () => {
    expect(factorLabel({ factor: 'graph', raw: 1, weighted: 0.02 })).toBe('network proximity');
    expect(factorLabel({ factor: 'reciprocity', raw: 1, weighted: 0.3 })).toBe('favors');
  });

  it('passes through the names that already read as English', () => {
    expect(factorLabel({ factor: 'affiliation', raw: 1, weighted: 1 })).toBe('affiliation');
    expect(factorLabel({ factor: 'strength', raw: 1, weighted: 1 })).toBe('strength');
  });
});

describe('factorExplanation', () => {
  it('explains ranker vocabulary as recorded evidence and relationship context', () => {
    expect(factorExplanation({ factor: 'topic', raw: 1, weighted: 0.4 })).toContain('topics');
    expect(factorExplanation({ factor: 'graph', raw: 1, weighted: 0.2 })).toContain(
      'relationship network',
    );
    expect(factorExplanation({ factor: 'strength', raw: 1, weighted: 0.8 })).toContain(
      'relationship strength',
    );
  });

  it('gives an unknown factor an honest generic explanation', () => {
    expect(factorExplanation({ factor: 'custom', raw: 1, weighted: 0.1 })).toBe(
      'A recorded custom signal contributed to this rank.',
    );
  });
});

describe('matchedTheAsk', () => {
  const chip = (factor: string, weighted: number) => ({ factor, raw: 1, weighted });

  // The case that broke the old `score < 1.2` rule: asking about nothing
  // returns the closest contact at 1.47, built entirely out of how well you
  // know them. A high total is not a match.
  it('is false when the leader ranks only on the relationship', () => {
    expect(matchedTheAsk([chip('strength', 1.2), chip('graph', 0.27)])).toBe(false);
    expect(matchedTheAsk([chip('strength', 5), chip('pinned', 1), chip('reciprocity', 2)])).toBe(
      false,
    );
  });

  it('is true when any factor answers the question that was asked', () => {
    expect(matchedTheAsk([chip('strength', 1.2), chip('topic', 0.01)])).toBe(true);
    expect(matchedTheAsk([chip('affiliation', 0.4)])).toBe(true);
    expect(matchedTheAsk([chip('geo', 0.1)])).toBe(true);
  });

  // A factor can be present and contribute nothing; that is not a match.
  it('ignores an intent factor that scored zero', () => {
    expect(matchedTheAsk([chip('topic', 0), chip('strength', 1.2)])).toBe(false);
  });

  it('is false for no factors at all', () => {
    expect(matchedTheAsk([])).toBe(false);
  });
});
