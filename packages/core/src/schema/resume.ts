/**
 * Résumé subsystem schemas (SRS §4.5): atoms, variants, targets, resumes,
 * templates. These back the flagship deterministic résumé engine.
 */
import { z } from 'zod';
import { isoDate, isoDateTime } from './envelope.js';

export const atomKindSchema = z.enum([
  'achievement',
  'responsibility',
  'summary_fragment',
  'skill_line',
]);
export type AtomKind = z.infer<typeof atomKindSchema>;

export const emphasisSchema = z.enum(['technical', 'leadership', 'concise', 'detailed']);
export type Emphasis = z.infer<typeof emphasisSchema>;

export const metricSchema = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  label: z.string().optional(),
});
export type AtomMetric = z.infer<typeof metricSchema>;

export const atomEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('node'),
    node_id: z.string().min(1),
    label: z.string().trim().min(1).optional(),
  }),
  z.object({
    kind: z.literal('url'),
    url: z.string().url(),
    label: z.string().trim().min(1).optional(),
  }),
]);
export type AtomEvidence = z.infer<typeof atomEvidenceSchema>;

export const atomVariantSchema = z.object({
  id: z.string(),
  atom_id: z.string(),
  emphasis: emphasisSchema,
  text: z.string().min(1),
  is_default: z.boolean().default(false),
});
export type AtomVariant = z.infer<typeof atomVariantSchema>;

export const atomCreateSchema = z.object({
  owner_node: z.string().min(1), // → role | project node
  kind: atomKindSchema,
  metrics: z.array(metricSchema).default([]),
  evidence: z.array(atomEvidenceSchema).default([]),
  date_start: isoDate.optional(),
  date_end: isoDate.optional(),
  pinned: z.boolean().default(false),
  blocked: z.boolean().default(false),
});
export type AtomCreateInput = z.infer<typeof atomCreateSchema>;

export const atomSchema = atomCreateSchema.merge(
  z.object({
    id: z.string(),
    created_at: isoDateTime,
    updated_at: isoDateTime,
    deleted_at: isoDateTime.nullable().default(null),
  }),
);
export type Atom = z.infer<typeof atomSchema>;

/** An atom joined with its variants and skill tags, the unit the engine scores. */
export const scorableAtomSchema = atomSchema.extend({
  variants: z.array(atomVariantSchema),
  skill_ids: z.array(z.string()).default([]),
});
export type ScorableAtom = z.infer<typeof scorableAtomSchema>;

/** The complete editable atom aggregate. Child rows are replaced atomically. */
export const atomAggregateInputSchema = atomCreateSchema
  .extend({
    variants: z
      .array(
        z.object({
          id: z.string().optional(),
          emphasis: emphasisSchema,
          text: z.string().trim().min(1),
          is_default: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(4),
    skill_ids: z.array(z.string().min(1)).default([]),
    expected_rev: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const emphases = value.variants.map((variant) => variant.emphasis);
    if (new Set(emphases).size !== emphases.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'variant emphasis values must be unique',
      });
    }
    if (value.variants.filter((variant) => variant.is_default).length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'exactly one variant must be the default',
      });
    }
    if (value.date_start && value.date_end && value.date_end < value.date_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date_end'],
        message: 'date_end must be on or after date_start',
      });
    }
  });
export type AtomAggregateInput = z.infer<typeof atomAggregateInputSchema>;

export const parsedKeywordSchema = z.object({
  term: z.string().trim().min(1),
  weight: z.number(),
  sections: z.array(z.string()).default([]),
  spans: z.array(z.tuple([z.number(), z.number()])).default([]),
  skill_id: z.string().nullable().default(null),
  suggested: z.boolean().optional(),
});
export type ParsedKeyword = z.infer<typeof parsedKeywordSchema>;

export const parsedJdSchema = z.object({
  parser_version: z.string(),
  keywords: z.array(parsedKeywordSchema),
});
export type ParsedJd = z.infer<typeof parsedJdSchema>;

export const targetCreateSchema = z.object({
  company: z.string().optional(),
  company_node: z.string().optional(),
  role_title: z.string().min(1),
  jd_raw: z.string().min(1),
  jd_url: z.string().url().optional(),
});
export type TargetCreateInput = z.infer<typeof targetCreateSchema>;

export const targetSchema = targetCreateSchema.merge(
  z.object({
    id: z.string(),
    parsed: parsedJdSchema,
    status: z.enum(['saved', 'active', 'applied', 'closed']).default('saved'),
    parse_revision: z.number().int().positive().default(1),
    rev: z.number().int().positive().default(1),
    deleted_at: isoDateTime.nullable().default(null),
    created_at: isoDateTime,
    updated_at: isoDateTime,
  }),
);
export type Target = z.infer<typeof targetSchema>;

export const lineModelSchema = z.object({
  chars_per_line: z.number().positive(),
  lines_per_page: z.number().positive(),
  entry_overhead: z.number().nonnegative(),
  section_overhead: z.number().nonnegative(),
});
export type LineModel = z.infer<typeof lineModelSchema>;

export const templateSchema = z.object({
  key: z.string(),
  version: z.string(),
  name: z.string(),
  engine: z.literal('tectonic'),
  ats_strict: z.boolean(),
  line_model: lineModelSchema,
  description: z.string().optional(),
  traits: z.array(z.string()).default([]),
  page_size: z.string().default('Letter'),
  accent_options: z.array(z.string()).default([]),
});
export type Template = z.infer<typeof templateSchema>;

export const resumeConfigSchema = z.object({
  section_order: z.array(z.string()).default(['summary', 'experience', 'education', 'skills']),
  budget_lines: z.number().positive().default(54),
  emphasis: emphasisSchema.default('technical'),
  contact_block: z.record(z.string(), z.unknown()).default({}),
  headline: z.string().optional(),
  summary: z.string().optional(),
  accent: z.string().optional(),
  /** Per-atom wording emphasis overrides used when this résumé was finalized. */
  variant_by_atom: z.record(z.string(), emphasisSchema).default({}),
});
export type ResumeConfig = z.infer<typeof resumeConfigSchema>;

export const resumeSchema = z.object({
  id: z.string(),
  target_id: z.string(),
  template_key: z.string(),
  template_version: z.string().optional(),
  name: z.string(),
  config: resumeConfigSchema,
  selection: z.record(z.string(), z.unknown()).default({}),
  tex_key: z.string().nullable().default(null),
  pdf_key: z.string().nullable().default(null),
  extracted_text: z.string().nullable().default(null),
  coverage: z.record(z.string(), z.unknown()).nullable().default(null),
  pages: z.number().int().nullable().default(null),
  status: z.enum(['draft', 'final', 'sent']).default('draft'),
  sent_at: isoDateTime.nullable().default(null),
  deleted_at: isoDateTime.nullable().default(null),
  target_snapshot: z.record(z.string(), z.unknown()).default({}),
  base_resume_id: z.string().nullable().default(null),
  base_diff: z.record(z.string(), z.unknown()).nullable().default(null),
  artifact_ids: z.object({ pdf: z.string().optional(), tex: z.string().optional() }).default({}),
  artifact_hashes: z.object({ pdf: z.string().optional(), tex: z.string().optional() }).default({}),
  source_date_epoch: z.number().int().optional(),
  rev: z.number().int().positive().default(1),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Resume = z.infer<typeof resumeSchema>;

/** Cover-letter block (FR-RES-020), hook/body/closer from text and/or an atom. */
export const letterBlockSchema = z
  .object({
    kind: z.enum(['hook', 'body', 'closer']),
    atom_id: z.string().min(1).optional(),
    text: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.atom_id && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'each block needs atom_id and/or text',
      });
    }
  });
export type LetterBlock = z.infer<typeof letterBlockSchema>;

export const letterStatusSchema = z.enum(['draft', 'final', 'sent']);
export type LetterStatus = z.infer<typeof letterStatusSchema>;

/** Writable cover-letter aggregate, generation UI at `/resume/letters` (FR-RES-020). */
export const letterCreateSchema = z.object({
  target_id: z.string().min(1),
  resume_id: z.string().min(1).optional(),
  blocks: z.array(letterBlockSchema).min(1).max(24),
  status: letterStatusSchema.default('draft'),
  expected_rev: z.number().int().positive().optional(),
});
export type LetterCreateInput = z.infer<typeof letterCreateSchema>;

export const letterSchema = letterCreateSchema
  .omit({ expected_rev: true })
  .extend({
    id: z.string(),
    tex_key: z.string().nullable().default(null),
    pdf_key: z.string().nullable().default(null),
    rev: z.number().int().positive().default(1),
    deleted_at: isoDateTime.nullable().default(null),
    created_at: isoDateTime,
    updated_at: isoDateTime,
  });
export type Letter = z.infer<typeof letterSchema>;
