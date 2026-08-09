import { describe, expect, it } from 'vitest';
import { parseJd, type SkillAlias } from './jd-parser.js';

const ALIASES: SkillAlias[] = [
  { alias: 'python', term: 'Python', skillId: 's_py' },
  { alias: 'reinforcement learning', term: 'Reinforcement Learning', skillId: 's_rl' },
  { alias: 'rl', term: 'Reinforcement Learning', skillId: 's_rl' },
  { alias: 'kubernetes', term: 'Kubernetes', skillId: 's_k8s' },
  { alias: 'k8s', term: 'Kubernetes', skillId: 's_k8s' },
  { alias: 'grpc', term: 'gRPC', skillId: 's_grpc' },
];

const JD = `Senior Machine Learning Engineer

About the team
We build perception systems for robotics.

Requirements
- Strong Python experience is required
- Deep reinforcement learning background
- Experience deploying models on Kubernetes

Nice to have
- Familiarity with gRPC
`;

describe('parseJd (BM25F, SRS §10.7.4)', () => {
  const parsed = parseJd(JD, { aliases: ALIASES });

  it('extracts dictionary skills with their skill ids', () => {
    const terms = parsed.keywords.map((k) => k.term);
    expect(terms).toContain('Python');
    expect(terms).toContain('Reinforcement Learning');
    expect(terms).toContain('Kubernetes');
    const py = parsed.keywords.find((k) => k.term === 'Python');
    expect(py?.skill_id).toBe('s_py');
  });

  it('records section origins and spans', () => {
    const py = parsed.keywords.find((k) => k.term === 'Python')!;
    expect(py.sections).toContain('requirements');
    expect(py.spans.length).toBeGreaterThan(0);
    const [start, end] = py.spans[0]!;
    expect(JD.slice(start, end).toLowerCase()).toContain('python');
  });

  it('weights requirements above nice-to-have (section field weights)', () => {
    const py = parsed.keywords.find((k) => k.term === 'Python')!; // requirements
    const grpc = parsed.keywords.find((k) => k.term === 'gRPC'); // nice-to-have
    if (grpc) expect(py.weight).toBeGreaterThan(grpc.weight);
  });

  it('caps the keyword set at 40 terms', () => {
    expect(parsed.keywords.length).toBeLessThanOrEqual(40);
  });

  it('is deterministic', () => {
    expect(parseJd(JD, { aliases: ALIASES })).toEqual(parseJd(JD, { aliases: ALIASES }));
  });

  it('surfaces novel high-idf terms as suggestions', () => {
    const withGrpc = parseJd('We need someone who knows Tectonic and WebGPU deeply.', {
      aliases: [],
    });
    const suggested = withGrpc.keywords.filter((k) => k.suggested);
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((k) => k.skill_id === null)).toBe(true);
  });
});
