import { describe, expect, it } from 'vitest';
import { scoreAtom } from './atom-scoring.js';
import type { ParsedKeyword, ScorableAtom } from '../schema/resume.js';

const NOW = new Date('2026-07-11T00:00:00Z');

function atom(partial: Partial<ScorableAtom>): ScorableAtom {
  return {
    id: 'a1',
    owner_node: 'role1',
    kind: 'achievement',
    metrics: [],
    evidence: [],
    pinned: false,
    blocked: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    deleted_at: null,
    variants: [{ id: 'v1', atom_id: 'a1', emphasis: 'technical', text: '', is_default: true }],
    skill_ids: [],
    ...partial,
  };
}

const keywords: ParsedKeyword[] = [
  { term: 'Python', weight: 2, sections: [], spans: [], skill_id: 's_py' },
  { term: 'latency', weight: 1, sections: [], spans: [], skill_id: null },
];

describe('scoreAtom (SRS §10.4-B)', () => {
  it('gives full hit (1.0) for a skill-tag match, 0.6 for a text match', () => {
    const a = atom({
      skill_ids: ['s_py'],
      variants: [
        { id: 'v1', atom_id: 'a1', emphasis: 'technical', text: 'Cut latency across services', is_default: true },
      ],
      date_end: NOW.toISOString().slice(0, 10),
    });
    const s = scoreAtom(a, keywords, NOW);
    const py = s.hits.find((h) => h.term === 'Python')!;
    const lat = s.hits.find((h) => h.term === 'latency')!;
    expect(py.hit).toBe(1); // skill tag
    expect(lat.hit).toBe(0.6); // stemmed text
  });

  it('breakdown contributions sum to relevance exactly (FR-RES-007)', () => {
    const a = atom({
      skill_ids: ['s_py'],
      variants: [
        { id: 'v1', atom_id: 'a1', emphasis: 'technical', text: 'Reduced latency', is_default: true },
      ],
      date_end: NOW.toISOString().slice(0, 10),
    });
    const s = scoreAtom(a, keywords, NOW);
    const sum = s.hits.reduce((acc, h) => acc + h.contribution, 0);
    expect(sum).toBeCloseTo(s.relevance, 4);
    // score = relevance × recency × metricBonus
    expect(s.score).toBeCloseTo(s.relevance * s.recency * s.metricBonus, 3);
  });

  it('applies recency decay with a floor of 0.35', () => {
    const old = scoreAtom(
      atom({
        skill_ids: ['s_py'],
        date_end: '2000-01-01',
        variants: [{ id: 'v1', atom_id: 'a1', emphasis: 'technical', text: 'python', is_default: true }],
      }),
      keywords,
      NOW,
    );
    expect(old.recency).toBeCloseTo(0.35, 5);
  });

  it('applies a metric bonus capped at 2 metrics', () => {
    const two = scoreAtom(
      atom({
        skill_ids: ['s_py'],
        metrics: [{ value: 38, unit: '%' }, { value: 12, unit: 'services' }],
        date_end: NOW.toISOString().slice(0, 10),
        variants: [{ id: 'v1', atom_id: 'a1', emphasis: 'technical', text: 'python', is_default: true }],
      }),
      keywords,
      NOW,
    );
    expect(two.metricBonus).toBeCloseTo(1 + 0.15 * 2, 5);
  });
});
