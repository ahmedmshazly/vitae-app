/**
 * `vitae.graph.bundle/1`, the transfer format for importing atomic graph
 * records from an external system (today: Aperture).
 *
 * Spec: `docs/specs/vitae-graph-bundle-v1.md`. Implemented twice, here in Zod
 * and in Pydantic on the Aperture side, and pinned by a byte-identical golden
 * fixture in both repos, so the two can never drift silently.
 *
 * A bundle is a self-contained subgraph. Nodes carry a bundle-local `ref`;
 * edges point at those refs, and the importer rewrites them to real ids at
 * commit time.
 */
import { z } from 'zod';
import { edgeCreateEnvelope, nodeCreateEnvelope } from './envelope.js';

export const BUNDLE_FORMAT = 'vitae.graph.bundle';
export const BUNDLE_SCHEMA_VERSION = 1;

/** Guardrails, a bundle must fit the 15 MB `/api/v1/imports` body limit. */
export const BUNDLE_MAX_NODES = 20_000;
export const BUNDLE_MAX_EDGES = 60_000;

/** A bundle-local handle. Meaningless outside the bundle; never persisted. */
export const bundleRef = z.string().min(1).max(128);

/**
 * A node plus its bundle-local ref. `identity_keys` lives on the envelope
 * itself because it is persisted; only `ref` is bundle-only.
 */
export const bundleNodeSchema = nodeCreateEnvelope.extend({ ref: bundleRef });
export type BundleNode = z.infer<typeof bundleNodeSchema>;

/**
 * An edge whose `src`/`dst` are node refs rather than ids. The envelope already
 * types those as opaque strings, so no separate shape is needed.
 */
export const bundleEdgeSchema = edgeCreateEnvelope;
export type BundleEdge = z.infer<typeof bundleEdgeSchema>;

export const bundleSourceSchema = z.object({
  system: z.string().min(1).max(64),
  run_id: z.string().max(128).optional(),
  exported_at: z.string().datetime({ offset: true }),
});

export const graphBundleSchema = z
  .object({
    format: z.literal(BUNDLE_FORMAT),
    schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
    source: bundleSourceSchema,
    nodes: z.array(bundleNodeSchema).max(BUNDLE_MAX_NODES),
    edges: z.array(bundleEdgeSchema).max(BUNDLE_MAX_EDGES).default([]),
  })
  .superRefine((bundle, ctx) => {
    // Refs must be unique, and every edge endpoint must resolve inside the
    // bundle, an edge pointing at nothing would silently vanish at commit.
    const seen = new Set<string>();
    bundle.nodes.forEach((node, i) => {
      if (seen.has(node.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', i, 'ref'],
          message: `duplicate ref "${node.ref}"`,
        });
      }
      seen.add(node.ref);
    });
    bundle.edges.forEach((edge, i) => {
      for (const end of ['src', 'dst'] as const) {
        if (!seen.has(edge[end])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['edges', i, end],
            message: `edge ${end} "${edge[end]}" does not match any node ref in this bundle`,
          });
        }
      }
    });
  });

export type GraphBundle = z.infer<typeof graphBundleSchema>;

/**
 * Parse untrusted bundle JSON. Returns the same discriminated result shape the
 * rest of the schema layer uses (`schema/validate.ts`) so callers handle
 * failure uniformly.
 *
 * A bundle from an unrecognised `schema_version` is rejected outright rather
 * than parsed best-effort, see the spec's versioning rule.
 */
export function parseGraphBundle(
  input: unknown,
): { ok: true; value: GraphBundle } | { ok: false; errors: { path: string; message: string }[] } {
  const parsed = graphBundleSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * The Vitae document id for an externally-identified record. Deterministic, so
 * re-importing the same external record lands on the same document and the
 * repository's create-returns-existing behaviour makes the write a no-op.
 *
 * Takes the hash function as an argument to keep this package free of any
 * runtime-specific crypto import.
 */
export function externalNodeId(primaryIdentityKey: string, sha256: (s: string) => string): string {
  return `ext-${sha256(primaryIdentityKey.toLowerCase()).slice(0, 40)}`;
}
