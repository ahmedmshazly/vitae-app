/**
 * The dossier selection format and its per-audience grammar.
 *
 * The grammar is the whole of FR-DOS-002: three named audiences that share one
 * selection format underneath and differ in what their sections admit. These
 * tests pin the differences, because a grammar whose audiences all validate
 * the same way would satisfy the schema and none of the requirement.
 */
import { describe, expect, it } from 'vitest';
import {
  DOSSIER_AUDIENCES,
  DOSSIER_GRAMMAR,
  dossierCreateSchema,
  dossierSectionGrammar,
  validateDossier,
  type DossierCitation,
  type ResolvedCitation,
} from './dossier.js';

/** A resolver that answers from a fixed table, and says so when it cannot. */
function resolver(table: Record<string, ResolvedCitation>) {
  return (citation: DossierCitation): ResolvedCitation | null => table[citation.id] ?? null;
}

const node = (type: string): ResolvedCitation => ({ kind: 'node', type });
const atom = (): ResolvedCitation => ({ kind: 'atom', type: 'atom' });

describe('the dossier selection format', () => {
  it('takes a subject, an audience and sections of claims that cite records', () => {
    const parsed = dossierCreateSchema.parse({
      subject_node: 'person-1',
      audience: 'promotion_review',
      title: 'Staff promotion, H2',
      window: { from: '2025-01-01', to: '2025-12-31' },
      sections: [
        {
          grammar_id: 'scope',
          claims: [{ id: 'c1', text: 'Owned the serving path.', cites: [{ kind: 'node', id: 'r1' }] }],
        },
      ],
    });
    expect(parsed.sections[0]?.claims[0]?.cites[0]?.id).toBe('r1');
  });

  it('refuses a claim with no text, because a citation is not an assertion', () => {
    expect(() =>
      dossierCreateSchema.parse({
        subject_node: 'person-1',
        audience: 'promotion_review',
        title: 'Packet',
        sections: [{ grammar_id: 'scope', claims: [{ id: 'c1', text: '  ', cites: [] }] }],
      }),
    ).toThrow();
  });

  it('allows a dossier with no window, which claims nothing about a period', () => {
    const parsed = dossierCreateSchema.parse({
      subject_node: 'person-1',
      audience: 'petition_exhibits',
      title: 'Exhibit list',
      sections: [],
    });
    expect(parsed.window).toBeUndefined();
  });
});

describe('the audience grammars', () => {
  it('gives every audience at least one required section', () => {
    for (const audience of DOSSIER_AUDIENCES) {
      expect(DOSSIER_GRAMMAR[audience].some((section) => section.required)).toBe(true);
    }
  });

  it('keeps section ids unique inside each audience', () => {
    for (const audience of DOSSIER_AUDIENCES) {
      const ids = DOSSIER_GRAMMAR[audience].map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('looks a section up by audience, and says null rather than guessing', () => {
    expect(dossierSectionGrammar('promotion_review', 'impact')?.heading).toBe('Impact');
    expect(dossierSectionGrammar('promotion_review', 'exhibits')).toBeNull();
  });

  it('binds an exhibit to exactly one record, unlike a promotion claim', () => {
    // The difference that makes the numbering of an exhibit list mean anything.
    expect(dossierSectionGrammar('petition_exhibits', 'exhibits')?.maxCitationsPerClaim).toBe(1);
    expect(dossierSectionGrammar('promotion_review', 'impact')?.maxCitationsPerClaim).toBeNull();
  });
});

describe('validateDossier', () => {
  const complete = {
    audience: 'promotion_review' as const,
    sections: [
      {
        grammar_id: 'scope',
        claims: [{ id: 'c1', text: 'Owned serving.', cites: [{ kind: 'node' as const, id: 'role-1' }] }],
      },
      {
        grammar_id: 'impact',
        claims: [
          { id: 'c2', text: 'Cut latency.', cites: [{ kind: 'atom' as const, id: 'atom-1' }] },
          { id: 'c3', text: 'Shipped the bench.', cites: [{ kind: 'node' as const, id: 'project-1' }] },
        ],
      },
    ],
  };
  const known = resolver({
    'role-1': node('role'),
    'project-1': node('project'),
    'atom-1': atom(),
    'person-1': node('person'),
    'habit-1': node('habit'),
  });

  it('passes a dossier that satisfies its grammar', () => {
    expect(validateDossier(complete, known)).toEqual([]);
  });

  it('names a required section that is absent', () => {
    const withoutImpact = { ...complete, sections: [complete.sections[0]!] };
    const violations = validateDossier(withoutImpact, known);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'missing_required_section', section: 'impact' });
  });

  it('reports every violation, not only the first', () => {
    // An operator fixing a packet wants the whole of what is missing in one
    // pass, so this is a list and not a boolean with an early return.
    const broken = {
      audience: 'promotion_review' as const,
      sections: [
        { grammar_id: 'scope', claims: [{ id: 'c1', text: 'Unsupported.', cites: [] }] },
        { grammar_id: 'impact', claims: [] },
      ],
    };
    const rules = validateDossier(broken, known).map((violation) => violation.rule);
    expect(rules).toContain('too_few_citations');
    expect(rules).toContain('too_few_claims');
    expect(rules.length).toBeGreaterThan(1);
  });

  it('refuses a record type the section does not admit, and says which', () => {
    const wrongType = {
      audience: 'promotion_review' as const,
      sections: [
        {
          grammar_id: 'scope',
          claims: [{ id: 'c1', text: 'Scope.', cites: [{ kind: 'node' as const, id: 'habit-1' }] }],
        },
        complete.sections[1]!,
      ],
    };
    const violations = validateDossier(wrongType, known);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('type_not_admitted');
    expect(violations[0]?.message).toContain('habit');
  });

  it('refuses an atom where the section takes only records', () => {
    const atomInScope = {
      audience: 'promotion_review' as const,
      sections: [
        {
          grammar_id: 'scope',
          claims: [{ id: 'c1', text: 'Scope.', cites: [{ kind: 'atom' as const, id: 'atom-1' }] }],
        },
        complete.sections[1]!,
      ],
    };
    expect(validateDossier(atomInScope, known).map((v) => v.rule)).toEqual(['type_not_admitted']);
  });

  it('reports a citation whose record is gone rather than quietly dropping it', () => {
    // Dropping it would leave the claim looking unsupported with no stated
    // reason, which is the reader being misled rather than informed.
    const dangling = {
      audience: 'promotion_review' as const,
      sections: [
        {
          grammar_id: 'scope',
          claims: [{ id: 'c1', text: 'Scope.', cites: [{ kind: 'node' as const, id: 'deleted-1' }] }],
        },
        complete.sections[1]!,
      ],
    };
    expect(validateDossier(dangling, known).map((v) => v.rule)).toEqual(['citation_missing']);
  });

  it('rejects a section the audience has never heard of', () => {
    const stray = {
      audience: 'petition_exhibits' as const,
      sections: [{ grammar_id: 'impact', claims: [] }],
    };
    const rules = validateDossier(stray, known).map((violation) => violation.rule);
    expect(rules).toContain('unknown_section');
    expect(rules).toContain('missing_required_section');
  });

  it('rejects the same section twice, because a reader could not tell which is which', () => {
    const twice = {
      audience: 'petition_exhibits' as const,
      sections: [
        {
          grammar_id: 'exhibits',
          claims: ['e1', 'e2', 'e3'].map((id) => ({
            id,
            text: `Exhibit ${id}`,
            cites: [{ kind: 'node' as const, id: 'project-1' }],
          })),
        },
        { grammar_id: 'exhibits', claims: [] },
      ],
    };
    expect(validateDossier(twice, known).map((v) => v.rule)).toEqual(['duplicate_section']);
  });

  it('holds an exhibit to a single record', () => {
    const twoRecords = {
      audience: 'petition_exhibits' as const,
      sections: [
        {
          grammar_id: 'exhibits',
          claims: [
            { id: 'e1', text: 'A', cites: [{ kind: 'node' as const, id: 'project-1' }] },
            { id: 'e2', text: 'B', cites: [{ kind: 'node' as const, id: 'project-1' }] },
            {
              id: 'e3',
              text: 'C',
              cites: [
                { kind: 'node' as const, id: 'project-1' },
                { kind: 'node' as const, id: 'role-1' },
              ],
            },
          ],
        },
      ],
    };
    const violations = validateDossier(twoRecords, known);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'too_many_citations', claim: 'e3' });
  });

  it('admits any record type into an exhibit list, and only dated ones into a history', () => {
    // Same selection format, different rules underneath, which is the claim
    // FR-DOS-002 makes.
    expect(dossierSectionGrammar('petition_exhibits', 'exhibits')?.admits).toBe('any');
    expect(dossierSectionGrammar('background_history', 'employment')?.admits).toEqual([
      'role',
      'organization',
    ]);
  });
});
