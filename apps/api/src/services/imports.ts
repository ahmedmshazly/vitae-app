/**
 * Import pipeline (SRS FR-IMP): everything stages, nothing commits without
 * review, everything rolls back by batch.
 *
 *   stage:    parse the uploaded text with the @vitae/core importers, run each
 *             row through dedup against existing records, persist batch + rows.
 *   commit:   create nodes/edges/atoms for accepted rows in one pass, every
 *             record tagged source:'import_*' and source_ref:<batchId>.
 *   rollback: soft-delete everything carrying the batch's source_ref, and purge
 *             the raw upload (FR-006: rollback and discard are deletions).
 *   github:   direct sync (no staging): repos → repository nodes, languages →
 *             USES_SKILL edges; ETag-incremental.
 */
import { createHash } from 'node:crypto';
import {
  comparePersons,
  compareEntities,
  externalNodeId,
  parseGraphBundle,
  parseIcs,
  parseCsvRecords,
  parseLinkedInConnections,
  parseLinkedInEducation,
  parseLinkedInPositions,
  parseLinkedInSkills,
  parseNetscapeBookmarks,
  parseVcards,
  pickField,
  scorePair,
  normalizeForMatch,
  trigramSimilarity,
  type BundleEdge,
  type BundleNode,
  type NodeRecord,
  type PairScore,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { getSelf } from './self.js';
import { getSettings, githubToken, patchSettings } from './settings.js';
import { fetchWithDeadline } from './http.js';
import { loadGraph } from './crm.js';
import { emailDomains, invalidateDuplicateScan, orgNamesByPerson } from './duplicates.js';

export type ImportKind = 'linkedin' | 'contacts' | 'calendar' | 'bookmarks' | 'resume' | 'aperture';
/**
 * `graph_node` is a pre-shaped node from a `vitae.graph.bundle`, the producer
 * has already decided its type and props, so it needs no per-format mapping and
 * carries its own bundle-local `ref` for the edge pass at commit.
 */
export type RowEntity =
  | 'person'
  | 'role'
  | 'education'
  | 'skill'
  | 'event'
  | 'link'
  | 'atom'
  | 'graph_node';

export interface DupInfo {
  nodeId: string;
  nodeTitle: string;
  weight: number;
  verdict: 'possible' | 'probable';
  evidence: string[];
}

export interface StagedRow {
  id: string;
  index: number;
  entity: RowEntity;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
  confidence: number;
  dup: DupInfo | null;
  /** Bundle-local handle; edges are resolved against it at commit. */
  ref?: string | null;
  /** Destination node type for `graph_node` rows. */
  node_type?: string | null;
  /** accept → will be created on commit; skip → ignored. */
  decision: 'accept' | 'skip';
  status: 'staged' | 'committed';
}

export interface ImportBatch {
  id: string;
  kind: ImportKind | 'github';
  detail: string | null;
  filename: string | null;
  status: 'staged' | 'committed' | 'discarded' | 'rolled_back';
  created_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
  stats: { rows: number; accepted: number; dupCandidates: number; created?: number };
}

const SOURCE_BY_KIND: Record<ImportKind, string> = {
  linkedin: 'import_linkedin',
  contacts: 'import_vcard',
  calendar: 'import_ics',
  bookmarks: 'import_bookmarks',
  resume: 'parse_resume',
  aperture: 'import_aperture',
};

// ── Parsing to staged rows ────────────────────────────────────────────────────

interface ParsedRow {
  entity: RowEntity;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
  confidence: number;
  ref?: string | null;
  nodeType?: string | null;
}

/** Which LinkedIn export file is this? Decided by header shape. */
function detectLinkedInFile(content: string): 'positions' | 'education' | 'skills' | 'connections' | null {
  const head = content.slice(0, 2000).toLowerCase();
  if (/first name/.test(head) && /last name/.test(head)) return 'connections';
  if (/company name|companyname/.test(head) && /title/.test(head)) return 'positions';
  if (/school name/.test(head)) return 'education';
  if (/^"?name"?\s*$/m.test(content.split(/\r?\n/, 1)[0] ?? '')) return 'skills';
  return null;
}

/** Optional column mapping for generic contact CSVs (normalized header names). */
export interface CsvMapping {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
}

function parseContent(
  kind: ImportKind,
  content: string,
  mapping?: CsvMapping,
): { rows: ParsedRow[]; detail: string | null; edges: BundleEdge[] } {
  if (kind === 'aperture') return parseApertureBundle(content);
  const { rows, detail } = parseNonBundleContent(kind, content, mapping);
  return { rows, detail, edges: [] };
}

/** The upload is readable, but its contents do not satisfy the selected importer. */
export class ImportContentError extends Error {}

/**
 * A `vitae.graph.bundle` is already in the destination's own shape, the
 * producer chose each node's type and props, so "parsing" is validation plus a
 * rename into staging rows. The edges ride alongside and are applied once every
 * node has a real id.
 */
function parseApertureBundle(content: string): { rows: ParsedRow[]; detail: string | null; edges: BundleEdge[] } {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new ImportContentError('not valid JSON: expected a vitae.graph.bundle export');
  }
  const parsed = parseGraphBundle(json);
  if (!parsed.ok) {
    const summary = parsed.errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new ImportContentError(`not a valid vitae.graph.bundle: ${summary}`);
  }
  const bundle = parsed.value;
  return {
    detail: bundle.source.run_id ? `${bundle.source.system} run ${bundle.source.run_id.slice(0, 8)}` : bundle.source.system,
    edges: bundle.edges,
    rows: bundle.nodes.map((node) => ({
      entity: 'graph_node' as const,
      title: node.title,
      subtitle: node.subtitle ?? null,
      payload: node as unknown as Record<string, unknown>,
      confidence: node.confidence,
      ref: node.ref,
      nodeType: node.type,
    })),
  };
}

function parseNonBundleContent(
  kind: Exclude<ImportKind, 'aperture'>,
  content: string,
  mapping?: CsvMapping,
): { rows: ParsedRow[]; detail: string | null } {
  switch (kind) {
    case 'linkedin': {
      const file = detectLinkedInFile(content);
      if (file === 'connections') {
        return {
          detail: 'connections',
          rows: parseLinkedInConnections(content).map((c) => ({
            entity: 'person' as const,
            title: c.fullName,
            subtitle: [c.position, c.company].filter(Boolean).join(' · ') || null,
            payload: {
              emails: c.email ? [c.email] : [],
              headline: [c.position, c.company].filter(Boolean).join(' @ ') || undefined,
              company: c.company ?? undefined,
              linkedin: c.url ?? undefined,
              connectedOn: c.connectedOn ?? undefined,
            },
            confidence: 0.9,
          })),
        };
      }
      if (file === 'positions') {
        return {
          detail: 'positions',
          rows: parseLinkedInPositions(content).map((p) => ({
            entity: 'role' as const,
            title: p.title || `Role at ${p.company}`,
            subtitle: p.company || null,
            payload: { company: p.company, description: p.description, city: p.location, start: p.start, end: p.end },
            confidence: 0.9,
          })),
        };
      }
      if (file === 'education') {
        return {
          detail: 'education',
          rows: parseLinkedInEducation(content).map((e) => ({
            entity: 'education' as const,
            title: e.school,
            subtitle: e.degree,
            payload: { degree: e.degree, notes: e.notes, start: e.start, end: e.end },
            confidence: 0.9,
          })),
        };
      }
      if (file === 'skills') {
        return {
          detail: 'skills',
          rows: parseLinkedInSkills(content).map((s) => ({
            entity: 'skill' as const,
            title: s,
            subtitle: null,
            payload: {},
            confidence: 0.95,
          })),
        };
      }
      return { detail: null, rows: [] };
    }

    case 'contacts': {
      if (/BEGIN:VCARD/i.test(content)) {
        return {
          detail: 'vcard',
          rows: parseVcards(content).map((c) => ({
            entity: 'person' as const,
            title: c.fullName,
            subtitle: [c.title, c.org].filter(Boolean).join(' · ') || null,
            payload: {
              emails: c.emails,
              phones: c.phones,
              headline: [c.title, c.org].filter(Boolean).join(' @ ') || undefined,
              city: c.city ?? undefined,
              urls: c.urls,
              note: c.note ?? undefined,
              birthday: c.bday ?? undefined,
            },
            confidence: c.confidence,
          })),
        };
      }
      // Generic contacts CSV, explicit column mapping wins over the guesses.
      return {
        detail: 'csv',
        rows: parseCsvRecords(content)
          .map((r) => {
            const name =
              (mapping?.name && r[mapping.name]) ||
              pickField(r, 'name', 'full_name', 'display_name') ||
              [pickField(r, 'first_name', 'given_name'), pickField(r, 'last_name', 'family_name')].filter(Boolean).join(' ');
            const email = ((mapping?.email && r[mapping.email]) || pickField(r, 'email', 'email_address', 'e_mail_1_value', 'e_mail_address')).toLowerCase();
            const company = (mapping?.company && r[mapping.company]) || pickField(r, 'organization', 'company', 'organization_1_name');
            return {
              entity: 'person' as const,
              title: name,
              subtitle: company || null,
              payload: {
                emails: email ? [email] : [],
                phones: [(mapping?.phone && r[mapping.phone]) || pickField(r, 'phone', 'phone_1_value', 'mobile')].filter(Boolean),
                city: ((mapping?.city && r[mapping.city]) || pickField(r, 'city', 'address_1_city')) || undefined,
                headline: pickField(r, 'title', 'position', 'job_title', 'organization_1_title') || undefined,
                company: company || undefined,
              },
              confidence: name ? 0.85 : 0.3,
            };
          })
          .filter((r) => r.title),
      };
    }

    case 'calendar':
      return {
        detail: null,
        rows: parseIcs(content).map((e) => ({
          entity: 'event' as const,
          title: e.summary,
          subtitle: e.location,
          payload: {
            start: e.start,
            end: e.end,
            venue: e.location ?? undefined,
            description: e.description ?? undefined,
            rrule: e.rrule ?? undefined,
            attendees: e.attendees,
            uid: e.uid ?? undefined,
          },
          confidence: e.confidence,
        })),
      };

    case 'bookmarks':
      return {
        detail: null,
        rows: parseNetscapeBookmarks(content).map((b) => ({
          entity: 'link' as const,
          title: b.title,
          subtitle: safeDomain(b.url) ?? null,
          payload: { url: b.url, tags: [...b.folders, ...b.tags], addedAt: b.addedAt ?? undefined },
          confidence: 1,
        })),
      };

    case 'resume': {
      // Disassembly: candidate atom lines, bullets and substantial sentences.
      const lines = content
        .split(/\r?\n/)
        .map((l) => l.replace(/^[\s•\-–—*·▪]+/, '').trim())
        .filter((l) => l.length >= 20 && l.split(/\s+/).length >= 4);
      return {
        detail: null,
        rows: lines.map((text) => ({
          entity: 'atom' as const,
          title: text.length > 90 ? `${text.slice(0, 89)}…` : text,
          subtitle: null,
          payload: { text, kind: 'achievement' },
          confidence: 0.7,
        })),
      };
    }
  }
}

// ── Dedup against existing records ───────────────────────────────────────────

function evidenceFrom(score: PairScore, extra: string[] = []): string[] {
  const labels: Record<string, string> = {
    email: 'email match',
    name_trigram: 'name similar',
    org_domain: 'shared org domain',
    shared_event: 'shared event',
    phone: 'phone match',
  };
  return [
    ...score.breakdown.filter((b) => b.weight > 0.5).map((b) => (b.similarity >= 0.99 ? labels[b.field]!.replace('similar', 'exact') : labels[b.field] ?? b.field)),
    ...extra,
  ];
}

function checkPersonDup(row: ParsedRow, persons: NodeRecord[], personOrgs: Map<string, string[]>): DupInfo | null {
  const payload = row.payload as { emails?: string[]; phones?: string[]; company?: string };
  const rowEmails = payload.emails ?? [];
  const rowOrgs = [...emailDomains(rowEmails), ...(payload.company ? [normalizeForMatch(payload.company)] : [])];
  let best: DupInfo | null = null;
  for (const p of persons) {
    const props = p.props as Record<string, unknown>;
    const pEmails = (props.emails as string[]) ?? [];
    const score = scorePair(
      comparePersons(
        { title: row.title, emails: rowEmails, phones: payload.phones ?? [], orgDomains: rowOrgs },
        {
          title: p.title,
          emails: pEmails,
          phones: (props.phones as string[]) ?? [],
          orgDomains: [...emailDomains(pEmails), ...(personOrgs.get(p.id) ?? [])],
        },
      ),
    );
    if (score.verdict === 'non_match') continue;
    if (!best || score.weight > best.weight) {
      best = { nodeId: p.id, nodeTitle: p.title, weight: score.weight, verdict: score.verdict, evidence: evidenceFrom(score) };
    }
  }
  return best;
}

/**
 * The comparison values these rules need, from either a legacy importer payload
 * (flat keys) or a bundle node (the same facts live under `props`).
 */
function dupFacts(row: ParsedRow): { url?: string; start?: string; company?: string } {
  const p = row.payload as Record<string, unknown>;
  const props = (p.props as Record<string, unknown> | undefined) ?? {};
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  return {
    url: str(p.url) ?? str(props.url),
    start: str(p.start) ?? str(p.start_date),
    company: str(p.company) ?? str(row.subtitle ?? undefined),
  };
}

/**
 * Exact/near duplicates for non-person entities (URL, title+date, name).
 *
 * Keyed on the destination *node type*, not on the row's entity label: bundle
 * rows all carry the label `graph_node`, so matching on the label silently
 * disabled every rule here for them and let re-imports duplicate keyless
 * records.
 */
function checkSimpleDup(row: ParsedRow, existing: NodeRecord[], nodeType: string): DupInfo | null {
  const facts = dupFacts(row);
  let best: DupInfo | null = null;
  for (const n of existing) {
    const props = n.props as Record<string, unknown>;
    if (nodeType === 'link' && props.url && props.url === facts.url) {
      return { nodeId: n.id, nodeTitle: n.title, weight: 99, verdict: 'probable', evidence: ['same URL'] };
    }
    if (nodeType === 'event') {
      if (normalizeForMatch(n.title) === normalizeForMatch(row.title) && (!facts.start || n.start_date === facts.start)) {
        return { nodeId: n.id, nodeTitle: n.title, weight: 20, verdict: 'probable', evidence: ['same title & date'] };
      }
    }
    if (nodeType === 'skill' || nodeType === 'education') {
      if (normalizeForMatch(n.title) === normalizeForMatch(row.title)) {
        return { nodeId: n.id, nodeTitle: n.title, weight: 20, verdict: 'probable', evidence: ['same name'] };
      }
      if (nodeType === 'skill' && trigramSimilarity(n.title, row.title) > 0.85) {
        return { nodeId: n.id, nodeTitle: n.title, weight: 10, verdict: 'possible', evidence: ['name similar'] };
      }
    }
    if (nodeType === 'role') {
      const company = facts.company ?? '';
      if (normalizeForMatch(n.title) === normalizeForMatch(row.title) && (!company || normalizeForMatch(n.subtitle ?? '').includes(normalizeForMatch(company)))) {
        return { nodeId: n.id, nodeTitle: n.title, weight: 15, verdict: 'possible', evidence: ['same title'] };
      }
    }
    if (n.type === nodeType) {
      const payload = row.payload as Record<string, unknown>;
      const nestedProps = (payload.props as Record<string, unknown> | undefined) ?? payload;
      const generic = compareEntities(
        {
          type: n.type,
          title: row.title,
          subtitle: row.subtitle,
          props: nestedProps,
          start_date: facts.start,
          identity_keys: (payload.identity_keys as string[] | undefined) ?? [],
        },
        {
          type: n.type,
          title: n.title,
          subtitle: n.subtitle,
          props: n.props as Record<string, unknown>,
          start_date: n.start_date,
          identity_keys: n.identity_keys,
        },
      );
      if (generic.verdict !== 'non_match' && (!best || generic.score > best.weight)) {
        best = {
          nodeId: n.id,
          nodeTitle: n.title,
          weight: generic.score,
          verdict: generic.verdict,
          evidence: generic.signals.filter((signal) => signal.weight > 0).map((signal) => signal.label).slice(0, 4),
        };
      }
    }
  }
  return best;
}

const ENTITY_NODE_TYPE: Record<Exclude<RowEntity, 'atom' | 'graph_node'>, string> = {
  person: 'person',
  role: 'role',
  education: 'education',
  skill: 'skill',
  event: 'event',
  link: 'link',
};

// ── Staging ───────────────────────────────────────────────────────────────────

// Bound chunks so one malformed import cannot turn a staging write into an
// unexpectedly large database payload.
const RAW_CHUNK_CODE_UNITS = 200_000;

/**
 * Duplicate check for a bundle node.
 *
 * An exact external-identity match beats every fuzzy signal: `linkedin:person:x`
 * naming an existing record is a fact, not a score, so it short-circuits the
 * Fellegi-Sunter comparison entirely (which is also much cheaper across a large
 * bundle). Only keyless nodes fall through to name-based matching.
 */
function checkGraphNodeDup(
  row: ParsedRow,
  byIdentityKey: Map<string, NodeRecord>,
  byType: Map<string, NodeRecord[]>,
  personOrgs: Map<string, string[]>,
): DupInfo | null {
  const node = row.payload as unknown as BundleNode;
  for (const key of node.identity_keys) {
    const hit = byIdentityKey.get(key);
    if (hit) {
      return {
        nodeId: hit.id,
        nodeTitle: hit.title,
        weight: 1,
        verdict: 'probable',
        evidence: [`same external identity (${key})`],
      };
    }
  }
  const candidates = byType.get(node.type) ?? [];
  if (node.type === 'person') return checkPersonDup(row, candidates, personOrgs);
  return checkSimpleDup(row, candidates, node.type);
}

function rawChunks(content: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < content.length; start += RAW_CHUNK_CODE_UNITS) {
    let end = Math.min(start + RAW_CHUNK_CODE_UNITS, content.length);
    // Do not split a surrogate pair; this preserves the upload byte-for-byte
    // when chunks are concatenated.
    if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1]!)) end -= 1;
    chunks.push(content.slice(start, end));
    start = end - RAW_CHUNK_CODE_UNITS;
  }
  return chunks;
}

async function purgeRawImport(batchId: string): Promise<void> {
  const chunkIds = await repository.docIdsWhereIn('import_raw_chunks', 'import_id', [batchId]);
  await repository.docDeleteMany('import_raw_chunks', chunkIds);
  // FR-006 is a deletion promise, so the raw fields are removed rather than
  // nulled, including on pre-chunking imports that stored raw_content inline.
  const batch = await repository.docGet<Record<string, unknown>>('imports', batchId);
  if (!batch) return;
  const { raw_content: _c, raw_chunk_count: _n, raw_bytes: _b, ...kept } = batch;
  await repository.docPut('imports', batchId, { ...kept, raw_purged_at: nowIso() });
}

export async function stageImport(
  kind: ImportKind,
  filename: string | null,
  content: string,
  mapping?: CsvMapping,
): Promise<{ batch: ImportBatch; rows: StagedRow[] }> {
  const { rows: parsed, detail, edges } = parseContent(kind, content, mapping);
  const graph = await loadGraph();
  const byType = new Map<string, NodeRecord[]>();
  for (const n of graph.nodes.values()) (byType.get(n.type) ?? byType.set(n.type, []).get(n.type)!).push(n);
  const personOrgs = orgNamesByPerson(graph);
  const byIdentityKey = new Map<string, NodeRecord>();
  for (const n of graph.nodes.values()) {
    for (const key of n.identity_keys ?? []) if (!byIdentityKey.has(key)) byIdentityKey.set(key, n);
  }

  const rows: StagedRow[] = parsed.map((r, index) => {
    const dup =
      r.entity === 'graph_node'
        ? checkGraphNodeDup(r, byIdentityKey, byType, personOrgs)
        : r.entity === 'person'
          ? checkPersonDup(r, byType.get('person') ?? [], personOrgs)
          : r.entity === 'atom'
            ? null
            : checkSimpleDup(r, byType.get(ENTITY_NODE_TYPE[r.entity]) ?? [], ENTITY_NODE_TYPE[r.entity]);
    return {
      id: newId(),
      index,
      entity: r.entity,
      title: r.title,
      subtitle: r.subtitle,
      payload: r.payload,
      confidence: r.confidence,
      dup,
      ref: r.ref ?? null,
      node_type: r.nodeType ?? null,
      // Probable duplicates default to skip; everything else to accept.
      decision: dup?.verdict === 'probable' ? 'skip' : 'accept',
      status: 'staged',
    };
  });

  const batch: ImportBatch = {
    id: newId(),
    kind,
    detail,
    filename,
    status: 'staged',
    created_at: nowIso(),
    committed_at: null,
    rolled_back_at: null,
    stats: {
      rows: rows.length,
      accepted: rows.filter((r) => r.decision === 'accept').length,
      dupCandidates: rows.filter((r) => r.dup).length,
    },
  };

  // The raw upload stays chunked even though jsonb has no ~1 MiB document
  // ceiling: `import_raw_chunks` is part of the export bundle's schema, and
  // changing its shape would break restores of existing backups.
  const chunks = rawChunks(content);
  await repository.docPut('imports', batch.id, {
    ...batch,
    raw_chunk_count: chunks.length,
    raw_bytes: Buffer.byteLength(content, 'utf8'),
    // Bundle edges live on the batch, not on rows: they belong to no single row
    // and are only resolvable once every accepted node has an id.
    bundle_edges: edges,
  } as unknown as Record<string, unknown>);
  await repository.docBulkPut(
    'import_raw_chunks',
    chunks.map((data, index) => ({
      id: String(index).padStart(6, '0'),
      data: { index, data },
      extra: { import_id: batch.id },
    })),
  );
  await repository.docBulkPut(
    'import_rows',
    rows.map((row) => ({
      id: row.id,
      data: row as unknown as Record<string, unknown>,
      extra: { import_id: batch.id },
    })),
  );
  return { batch, rows };
}

export async function getBatch(id: string): Promise<{ batch: ImportBatch; rows: StagedRow[] } | null> {
  const doc = await repository.docGet<ImportBatch & { raw_content?: string; bundle_edges?: BundleEdge[] }>(
    'imports',
    id,
  );
  if (!doc) return null;
  // `bundle_edges` is stripped alongside `raw_content`: both are commit-time
  // inputs, and a large bundle's edge list has no business in a review payload.
  const { raw_content: _raw, bundle_edges: _edges, ...batch } = doc;
  const rowDocs = await repository.docQuery<StagedRow>('import_rows', { import_id: id });
  const rows = rowDocs.sort((a, b) => a.index - b.index);
  return { batch: batch as ImportBatch, rows };
}

async function loadBundleEdges(id: string): Promise<BundleEdge[]> {
  const doc = await repository.docGet<{ bundle_edges?: BundleEdge[] }>('imports', id);
  return doc?.bundle_edges ?? [];
}

export async function listBatches(): Promise<ImportBatch[]> {
  const docs = await repository.docList<ImportBatch & { raw_content?: string }>('imports');
  return docs
    .map(({ raw_content: _raw, ...batch }) => batch as ImportBatch)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function setRowDecision(batchId: string, rowId: string, decision: 'accept' | 'skip', payloadPatch?: Record<string, unknown>): Promise<void> {
  await repository.transaction(async (tx) => {
    const row = await repository.docGet<StagedRow>('import_rows', rowId, tx);
    if (!row) throw new Error('import row not found');
    if (row.status === 'committed') throw new Error('committed import rows cannot be edited');
    const update: Record<string, unknown> = { decision };
    if (payloadPatch) {
      update.payload = { ...(row.payload ?? {}), ...payloadPatch };
    }
    await repository.docMerge('import_rows', rowId, update, tx);
  });
}

// ── Commit ────────────────────────────────────────────────────────────────────

async function findOrCreateOrg(title: string, source: string, sourceRef: string, cache: Map<string, string>): Promise<string> {
  const key = normalizeForMatch(title);
  const hit = cache.get(key);
  if (hit) return hit;
  const existing = (await repository.allLiveNodes()).find((n) => n.type === 'organization' && normalizeForMatch(n.title) === key);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const deterministicId = `import-org-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  const node = await repository.createNode(
    { type: 'organization', title, source, source_ref: sourceRef, confidence: 0.8 },
    { actor: 'import' },
    { id: deterministicId },
  );
  cache.set(key, node.id);
  return node.id;
}

/**
 * The document id a bundle row will land on, a pure function of the row, so it
 * is knowable without having processed the row. That is what lets a re-commit
 * of a partially failed batch still resolve edges into rows committed earlier.
 */
function graphNodeId(batchId: string, row: StagedRow): string {
  const primary = (row.payload as unknown as BundleNode).identity_keys?.[0];
  return primary
    ? externalNodeId(primary, (v) => createHash('sha256').update(v).digest('hex'))
    : importResultId(batchId, row.id, 'node');
}

/** Document id for a bundle edge: the relationship's own identity, not the batch's. */
function bundleEdgeId(type: string, src: string, dst: string): string {
  const digest = createHash('sha256').update(`${type}\0${src}\0${dst}`).digest('hex');
  return `ext-edge-${digest.slice(0, 40)}`;
}

function importResultId(batchId: string, rowId: string, suffix: string): string {
  return `import-${createHash('sha256').update(`${batchId}\0${rowId}\0${suffix}`).digest('hex').slice(0, 40)}`;
}

/**
 * Apply a bundle's edges once its nodes have ids.
 *
 * Skipping a duplicate row means "don't create a second copy", not "throw the
 * relationship away", so a row skipped because it matches an existing record
 * still resolves to that record, and edges pointing at it connect to the one
 * already in the graph. Only a row skipped with no match at all leaves its
 * edges unresolvable, and those are dropped rather than dangled.
 */
async function commitBundleEdges(
  id: string,
  rows: StagedRow[],
  source: string,
  failedRowIds: ReadonlySet<string>,
): Promise<number> {
  const edges = await loadBundleEdges(id);
  if (edges.length === 0) return 0;

  const refToId = new Map<string, string>();
  for (const row of rows) {
    if (row.entity !== 'graph_node' || !row.ref) continue;
    if (failedRowIds.has(row.id)) continue;
    if (row.decision === 'accept') refToId.set(row.ref, graphNodeId(id, row));
    else if (row.dup) refToId.set(row.ref, row.dup.nodeId);
  }

  let created = 0;
  for (const edge of edges) {
    const src = refToId.get(edge.src);
    const dst = refToId.get(edge.dst);
    if (!src || !dst) continue;
    try {
      const edgeRecord = await repository.createEdge(
        {
          type: edge.type,
          src,
          dst,
          props: edge.props,
          start_date: edge.start_date,
          end_date: edge.end_date,
          is_current: edge.is_current,
          source,
          source_ref: id,
          confidence: edge.confidence,
        },
        { actor: 'import' },
        // Keyed on (type, src, dst) and NOT on the batch: an edge of a given
        // type between two given nodes is one fact, so importing a bundle twice
        // must converge on the same document instead of laying a second
        // parallel edge beside the first.
        { id: bundleEdgeId(edge.type, src, dst) },
      );
      // Same tombstone problem as nodes: re-importing after a rollback must
      // bring the relationship back, not resolve to the soft-deleted edge.
      if (edgeRecord.deleted_at) await repository.restoreEdge(edgeRecord.id, { actor: 'import' });
      created++;
    } catch {
      // A single rejected edge (endpoint deleted mid-import, type matrix
      // disallows the pair) must not abort the rest of the graph.
    }
  }
  return created;
}

export async function commitImport(id: string): Promise<{ created: number; failed: number }> {
  const found = await getBatch(id);
  if (!found || found.batch.status !== 'staged') throw new Error('batch is not staged');
  const { batch, rows } = found;
  const source = SOURCE_BY_KIND[batch.kind as ImportKind];
  const self = await getSelf();
  const orgCache = new Map<string, string>();
  let created = 0;

  // One malformed row must never abort the batch (SRS: staging rows fail
  // individually, the commit itself always completes). Failed rows stay
  // staged instead of being marked committed.
  const failedRowIds = new Set<string>();
  const rowErrors = new Map<string, string>();
  const fail = (rowId: string, reason: string): void => {
    failedRowIds.add(rowId);
    rowErrors.set(rowId, reason);
  };

  for (const row of rows) {
    if (row.decision !== 'accept' || row.status === 'committed') continue;
    try {
        const p = row.payload as Record<string, unknown>;

        if (row.entity === 'atom') {
          // Résumé line → atom + default variant, owner chosen in the wizard.
          const owner = (p.owner_node as string) ?? null;
          if (!owner) {
            // FR-020: an unassigned line creates nothing, so it must stay
            // FR-020: unassigned lines create nothing; stay retryable with a clear reason.
            fail(row.id, 'no owner assigned: pick a role or project for this line, then commit again');
            continue;
          }
          const atomId = importResultId(id, row.id, 'atom');
          const now = nowIso();
          const atom = {
            id: atomId,
            owner_node: owner,
            kind: (p.kind as string) ?? 'achievement',
            metrics: [],
            pinned: false,
            blocked: false,
            source_ref: id,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            rev: 1,
          };
          const variant = {
            id: importResultId(id, row.id, 'variant'),
            atom_id: atomId,
            emphasis: 'detailed',
            text: p.text as string,
            is_default: true,
          };
          // FR-002: atom + variant + revision commit together; an atom with no
          // variant is unrenderable but still counted as evidence.
          await repository.transaction(async (tx) => {
            const [ownerNode, existingAtom] = await Promise.all([
              repository.getNode(owner, { includeDeleted: true }, tx),
              repository.docGet('atoms', atomId, tx),
            ]);
            if (!ownerNode || ownerNode.deleted_at) throw new Error(`owner ${owner} does not exist or is deleted`);
            if (existingAtom) return;
            await repository.docPut('atoms', atomId, atom as unknown as Record<string, unknown>, {}, tx);
            await repository.docPut('atom_variants', variant.id, variant as unknown as Record<string, unknown>, {}, tx);
            await repository.stageRevision(tx, {
              kind: 'atom',
              id: atomId,
              rev: 1,
              op: 'create',
              snapshot: { ...atom, variants: [variant] },
              source,
              actor: 'import',
            });
          });
          created++;
          continue;
        }

        let nodeId: string | null = null;
        switch (row.entity) {
          case 'graph_node': {
            const bn = row.payload as unknown as BundleNode;
            const primaryKey = bn.identity_keys[0];
            // A stable external identity gives a stable document id, so
            // re-importing the same record updates nothing rather than
            // duplicating: createNode returns the existing doc for a known id.
            const deterministicId = primaryKey
              ? externalNodeId(primaryKey, (v) => createHash('sha256').update(v).digest('hex'))
              : importResultId(id, row.id, 'node');
            const node = await repository.createNode(
              {
                type: bn.type,
                title: bn.title,
                subtitle: bn.subtitle ?? undefined,
                props: bn.props,
                identity_keys: bn.identity_keys,
                notes_md: bn.notes_md ?? '',
                start_date: bn.start_date,
                end_date: bn.end_date,
                date_precision: bn.date_precision,
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: deterministicId },
            );
            // A deterministic id also resolves to a *rolled-back* record, and
            // create-returns-existing would hand back the tombstone, so
            // re-importing a batch you had rolled back would silently produce
            // nothing. Rolling back then re-importing is an undo, not a ban.
            nodeId = node.deleted_at
              ? (await repository.restoreNode(node.id, { actor: 'import' })).id
              : node.id;
            break;
          }
          case 'person': {
            const node = await repository.createNode(
              {
                type: 'person',
                title: row.title,
                subtitle: row.subtitle ?? undefined,
                props: {
                  emails: sanitizeEmails(p.emails),
                  phones: (p.phones as string[]) ?? [],
                  headline: p.headline,
                  city: p.city,
                  socials: sanitizeLinkedInUrl(p.linkedin) ? { linkedin: sanitizeLinkedInUrl(p.linkedin) } : {},
                },
                notes_md: (p.note as string) ?? '',
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            if (self) {
              await repository.createEdge(
                { type: 'KNOWS', src: self.id, dst: node.id, props: {}, source, source_ref: id },
                { actor: 'import' },
                { id: importResultId(id, row.id, 'knows') },
              );
            }
            break;
          }
          case 'role': {
            const node = await repository.createNode(
              {
                type: 'role',
                title: row.title,
                subtitle: (p.company as string) || undefined,
                props: { employment_type: 'full_time', city: p.city || undefined },
                notes_md: (p.description as string) ?? '',
                start_date: (p.start as string) || undefined,
                end_date: (p.end as string) || undefined,
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            if (p.company) {
              const orgId = await findOrCreateOrg(p.company as string, source, id, orgCache);
              await repository.createEdge(
                { type: 'ROLE_AT', src: node.id, dst: orgId, source, source_ref: id },
                { actor: 'import' },
                { id: importResultId(id, row.id, 'role-at') },
              );
            }
            if (self) {
              await repository.createEdge(
                { type: 'HELD', src: self.id, dst: node.id, source, source_ref: id },
                { actor: 'import' },
                { id: importResultId(id, row.id, 'held') },
              );
            }
            break;
          }
          case 'education': {
            const node = await repository.createNode(
              {
                type: 'education',
                title: row.title,
                subtitle: (p.degree as string) || undefined,
                props: { degree: p.degree || undefined },
                notes_md: (p.notes as string) ?? '',
                start_date: (p.start as string) || undefined,
                end_date: (p.end as string) || undefined,
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            if (self) {
              await repository.createEdge(
                { type: 'ATTENDED', src: self.id, dst: node.id, source, source_ref: id },
                { actor: 'import' },
                { id: importResultId(id, row.id, 'attended') },
              );
            }
            break;
          }
          case 'skill': {
            const node = await repository.createNode(
              { type: 'skill', title: row.title, props: {}, source, source_ref: id, confidence: row.confidence },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            if (self) {
              await repository.createEdge(
                { type: 'USES_SKILL', src: self.id, dst: node.id, source, source_ref: id },
                { actor: 'import' },
                { id: importResultId(id, row.id, 'uses-skill') },
              );
            }
            break;
          }
          case 'event': {
            const rrule = p.rrule ? `\n\nRRULE: ${p.rrule as string}` : '';
            const node = await repository.createNode(
              {
                type: 'event',
                title: row.title,
                props: { kind: 'appointment', venue: p.venue || undefined },
                notes_md: `${(p.description as string) ?? ''}${rrule}`.trim(),
                start_date: (p.start as string) || undefined,
                end_date: (p.end as string) || undefined,
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            break;
          }
          case 'link': {
            const node = await repository.createNode(
              {
                type: 'link',
                title: row.title,
                props: { url: p.url, domain: safeDomain(p.url as string) },
                source,
                source_ref: id,
                confidence: row.confidence,
              },
              { actor: 'import' },
              { id: importResultId(id, row.id, 'node') },
            );
            nodeId = node.id;
            for (const tagName of ((p.tags as string[]) ?? []).slice(0, 10)) {
              const tagId = await upsertTag(tagName);
              await repository.docPut('taggings', importResultId(id, row.id, `tag:${tagName}`), {
                tag_id: tagId,
                subject_kind: 'node',
                subject_id: node.id,
                created_at: nowIso(),
              });
            }
            break;
          }
        }
        if (nodeId) created++;
    } catch (err) {
      fail(row.id, (err as Error).message || 'row failed');
    }
  }

  const edgesCreated = await commitBundleEdges(id, rows, source, failedRowIds);
  created += edgesCreated;

  // Mark rows committed (only the ones that actually produced data) + batch
  // status. Failed rows keep their reason so the UI can explain the retry.
  for (const row of rows) {
    if (row.decision !== 'accept' || row.status === 'committed') continue;
    await repository.docMerge(
      'import_rows',
      row.id,
      failedRowIds.has(row.id)
        ? { status: 'staged', error: rowErrors.get(row.id) ?? 'row failed' }
        : { status: 'committed', error: null },
    );
  }
  // A batch with retryable rows stays partially staged so the owner can fix and
  // re-commit; only a clean run closes the batch (FR-020). Once closed, the raw
  // upload has served its purpose and is purged (FR-006), the parsed rows and
  // the created records are the durable artifacts.
  const clean = failedRowIds.size === 0;
  await repository.docMerge('imports', id, {
    status: clean ? 'committed' : 'staged',
    committed_at: nowIso(),
    // JSONB merges shallowly, so rebuild the nested object from the batch data.
    stats: { ...batch.stats, created: (batch.stats.created ?? 0) + created, failed: failedRowIds.size },
  });
  if (clean) await purgeRawImport(id);
  // New records change the identity graph. Without busting the scan cache the
  // Identity audit kept serving a pre-import queue until the five-minute TTL.
  if (created > 0) await invalidateDuplicateScan();
  return { created, failed: failedRowIds.size };
}

/**
 * Discard a staged batch. FR-006: the raw upload (address book, calendar,
 * résumé text) is deleted with it, discarding is a deletion intent, and the
 * retention promise is that nothing survives it.
 */
export async function discardImport(id: string): Promise<void> {
  await repository.docMerge('imports', id, { status: 'discarded' });
  await purgeRawImport(id);
}

/**
 * Soft-delete every node/edge/atom the batch created, and purge the raw upload.
 *
 * FR-006: rolling back an import is a deletion intent. Keeping the original
 * address book / calendar / résumé text on the batch "for re-parse" meant the
 * most sensitive artifact in the system survived the user's own undo, forever.
 * Re-importing is a re-upload.
 */
export async function rollbackImport(id: string): Promise<{ removed: number }> {
  const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
  let removed = 0;
  for (const e of edges) {
    if (e.source_ref === id) {
      await repository.softDeleteEdge(e.id, { actor: 'import-rollback' });
      removed++;
    }
  }
  for (const n of nodes) {
    if (n.source_ref === id) {
      await repository.softDeleteNode(n.id, { actor: 'import-rollback' });
      removed++;
    }
  }
  // Atoms from résumé disassembly.
  const atoms = await repository.docQuery<{ id: string }>('atoms', { source_ref: id });
  for (const doc of atoms) {
    await repository.transaction(async (tx) => {
      const before = await repository.docGet<Record<string, unknown>>('atoms', doc.id, tx);
      if (!before) return;
      const rev = Number(before.rev ?? 1) + 1;
      const after = { ...before, deleted_at: nowIso(), updated_at: nowIso(), rev };
      await repository.docPut('atoms', doc.id, after, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'atom',
        id: doc.id,
        rev,
        op: 'delete',
        snapshot: after,
        diff: { deleted_at: after.deleted_at },
        actor: 'import-rollback',
      });
    });
    removed++;
  }
  await repository.docMerge('imports', id, {
    status: 'rolled_back',
    rolled_back_at: nowIso(),
  });
  await purgeRawImport(id);
  if (removed > 0) await invalidateDuplicateScan();
  return { removed };
}

// ── GitHub sync ───────────────────────────────────────────────────────────────

interface GithubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  topics?: string[];
  default_branch: string;
  fork: boolean;
}

export async function githubSync(): Promise<{ status: 'synced' | 'not_modified' | 'unauthorized' | 'not_configured'; created: number; updated: number }> {
  const settings = await getSettings();
  // FR-004: the credential comes from the secret store, never from Postgres.
  const pat = githubToken();
  if (!pat) return { status: 'not_configured', created: 0, updated: 0 };

  const headers: Record<string, string> = {
    authorization: `Bearer ${pat}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'vitae-importer',
  };
  if (settings.github.etag) headers['if-none-match'] = settings.github.etag;

  // FR-026: a stalled GitHub connection must not hold the request open forever.
  const res = await fetchWithDeadline('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers,
    timeoutMs: 15_000,
  });
  if (res.status === 304) {
    await patchSettings({ github: { ...settings.github, lastSyncAt: nowIso() } });
    return { status: 'not_modified', created: 0, updated: 0 };
  }
  if (res.status === 401 || res.status === 403) return { status: 'unauthorized', created: 0, updated: 0 };
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);

  const repos = (await res.json()) as GithubRepo[];
  const etag = res.headers.get('etag');
  const self = await getSelf();
  const existing = (await repository.allLiveNodes()).filter((n) => n.type === 'repository');
  const byFullName = new Map(existing.map((n) => [(n.props as Record<string, unknown>).full_name as string, n]));
  const skillCache = new Map<string, string>(
    (await repository.allLiveNodes()).filter((n) => n.type === 'skill').map((n) => [normalizeForMatch(n.title), n.id]),
  );

  let created = 0;
  let updated = 0;
  for (const r of repos) {
    if (r.fork) continue;
    const props = {
      host: 'github',
      full_name: r.full_name,
      url: r.html_url,
      primary_language: r.language ?? undefined,
      stars: r.stargazers_count,
      forks: r.forks_count,
      is_private: r.private,
      description: r.description ?? undefined,
      topics: r.topics ?? [],
      default_branch: r.default_branch,
      last_synced_at: nowIso(),
    };
    const prev = byFullName.get(r.full_name);
    let repoNodeId: string;
    if (prev) {
      await repository.updateNode(prev.id, { props: { ...(prev.props as Record<string, unknown>), ...props } }, { actor: 'github-sync' });
      repoNodeId = prev.id;
      updated++;
    } else {
      const node = await repository.createNode(
        { type: 'repository', title: r.name, subtitle: r.description ?? undefined, props, source: 'import_github', source_ref: 'github_sync' },
        { actor: 'github-sync' },
      );
      repoNodeId = node.id;
      created++;
    }
    // Language → skill + USES_SKILL edge (idempotent per repo+skill).
    if (r.language && self) {
      const key = normalizeForMatch(r.language);
      let skillId = skillCache.get(key);
      if (!skillId) {
        const skill = await repository.createNode(
          { type: 'skill', title: r.language, props: { category: 'language' }, source: 'import_github', source_ref: 'github_sync' },
          { actor: 'github-sync' },
        );
        skillId = skill.id;
        skillCache.set(key, skillId);
      }
      const edges = await repository.edgesForNode(repoNodeId);
      if (!edges.some((e) => e.type === 'USES_SKILL' && e.dst === skillId)) {
        await repository.createEdge(
          { type: 'USES_SKILL', src: repoNodeId, dst: skillId, source: 'import_github', source_ref: 'github_sync' },
          { actor: 'github-sync' },
        );
      }
    }
  }

  await patchSettings({ github: { lastSyncAt: nowIso(), etag } });
  return { status: 'synced', created, updated };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** Keep only addresses the person schema will accept, imported address books
 * routinely contain junk ("john at work", "-"), and one bad value must not
 * fail the whole row. */
function sanitizeEmails(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((e): e is string => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).map((e) => e.trim());
}

/** LinkedIn exports sometimes omit the scheme; coerce to a real URL or drop. */
function sanitizeLinkedInUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const s = /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;
  try {
    new URL(s);
    return s;
  } catch {
    return undefined;
  }
}

async function upsertTag(name: string): Promise<string> {
  const existing = await repository.docQuery<{ id: string }>('tags', { name });
  if (existing.length > 0) return existing[0]!.id;
  const id = `tag-${createHash('sha256').update(normalizeForMatch(name)).digest('hex').slice(0, 32)}`;
  await repository.docPut('tags', id, { id, name, kind: 'facet', created_at: nowIso() });
  return id;
}
