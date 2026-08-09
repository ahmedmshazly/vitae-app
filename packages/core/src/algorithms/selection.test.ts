import { describe, expect, it } from 'vitest';
import { selectAtoms, selectManual, type SelectableAtom } from './selection.js';
import type { ParsedKeyword } from '../schema/resume.js';

const keywords: ParsedKeyword[] = [
  { term: 'python', weight: 2, sections: [], spans: [], skill_id: 's_py' },
  { term: 'kubernetes', weight: 1.5, sections: [], spans: [], skill_id: 's_k8s' },
  { term: 'grpc', weight: 1, sections: [], spans: [], skill_id: 's_grpc' },
];

function mk(
  id: string,
  hits: Record<string, number>,
  opts: Partial<SelectableAtom> = {},
): SelectableAtom {
  return {
    id,
    ownerId: opts.ownerId ?? 'role1',
    ownerKind: 'role',
    dateEnd: opts.dateEnd,
    pinned: opts.pinned ?? false,
    blocked: opts.blocked ?? false,
    quality: opts.quality ?? 1,
    hitByKeyword: hits,
    variants: opts.variants ?? [
      { emphasis: 'technical', text: 'x', lines: 2 },
      { emphasis: 'concise', text: 'x', lines: 1 },
    ],
  };
}

describe('selectAtoms (budgeted submodular greedy, SRS §10.7.5)', () => {
  it('diversifies coverage rather than stacking one keyword', () => {
    // Three python-only atoms vs one k8s atom; with a tight budget the optimizer
    // should include the k8s atom for coverage rather than a 3rd python bullet.
    const atoms = [
      mk('p1', { python: 1 }, { quality: 1 }),
      mk('p2', { python: 1 }, { quality: 1 }),
      mk('p3', { python: 1 }, { quality: 1 }),
      mk('k1', { kubernetes: 1 }, { quality: 1 }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 6, maxBulletsPerRole: 10 });
    const ids = res.entries.map((e) => e.atomId);
    expect(ids).toContain('k1'); // diversity by construction
  });

  it('forces pinned atoms in and excludes blocked ones', () => {
    const atoms = [
      mk('pinned', { grpc: 1 }, { pinned: true, quality: 0.1 }),
      mk('blocked', { python: 1 }, { blocked: true, quality: 5 }),
      mk('normal', { python: 1 }, { quality: 1 }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 10 });
    const ids = res.entries.map((e) => e.atomId);
    expect(ids).toContain('pinned');
    expect(ids).not.toContain('blocked');
    expect(res.decisions.find((d) => d.atomId === 'blocked')?.action).toBe('dropped-blocked');
  });

  it('respects the line budget (knapsack)', () => {
    const atoms = Array.from({ length: 10 }, (_, i) =>
      mk(`a${i}`, { python: 1 }, { variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
    );
    const res = selectAtoms(atoms, { keywords, budgetLines: 5, maxBulletsPerRole: 10 });
    expect(res.totalLines).toBeLessThanOrEqual(5);
  });

  it('enforces max bullets per role (partition constraint)', () => {
    const atoms = Array.from({ length: 8 }, (_, i) => mk(`a${i}`, { python: 1 }, { ownerId: 'roleA' }));
    const res = selectAtoms(atoms, { keywords, budgetLines: 100, maxBulletsPerRole: 4 });
    const roleACount = res.entries.filter((e) => e.ownerId === 'roleA').length;
    expect(roleACount).toBeLessThanOrEqual(4);
  });

  it('orders entries reverse-chronologically by owner date', () => {
    const atoms = [
      mk('old', { python: 1 }, { ownerId: 'roleOld', dateEnd: '2019-01-01' }),
      mk('new', { kubernetes: 1 }, { ownerId: 'roleNew', dateEnd: '2025-01-01' }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 100 });
    expect(res.entries[0]!.atomId).toBe('new');
  });

  it('is deterministic, identical inputs give identical proposals (FR-RES-008)', () => {
    const atoms = [mk('a', { python: 1 }), mk('b', { kubernetes: 1 }), mk('c', { grpc: 1 })];
    const a = selectAtoms(atoms, { keywords, budgetLines: 4 });
    const b = selectAtoms(atoms, { keywords, budgetLines: 4 });
    expect(a.entries).toEqual(b.entries);
  });

  it('reports weighted coverage in [0,1]', () => {
    const res = selectAtoms([mk('a', { python: 1 })], { keywords, budgetLines: 10 });
    expect(res.weightedCoverage).toBeGreaterThan(0);
    expect(res.weightedCoverage).toBeLessThanOrEqual(1);
  });
});

describe('selectManual (hand-picked ordered selection)', () => {
  it('preserves the given order verbatim (no reverse-chron re-sort)', () => {
    const atoms = [
      mk('old', { python: 1 }, { ownerId: 'roleOld', dateEnd: '2019-01-01' }),
      mk('new', { kubernetes: 1 }, { ownerId: 'roleNew', dateEnd: '2025-01-01' }),
      mk('mid', { grpc: 1 }, { ownerId: 'roleMid', dateEnd: '2022-01-01' }),
    ];
    const res = selectManual(atoms, ['old', 'new', 'mid'], { keywords, budgetLines: 100 });
    expect(res.entries.map((e) => e.atomId)).toEqual(['old', 'new', 'mid']);
  });

  it('skips unknown ids and de-duplicates repeats', () => {
    const atoms = [mk('a', { python: 1 }), mk('b', { kubernetes: 1 })];
    const res = selectManual(atoms, ['a', 'ghost', 'b', 'a'], { keywords, budgetLines: 100 });
    expect(res.entries.map((e) => e.atomId)).toEqual(['a', 'b']);
    expect(res.decisions.every((d) => d.action === 'manual-add')).toBe(true);
  });

  it('resolves the preferred emphasis variant, falling back to the default', () => {
    const atoms = [
      mk('a', { python: 1 }, {
        variants: [
          { emphasis: 'technical', text: 'tech', lines: 2 },
          { emphasis: 'concise', text: 'short', lines: 1 },
        ],
      }),
    ];
    const withPref = selectManual(atoms, ['a'], { keywords, budgetLines: 100, preferredEmphasis: 'concise' });
    expect(withPref.entries[0]!.text).toBe('short');
    const noPref = selectManual(atoms, ['a'], { keywords, budgetLines: 100 });
    expect(noPref.entries[0]!.text).toBe('tech');
  });

  it('lets per-atom wording override the global preferred emphasis', () => {
    const atoms = [
      mk('a', { python: 1 }, {
        variants: [
          { emphasis: 'technical', text: 'tech', lines: 2 },
          { emphasis: 'leadership', text: 'lead', lines: 2 },
          { emphasis: 'concise', text: 'short', lines: 1 },
        ],
      }),
    ];
    const res = selectManual(atoms, ['a'], {
      keywords,
      budgetLines: 100,
      preferredEmphasis: 'technical',
      variantByAtom: { a: 'leadership' },
    });
    expect(res.entries[0]!.text).toBe('lead');
    expect(res.entries[0]!.emphasis).toBe('leadership');
  });

  it('computes the same coverage math as auto for the same set', () => {
    const atoms = [mk('a', { python: 1 }), mk('b', { kubernetes: 1 })];
    const auto = selectAtoms(atoms, { keywords, budgetLines: 100 });
    const manual = selectManual(atoms, auto.entries.map((e) => e.atomId), { keywords, budgetLines: 100 });
    expect(manual.weightedCoverage).toBeCloseTo(auto.weightedCoverage, 6);
    expect(manual.coverage).toEqual(auto.coverage);
  });

  it('is deterministic', () => {
    const atoms = [mk('a', { python: 1 }), mk('b', { kubernetes: 1 })];
    const r1 = selectManual(atoms, ['b', 'a'], { keywords, budgetLines: 100 });
    const r2 = selectManual(atoms, ['b', 'a'], { keywords, budgetLines: 100 });
    expect(r1).toEqual(r2);
  });
});

/** Regression tests for FR-018 (review 2026-07-13): entry overhead is a real cost. */
describe('entry overhead accounting', () => {
  it('reports total lines including one owner header per distinct entry', () => {
    const atoms = [
      mk('a1', { python: 1 }, { ownerId: 'role1', variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
      mk('a2', { kubernetes: 1 }, { ownerId: 'role1', variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
      mk('b1', { grpc: 1 }, { ownerId: 'role2', variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 100, entryOverhead: 3, maxBulletsPerRole: 10 });
    // 3 bullets × 2 lines + 2 distinct owners × 3 overhead = 12.
    expect(res.entries).toHaveLength(3);
    expect(res.totalLines).toBe(12);
  });

  it('never selects a single atom whose entry does not fit the budget', () => {
    // The bullet is 4 lines and fits a 5-line budget, but its owner header adds
    // 3 more. The old fallback compared bare lines and selected it anyway.
    const atoms = [
      mk('big', { python: 5 }, { quality: 10, variants: [{ emphasis: 'technical', text: 'x', lines: 4 }] }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 5, entryOverhead: 3 });
    expect(res.entries).toHaveLength(0);
    expect(res.totalLines).toBe(0);
  });

  it('keeps reported total lines within budget when the fallback fires', () => {
    const atoms = [
      mk('fits', { python: 5 }, { quality: 10, variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
    ];
    const res = selectAtoms(atoms, { keywords, budgetLines: 5, entryOverhead: 3 });
    expect(res.entries.map((e) => e.atomId)).toEqual(['fits']);
    expect(res.totalLines).toBe(5);
    expect(res.totalLines).toBeLessThanOrEqual(5);
  });

  it('counts overhead in manual mode too, so the page meter matches auto', () => {
    const atoms = [
      mk('a1', { python: 1 }, { ownerId: 'role1', variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
      mk('b1', { grpc: 1 }, { ownerId: 'role2', variants: [{ emphasis: 'technical', text: 'x', lines: 2 }] }),
    ];
    const manual = selectManual(atoms, ['a1', 'b1'], { keywords, budgetLines: 100, entryOverhead: 3 });
    expect(manual.totalLines).toBe(2 + 3 + 2 + 3);
  });
});
