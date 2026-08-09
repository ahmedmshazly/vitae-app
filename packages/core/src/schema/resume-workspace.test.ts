import { describe, expect, it } from 'vitest';
import { atomAggregateInputSchema, letterCreateSchema, resumeConfigSchema } from './resume.js';

const validAtom = {
  owner_node: 'role-1',
  kind: 'achievement' as const,
  metrics: [{ value: 38, unit: '%' }],
  evidence: [{ kind: 'url' as const, url: 'https://example.com/proof' }],
  pinned: false,
  blocked: false,
  variants: [
    { emphasis: 'technical' as const, text: 'Reduced latency by 38%.', is_default: true },
    {
      emphasis: 'leadership' as const,
      text: 'Led the team that reduced latency by 38%.',
      is_default: false,
    },
  ],
  skill_ids: ['python'],
};

describe('résumé workspace schemas', () => {
  it('accepts a complete editable atom aggregate', () => {
    expect(atomAggregateInputSchema.parse(validAtom)).toMatchObject(validAtom);
  });

  it('requires exactly one default wording and unique emphases', () => {
    const duplicate = {
      ...validAtom,
      variants: validAtom.variants.map((variant) => ({
        ...variant,
        is_default: false,
        emphasis: 'technical' as const,
      })),
    };
    const result = atomAggregateInputSchema.safeParse(duplicate);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'variant emphasis values must be unique',
          'exactly one variant must be the default',
        ]),
      );
  });

  it('rejects an inverted evidence date range', () => {
    expect(
      atomAggregateInputSchema.safeParse({
        ...validAtom,
        date_start: '2026-08-01',
        date_end: '2026-07-01',
      }).success,
    ).toBe(false);
  });

  it('accepts node-linked evidence alongside a URL', () => {
    const parsed = atomAggregateInputSchema.parse({
      ...validAtom,
      evidence: [
        { kind: 'node', node_id: 'repo-1', label: 'Latency PR' },
        { kind: 'url', url: 'https://example.com/proof' },
      ],
    });
    expect(parsed.evidence).toHaveLength(2);
    expect(parsed.evidence[0]).toMatchObject({ kind: 'node', node_id: 'repo-1' });
  });

  it('keeps legacy drafts compatible while adding curated style controls', () => {
    const config = resumeConfigSchema.parse({});
    expect(config.variant_by_atom).toEqual({});
    expect(config.emphasis).toBe('technical');
    expect(config.section_order).toContain('experience');
  });

  it('accepts a cover-letter draft with mixed atom and free-text blocks', () => {
    const letter = letterCreateSchema.parse({
      target_id: 'target-1',
      resume_id: 'resume-1',
      blocks: [
        { kind: 'hook', text: 'I am writing about the Staff role.' },
        { kind: 'body', atom_id: 'atom-1' },
        { kind: 'closer', text: 'Happy to talk next week.', atom_id: 'atom-2' },
      ],
    });
    expect(letter.status).toBe('draft');
    expect(letter.blocks).toHaveLength(3);
  });

  it('rejects cover-letter blocks that cite neither text nor an atom', () => {
    expect(
      letterCreateSchema.safeParse({
        target_id: 'target-1',
        blocks: [{ kind: 'hook' }],
      }).success,
    ).toBe(false);
  });
});
