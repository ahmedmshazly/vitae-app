/** Source-independent knowledge, identity and reconciliation contracts. */
import { z } from 'zod';
import type { EdgeCreateInput, NodeRecord } from './schema/envelope.js';

const timestamp = z.string().datetime({ offset: true });
const dateOrTimestamp = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || timestamp.safeParse(value).success,
    'expected an ISO date or timestamp',
  );

export const sourceReferenceSchema = z.object({
  source_id: z.string().min(1).max(200),
  record_id: z.string().min(1).max(300),
  external_id: z.string().min(1).max(500),
  locator: z.string().min(1).max(1000),
  content_hash: z.string().min(16).max(128),
  excerpt: z.string().max(160).optional(),
  attachment_id: z.string().max(500).optional(),
});
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const sourceConnectionSchema = z.object({
  id: z.string().min(1).max(200),
  system: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  account_node_id: z.string().optional(),
  location: z.string().max(2000).optional(),
  imported_at: timestamp,
  coverage: z.object({
    from: timestamp.nullable(),
    to: timestamp.nullable(),
    records: z.number().int().nonnegative(),
    complete: z.boolean().default(false),
    limitations: z.array(z.string().max(500)).default([]),
  }),
  rules: z
    .object({
      self_addresses: z.array(z.string().email()).default([]),
      excluded_addresses: z.array(z.string()).default([]),
      excluded_domains: z.array(z.string()).default([]),
      sensitive_categories: z.array(z.string()).default([]),
    })
    .default({}),
  metadata: z.record(z.unknown()).default({}),
});
export type SourceConnection = z.infer<typeof sourceConnectionSchema>;

export const importRunSchema = z.object({
  id: z.string().min(1).max(200),
  source_id: z.string().min(1).max(200),
  status: z.enum([
    'inspecting',
    'extracting',
    'reconciling',
    'review',
    'applied',
    'failed',
    'rolled_back',
  ]),
  started_at: timestamp,
  finished_at: timestamp.nullable().default(null),
  checkpoint: z.string().max(1000).nullable().default(null),
  coverage: z
    .object({
      examined: z.number().int().nonnegative().default(0),
      extracted: z.number().int().nonnegative().default(0),
      skipped: z.number().int().nonnegative().default(0),
      failed: z.number().int().nonnegative().default(0),
      complete: z.boolean().default(false),
    })
    .default({}),
  limitations: z.array(z.string().max(1000)).default([]),
  error: z.string().max(4000).nullable().default(null),
  options: z.record(z.unknown()).default({}),
});
export type ImportRun = z.infer<typeof importRunSchema>;

export const sourceRecordSchema = z.object({
  id: z.string().min(1).max(300),
  source_id: z.string().min(1).max(200),
  run_id: z.string().min(1).max(200),
  external_id: z.string().min(1).max(500),
  kind: z.enum(['message', 'attachment', 'contact', 'setting', 'issue', 'file', 'record']),
  title: z.string().max(1000),
  occurred_at: timestamp.nullable(),
  learned_at: timestamp,
  thread_key: z.string().max(500).nullable().default(null),
  category: z.string().max(80).default('unknown'),
  direction: z.enum(['in', 'out', 'self', 'unknown']).default('unknown'),
  participant_addresses: z.array(z.string()).default([]),
  content_hash: z.string().min(16).max(128),
  locator: z.string().max(1000),
  /** Compact parsed metadata only. Full message bodies never belong here. */
  data: z.record(z.unknown()).default({}),
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const evidenceAssertionSchema = z.object({
  id: z.string().min(1).max(300),
  run_id: z.string().min(1).max(200),
  subject_id: z.string().min(1),
  subject_kind: z.enum(['node', 'edge', 'atom', 'dossier_claim']),
  field: z
    .string()
    .regex(
      /^(\$record|\$relationship|title|subtitle|start_date|end_date|props\.[a-zA-Z][a-zA-Z0-9_.]*)$/,
    ),
  value: z.unknown(),
  citation: sourceReferenceSchema,
  basis: z.enum(['explicit', 'inferred', 'manual']),
  confidence: z.number().min(0).max(1),
  status: z.enum(['proposed', 'accepted', 'rejected', 'conflict', 'superseded']),
  observed_at: timestamp,
  valid_from: dateOrTimestamp.nullable().default(null),
  valid_to: dateOrTimestamp.nullable().default(null),
  reviewed_at: timestamp.nullable().default(null),
  reviewed_by: z.string().optional(),
  reason: z.string().max(2000).default(''),
  applied_revision: z.number().int().positive().optional(),
});
export type EvidenceAssertion = z.infer<typeof evidenceAssertionSchema>;

export const sourceIdentitySchema = z.object({
  id: z.string().min(1).max(300),
  source_id: z.string().min(1).max(200),
  entity_id: z.string().min(1),
  entity_kind: z.enum(['person', 'organization', 'shared_mailbox', 'service_account', 'other']),
  scheme: z.string().min(1).max(80),
  value: z.string().min(1).max(1000),
  normalized_value: z.string().min(1).max(1000),
  verified: z.boolean().default(false),
  is_self: z.boolean().default(false),
  created_at: timestamp,
});
export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;

export const reconciliationDecisionSchema = z.object({
  id: z.string().min(1).max(300),
  run_id: z.string().min(1).max(200),
  assertion_id: z.string().min(1).max(300).optional(),
  kind: z.enum(['apply', 'reject', 'defer', 'link_identity', 'create_entity', 'merge_entities']),
  target_id: z.string().optional(),
  reason: z.string().min(1).max(2000),
  automatic: z.boolean().default(false),
  decided_at: timestamp,
  decided_by: z.string().optional(),
  expected_revision: z.number().int().nonnegative().optional(),
  changes: z
    .array(
      z.object({
        subject_kind: z.enum(['node', 'edge']),
        subject_id: z.string().min(1),
        field: z.string().min(1),
        before: z.unknown().optional(),
        after: z.unknown().optional(),
        applied_revision: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  reversed_at: timestamp.nullable().default(null),
});
export type ReconciliationDecision = z.infer<typeof reconciliationDecisionSchema>;

export const entityRedirectSchema = z.object({
  id: z.string().min(1),
  from_id: z.string().min(1),
  to_id: z.string().min(1),
  merge_id: z.string().min(1),
  created_at: timestamp,
  reversed_at: timestamp.nullable().default(null),
});
export type EntityRedirect = z.infer<typeof entityRedirectSchema>;

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}
function normalizedIdentity(key: string): string {
  const [scheme, kind, ...rest] = key.split(':');
  return `${scheme?.toLowerCase()}:${kind?.toLowerCase()}:${rest.join(':').trim().toLowerCase()}`;
}

/** Explicit identifiers only. Names and contextual similarity stay candidates. */
export function entityIdentityKeys(
  node: Pick<NodeRecord, 'type' | 'props' | 'identity_keys'>,
): string[] {
  const keys = new Set((node.identity_keys ?? []).map(normalizedIdentity));
  const props = node.props as Record<string, unknown>;
  if (node.type === 'person' && Array.isArray(props.emails))
    for (const email of props.emails)
      if (typeof email === 'string' && email.includes('@'))
        keys.add(`email:person:${normalizedEmail(email)}`);
  if (node.type === 'organization' && typeof props.domain === 'string' && props.domain.trim())
    keys.add(
      `domain:organization:${props.domain
        .trim()
        .toLowerCase()
        .replace(/^www\./, '')}`,
    );
  if (node.type === 'repository' && typeof props.full_name === 'string' && props.full_name.trim())
    keys.add(`repository:full_name:${props.full_name.trim().toLowerCase()}`);
  if (node.type === 'publication' && typeof props.doi === 'string' && props.doi.trim())
    keys.add(
      `doi:publication:${props.doi
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')}`,
    );
  if (
    node.type === 'certification' &&
    typeof props.credential_id === 'string' &&
    props.credential_id.trim()
  )
    keys.add(`credential:certification:${props.credential_id.trim().toLowerCase()}`);
  return [...keys].sort();
}

export function resolveEntityIdentity(
  incoming: Pick<NodeRecord, 'type' | 'props' | 'identity_keys'>,
  existing: readonly NodeRecord[],
): {
  status: 'matched' | 'ambiguous' | 'new';
  candidates: string[];
  keys: string[];
  conflicts: string[];
} {
  const keys = entityIdentityKeys(incoming);
  const owners = new Map<string, string[]>();
  for (const node of existing) {
    if (node.deleted_at || node.merged_into || node.type !== incoming.type) continue;
    for (const key of entityIdentityKeys(node))
      if (keys.includes(key)) owners.set(key, [...(owners.get(key) ?? []), node.id]);
  }
  const candidates = [...new Set([...owners.values()].flat())].sort();
  const conflicts = [...owners.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([key]) => key);
  return {
    status:
      candidates.length === 1 && !conflicts.length
        ? 'matched'
        : candidates.length
          ? 'ambiguous'
          : 'new',
    candidates,
    keys,
    conflicts,
  };
}

const empty = (value: unknown): boolean =>
  value == null || value === '' || (Array.isArray(value) && !value.length);
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export function reconcileField(
  current: unknown,
  incoming: unknown,
): { status: 'unchanged' | 'complement' | 'conflict'; value: unknown } {
  if (empty(incoming) || equal(current, incoming)) return { status: 'unchanged', value: current };
  if (empty(current)) return { status: 'complement', value: incoming };
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const value = [...current];
    for (const item of incoming)
      if (
        !value.some((old) =>
          typeof old === 'string' && typeof item === 'string'
            ? old.trim().toLowerCase() === item.trim().toLowerCase()
            : equal(old, item),
        )
      )
        value.push(item);
    return { status: value.length === current.length ? 'unchanged' : 'complement', value };
  }
  return { status: 'conflict', value: incoming };
}

export function relationshipEpisodeKey(
  edge: Pick<EdgeCreateInput, 'type' | 'src' | 'dst' | 'start_date' | 'end_date' | 'source_ref'>,
): string {
  return [
    edge.type,
    edge.src,
    edge.dst,
    edge.start_date ?? '',
    edge.end_date ?? '',
    edge.source_ref ?? '',
  ].join('|');
}

export interface KnowledgeSummary {
  sources: number;
  runs: number;
  records: number;
  messages: number;
  attachments: number;
  linked_entities: number;
  pending: number;
  conflicts: number;
  inbound: number;
  outbound: number;
  human_messages: number;
  career_messages: number;
  first_at: string | null;
  last_at: string | null;
  months: Array<{ month: string; inbound: number; outbound: number; total: number }>;
}
