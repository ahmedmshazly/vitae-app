/**
 * Dossiers (SRS FR-DOS-001, FR-DOS-002).
 *
 * A dossier is a named, single-subject selection of evidence records. It holds
 * claims, and every claim names the records it rests on; it does not hold
 * prose about records it cannot point at. Compiling one produces a document
 * plus a provenance appendix in which each claim's citations are resolved back
 * to their source, confidence and revision trail, which is the whole reason
 * the format exists: a reader who does not trust a sentence can follow it down
 * to the records that produced it.
 *
 * Nothing here resolves anything. Core stays pure, so the two functions that
 * need to know what a cited record actually is take a resolver and are given
 * the answer, rather than reaching for a database and becoming untestable.
 *
 * The audiences are the FR-DOS-002 list. Each one owns a section grammar: what
 * its sections are called, what kinds of record each section will admit, and
 * how much evidence a claim in it needs. The grammar is data rather than code
 * so the API, the compiler and the web all read the same rules, in the same
 * way the application status list is read from one place.
 */
import { z } from 'zod';
import type { NodeType } from '../types.js';
import { isoDate, isoDateTime } from './envelope.js';

export const DOSSIER_AUDIENCES = [
  'promotion_review',
  'petition_exhibits',
  'background_history',
] as const;
export const dossierAudienceSchema = z.enum(DOSSIER_AUDIENCES);
export type DossierAudience = (typeof DOSSIER_AUDIENCES)[number];

/**
 * A record a claim rests on.
 *
 * Deliberately only a kind and an id. The label a reader sees is read from the
 * live record at compile time, so a dossier cannot quietly keep asserting the
 * old title of something that was renamed. A citation whose record has since
 * been deleted is reported in the appendix as missing, which is a fact worth
 * printing, rather than dropped, which would make the claim look unsupported
 * for no stated reason.
 */
export const dossierCitationSchema = z.object({
  kind: z.enum(['node', 'atom']),
  id: z.string().min(1),
});
export type DossierCitation = z.infer<typeof dossierCitationSchema>;

export const dossierClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(600),
  cites: z.array(dossierCitationSchema).max(12),
});
export type DossierClaim = z.infer<typeof dossierClaimSchema>;

export const dossierSectionSchema = z.object({
  /** Which section of the audience's grammar this is. */
  grammar_id: z.string().min(1),
  claims: z.array(dossierClaimSchema).max(40),
});
export type DossierSection = z.infer<typeof dossierSectionSchema>;

export const dossierCreateSchema = z.object({
  subject_node: z.string().min(1),
  audience: dossierAudienceSchema,
  title: z.string().trim().min(1).max(160),
  /**
   * The period the dossier speaks to. A promotion review covers a cycle and a
   * background history covers a span of years; a dossier with no window makes
   * no claim about a period, which is different from claiming all of time.
   */
  window: z.object({ from: isoDate, to: isoDate }).optional(),
  sections: z.array(dossierSectionSchema).max(12),
  expected_rev: z.number().int().positive().optional(),
});
export type DossierCreateInput = z.infer<typeof dossierCreateSchema>;

export const dossierSchema = dossierCreateSchema.omit({ expected_rev: true }).extend({
  id: z.string(),
  tex_key: z.string().nullable().default(null),
  pdf_key: z.string().nullable().default(null),
  rev: z.number().int().positive().default(1),
  deleted_at: isoDateTime.nullable().default(null),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Dossier = z.infer<typeof dossierSchema>;

// ── The section grammars ─────────────────────────────────────────────────────

export interface DossierSectionGrammar {
  readonly id: string;
  readonly heading: string;
  /** What this section is for, shown to the operator while they select. */
  readonly purpose: string;
  /** Node types this section will admit as evidence; 'any' admits all of them. */
  readonly admits: readonly NodeType[] | 'any';
  /** Whether a résumé atom counts as evidence here. */
  readonly admitsAtoms: boolean;
  readonly minClaims: number;
  readonly maxClaims: number | null;
  readonly minCitationsPerClaim: number;
  readonly maxCitationsPerClaim: number | null;
  /** Whether the section must appear at all for the dossier to be complete. */
  readonly required: boolean;
}

/**
 * One grammar per audience. The differences between them are the point: a
 * promotion packet argues, so its claims are sentences carrying several pieces
 * of evidence; an exhibit list enumerates, so each entry is exactly one record
 * and the numbering has to mean something; a background history is checked for
 * gaps, so it admits only records that carry dates.
 */
const GRAMMAR = {
  promotion_review: [
    {
      id: 'scope',
      heading: 'Scope',
      purpose: 'What you were responsible for, and how far it reached.',
      admits: ['role', 'organization', 'project'],
      admitsAtoms: false,
      minClaims: 1,
      maxClaims: 6,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: true,
    },
    {
      id: 'impact',
      heading: 'Impact',
      purpose: 'What changed because of the work, with the numbers behind it.',
      admits: ['project', 'repository', 'publication'],
      admitsAtoms: true,
      minClaims: 2,
      maxClaims: 12,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: true,
    },
    {
      id: 'leadership',
      heading: 'Beyond your own work',
      purpose: 'Where you moved other people, teams or the wider practice.',
      admits: ['project', 'talk', 'person', 'event'],
      admitsAtoms: true,
      minClaims: 1,
      maxClaims: 8,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: false,
    },
    {
      id: 'recognition',
      heading: 'Recognition',
      purpose: 'What people outside your reporting line said, on the record.',
      admits: ['award', 'reference', 'publication', 'talk'],
      admitsAtoms: false,
      minClaims: 0,
      maxClaims: 8,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: false,
    },
  ],
  petition_exhibits: [
    {
      id: 'exhibits',
      heading: 'Exhibits',
      // One record per exhibit is not a stylistic choice. An exhibit list is
      // read by someone who has to be able to point at a single document for
      // each numbered line, and an entry citing three records makes the
      // numbering unable to refer to anything in particular.
      purpose: 'One numbered entry per document, each pointing at a single record.',
      admits: 'any',
      admitsAtoms: false,
      minClaims: 3,
      maxClaims: 40,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: 1,
      required: true,
    },
  ],
  background_history: [
    {
      id: 'residences',
      heading: 'Where you lived',
      purpose: 'Addresses and cities, in order, so a reader can see the gaps.',
      admits: ['location', 'trip'],
      admitsAtoms: false,
      minClaims: 1,
      maxClaims: 30,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: true,
    },
    {
      id: 'employment',
      heading: 'Where you worked',
      purpose: 'Every role and its employer, in order.',
      admits: ['role', 'organization'],
      admitsAtoms: false,
      minClaims: 1,
      maxClaims: 30,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: true,
    },
    {
      id: 'education',
      heading: 'What you studied',
      purpose: 'Institutions attended and qualifications earned.',
      admits: ['education', 'certification', 'course'],
      admitsAtoms: false,
      minClaims: 0,
      maxClaims: 20,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: false,
    },
    {
      id: 'travel',
      heading: 'Where you travelled',
      purpose: 'Trips outside your country of residence.',
      admits: ['trip'],
      admitsAtoms: false,
      minClaims: 0,
      maxClaims: 40,
      minCitationsPerClaim: 1,
      maxCitationsPerClaim: null,
      required: false,
    },
  ],
} satisfies Record<DossierAudience, readonly DossierSectionGrammar[]>;

/**
 * The grammars, frozen. `satisfies` above rather than a type annotation so the
 * `admits` lists keep their literal types instead of widening to string[],
 * which is what lets a typo in a node type name fail the build here rather
 * than pass silently and reject real evidence at runtime.
 */
export const DOSSIER_GRAMMAR: Readonly<Record<DossierAudience, readonly DossierSectionGrammar[]>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(GRAMMAR).map(([audience, sections]) => [audience, Object.freeze(sections)]),
    ) as Record<DossierAudience, readonly DossierSectionGrammar[]>,
  );

/** The grammar for one section of one audience, or null if the audience has no such section. */
export function dossierSectionGrammar(
  audience: DossierAudience,
  grammarId: string,
): DossierSectionGrammar | null {
  return DOSSIER_GRAMMAR[audience].find((section) => section.id === grammarId) ?? null;
}

// ── Validation ───────────────────────────────────────────────────────────────

export type DossierViolationRule =
  | 'unknown_section'
  | 'duplicate_section'
  | 'missing_required_section'
  | 'too_few_claims'
  | 'too_many_claims'
  | 'too_few_citations'
  | 'too_many_citations'
  | 'type_not_admitted'
  | 'citation_missing';

export interface DossierViolation {
  rule: DossierViolationRule;
  section: string;
  claim?: string;
  message: string;
}

/** What a citation turned out to point at. `null` means the record is gone. */
export interface ResolvedCitation {
  kind: 'node' | 'atom';
  type: string;
}

/**
 * Every way this dossier does not satisfy its audience's grammar, as a list.
 *
 * A list rather than a boolean, and every violation rather than the first,
 * because an operator fixing a packet wants to see the whole of what is
 * missing in one pass. Nothing here is a guess: each violation names the
 * section, the claim where there is one, and the rule that was broken.
 *
 * `resolve` answers what a citation points at. Returning null for a citation
 * whose record no longer exists is the honest answer and produces a
 * `citation_missing` violation; it must not be used for "I did not look".
 */
export function validateDossier(
  dossier: Pick<Dossier, 'audience' | 'sections'>,
  resolve: (citation: DossierCitation) => ResolvedCitation | null,
): DossierViolation[] {
  const violations: DossierViolation[] = [];
  const grammar = DOSSIER_GRAMMAR[dossier.audience];
  const seen = new Set<string>();

  for (const section of dossier.sections) {
    const rules = grammar.find((candidate) => candidate.id === section.grammar_id);
    if (!rules) {
      violations.push({
        rule: 'unknown_section',
        section: section.grammar_id,
        message: `A ${dossier.audience.replace(/_/g, ' ')} dossier has no section called ${section.grammar_id}.`,
      });
      continue;
    }
    if (seen.has(section.grammar_id)) {
      violations.push({
        rule: 'duplicate_section',
        section: section.grammar_id,
        message: `${rules.heading} appears more than once, so a reader cannot tell which one is the section.`,
      });
      continue;
    }
    seen.add(section.grammar_id);

    if (section.claims.length < rules.minClaims) {
      violations.push({
        rule: 'too_few_claims',
        section: rules.id,
        message: `${rules.heading} needs at least ${rules.minClaims} ${rules.minClaims === 1 ? 'entry' : 'entries'} and has ${section.claims.length}.`,
      });
    }
    if (rules.maxClaims !== null && section.claims.length > rules.maxClaims) {
      violations.push({
        rule: 'too_many_claims',
        section: rules.id,
        message: `${rules.heading} takes at most ${rules.maxClaims} entries and has ${section.claims.length}.`,
      });
    }

    for (const claim of section.claims) {
      if (claim.cites.length < rules.minCitationsPerClaim) {
        violations.push({
          rule: 'too_few_citations',
          section: rules.id,
          claim: claim.id,
          message: `This entry cites ${claim.cites.length} records and ${rules.heading} asks for at least ${rules.minCitationsPerClaim}.`,
        });
      }
      if (rules.maxCitationsPerClaim !== null && claim.cites.length > rules.maxCitationsPerClaim) {
        violations.push({
          rule: 'too_many_citations',
          section: rules.id,
          claim: claim.id,
          message: `${rules.heading} takes ${rules.maxCitationsPerClaim} record per entry and this one cites ${claim.cites.length}.`,
        });
      }
      for (const citation of claim.cites) {
        const resolved = resolve(citation);
        if (!resolved) {
          violations.push({
            rule: 'citation_missing',
            section: rules.id,
            claim: claim.id,
            message: `A cited record no longer exists, so this entry rests on evidence a reader cannot follow.`,
          });
          continue;
        }
        if (resolved.kind === 'atom') {
          if (!rules.admitsAtoms) {
            violations.push({
              rule: 'type_not_admitted',
              section: rules.id,
              claim: claim.id,
              message: `${rules.heading} does not take résumé atoms as evidence; cite the record the atom was written from.`,
            });
          }
          continue;
        }
        if (rules.admits !== 'any' && !rules.admits.includes(resolved.type as NodeType)) {
          violations.push({
            rule: 'type_not_admitted',
            section: rules.id,
            claim: claim.id,
            message: `${rules.heading} does not take a ${resolved.type} as evidence.`,
          });
        }
      }
    }
  }

  for (const rules of grammar) {
    if (rules.required && !seen.has(rules.id)) {
      violations.push({
        rule: 'missing_required_section',
        section: rules.id,
        message: `${rules.heading} is required and is not in this dossier.`,
      });
    }
  }

  return violations;
}
