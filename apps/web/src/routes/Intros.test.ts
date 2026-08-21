import { describe, expect, it } from 'vitest';
import { contactLensHref, edgeLabel, edgeWeight, reachLensHref, targetFacts } from './Intros.js';

const hop = (over: Partial<Parameters<typeof edgeLabel>[0]> = {}) => ({
  nodeId: 'n1',
  title: 'Sarah Chen',
  type: 'person',
  ...over,
});

describe('edgeLabel', () => {
  it('names the mechanism, and carries the number when there is one', () => {
    expect(edgeLabel(hop({ viaEdgeType: 'knows', viaStrength: 0.18 }))).toBe('knows · 0.18');
    expect(edgeLabel(hop({ viaEdgeType: 'works_at' }))).toBe('works there');
    expect(edgeLabel(hop({ viaEdgeType: 'introduced' }))).toBe('introduced');
  });

  it('says "knows" without inventing a strength it was not given', () => {
    expect(edgeLabel(hop({ viaEdgeType: 'knows' }))).toBe('knows');
  });

  it('falls back to the raw edge type rather than rendering nothing', () => {
    expect(edgeLabel(hop({ viaEdgeType: 'mentored' }))).toBe('mentored');
    expect(edgeLabel(hop())).toBe('');
  });
});

describe('edgeWeight', () => {
  // The three classes this replaced painted the line accent / accent-soft /
  // --ae-warning, which is a semantic token used as a chart series.
  it('is a continuum, not three bands', () => {
    const weak = edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: 0.1 }));
    const mid = edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: 0.5 }));
    const strong = edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: 0.9 }));
    expect(weak).toBeLessThan(mid);
    expect(mid).toBeLessThan(strong);
  });

  it('never fades a line to invisible', () => {
    expect(edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: 0 }))).toBeGreaterThanOrEqual(0.2);
    expect(edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: -5 }))).toBeGreaterThanOrEqual(0.2);
  });

  it('stays inside the track for an out-of-range strength', () => {
    expect(edgeWeight(hop({ viaEdgeType: 'knows', viaStrength: 4 }))).toBe(1);
  });

  // "Works there" is a fact about the world, not a degree of anything, so
  // drawing it faintly would imply a weakness that does not exist.
  it('draws a factual edge at full weight', () => {
    expect(edgeWeight(hop({ viaEdgeType: 'works_at' }))).toBe(1);
    expect(edgeWeight(hop({ viaEdgeType: 'introduced' }))).toBe(1);
  });

  it('draws an unmeasured tie mid-weight rather than as strong as a fact', () => {
    const unknown = edgeWeight(hop({ viaEdgeType: 'knows' }));
    expect(unknown).toBeGreaterThan(0.2);
    expect(unknown).toBeLessThan(1);
  });
});

describe('targetFacts', () => {
  const t = (over: Record<string, unknown> = {}) =>
    ({
      id: 'o1',
      title: 'Nile Robotics',
      kind: null,
      city: null,
      stage: null,
      reach: 'direct',
      reachable: true,
      affinity: 0.5,
      peopleCount: 1,
      openRoles: 10,
      ...over,
    }) as Parameters<typeof targetFacts>[0];

  it('shows the facts the rail silently sorted by', () => {
    expect(targetFacts(t())).toBe('1 known · 10 open roles');
  });

  it('agrees with itself about one', () => {
    expect(targetFacts(t({ openRoles: 1 }))).toBe('1 known · 1 open role');
  });

  // "0 open roles" on every cold org is noise; "0 known" is the fact that
  // explains why there is no path, so it stays.
  it('omits open roles when there are none, and always states what you know', () => {
    expect(targetFacts(t({ peopleCount: 0, openRoles: 0 }))).toBe('0 known');
  });
});

describe('network intelligence links', () => {
  it('carries the selected organization into the contact lens as an explicit intro ask', () => {
    const url = new URL(contactLensHref('Nile Robotics'), 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('contact');
    expect(url.searchParams.get('need')).toBe('intro');
    expect(url.searchParams.get('org')).toBe('Nile Robotics');
    expect(url.searchParams.get('run')).toBe('1');
  });

  it('keeps a selected target on the canonical reach lens', () => {
    const url = new URL(reachLensHref('org-1'), 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('reach');
    expect(url.searchParams.get('org')).toBe('org-1');
  });
});
