/**
 * The common node and edge envelopes (SRS §4.2, §4.4).
 *
 * Every node shares these fields; per-type data lives in `props`, validated by a
 * per-type schema (`schema/nodes/*`). Dates are ISO strings at the domain/API
 * boundary and are converted to Firestore Timestamps in the repository layer,
 * keeping this package free of any database dependency.
 */
import { z } from 'zod';
import { EDGE_TYPES, NODE_TYPES, SOURCE_TYPES } from '../types.js';

/** `YYYY-MM-DD`. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)');

/** ISO 8601 datetime. */
export const isoDateTime = z.string().datetime({ offset: true });

export const sensitivitySchema = z.enum(['normal', 'sensitive']);
export const datePrecisionSchema = z.enum(['day', 'month', 'year']);
export const sourceSchema = z.enum(SOURCE_TYPES);
export const confidenceSchema = z.number().min(0).max(1);

/**
 * A stable identifier for this record in some external system, as
 * `<system>:<kind>:<key>`: `linkedin:person:jsmith`. Normalized to lowercase so
 * a producer's casing can never fork the derived document id. See
 * `docs/specs/vitae-graph-bundle-v1.md`.
 */
export const identityKey = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:\S+$/, 'expected "<system>:<kind>:<key>"')
  .transform((v) => v.toLowerCase());

/** Fields the caller may set when creating a node (SRS §4.2). */
export const nodeCreateEnvelope = z.object({
  type: z.enum(NODE_TYPES),
  title: z.string().min(1, 'title is required').max(500),
  subtitle: z.string().max(500).optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  /** External identities. The first is primary and derives the document id. */
  identity_keys: z.array(identityKey).max(20).default([]),
  notes_md: z.string().default(''),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  date_precision: datePrecisionSchema.default('day'),
  status: z.string().max(64).optional(),
  pinned: z.boolean().default(false),
  sensitivity: sensitivitySchema.default('normal'),
  source: sourceSchema.default('manual'),
  source_ref: z.string().max(500).optional(),
  confidence: confidenceSchema.default(1),
});

export type NodeCreateInput = z.infer<typeof nodeCreateEnvelope>;

/** System-managed fields present on a persisted node. */
export const nodeSystemFields = z.object({
  id: z.string(),
  captured_at: isoDateTime,
  created_at: isoDateTime,
  updated_at: isoDateTime,
  archived_at: isoDateTime.nullable().default(null),
  deleted_at: isoDateTime.nullable().default(null),
  merged_into: z.string().nullable().default(null),
  rev: z.number().int().nonnegative().default(0),
});

/** A fully-persisted node record. */
export const nodeSchema = nodeCreateEnvelope.merge(nodeSystemFields);
export type NodeRecord = z.infer<typeof nodeSchema>;

/** Partial update, every envelope field optional; `type` is immutable. */
export const nodeUpdateEnvelope = nodeCreateEnvelope
  .partial()
  .omit({ type: true });
export type NodeUpdateInput = z.infer<typeof nodeUpdateEnvelope>;

/** Fields the caller may set when creating an edge (SRS §4.4). */
export const edgeCreateEnvelope = z.object({
  type: z.enum(EDGE_TYPES),
  src: z.string().min(1),
  dst: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  notes_md: z.string().default(''),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  is_current: z.boolean().optional(),
  source: sourceSchema.default('manual'),
  source_ref: z.string().max(500).optional(),
  confidence: confidenceSchema.default(1),
});

export type EdgeCreateInput = z.infer<typeof edgeCreateEnvelope>;

export const edgeSchema = edgeCreateEnvelope.merge(
  z.object({
    id: z.string(),
    captured_at: isoDateTime,
    created_at: isoDateTime,
    updated_at: isoDateTime,
    archived_at: isoDateTime.nullable().default(null),
    deleted_at: isoDateTime.nullable().default(null),
    rev: z.number().int().nonnegative().default(0),
  }),
);
export type EdgeRecord = z.infer<typeof edgeSchema>;

export const edgeUpdateEnvelope = edgeCreateEnvelope
  .partial()
  .omit({ type: true, src: true, dst: true });
export type EdgeUpdateInput = z.infer<typeof edgeUpdateEnvelope>;
