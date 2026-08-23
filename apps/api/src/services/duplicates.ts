/**
 * Duplicates queue + merge/undo (SRS §4.7, §5.3). The Fellegi-Sunter scorer in
 * @vitae/core scores candidate person pairs; auto-merge never happens.
 *
 * Candidates come from type-aware blocking keys, not an all-pairs sweep
 * (FR-008): records must share an identity, contact, URL/domain, geography,
 * date, learned alias, or name token/trigram before comparison. A merge runs in
 * one transaction, writes revisions for every touched record, and stores both
 * pre-images and produced revisions so undo detects later edits (FR-002/003).
 */
import {
  canonicalCountryCode,
  canonicalOrganizationName,
  canonicalPersonName,
  compareEntities,
  normalizeForMatch,
  type EdgeRecord,
  type EntityMatchInput,
  type MatchSignal,
  type NodeRecord,
  type NodeType,
} from '@vitae/core';
import { createHash } from 'node:crypto';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { loadGraph, type Graph } from './crm.js';
import { currentWorkspaceId } from '../db/space.js';

/** Email domains feed the org_domain comparator alongside org names. */
export function emailDomains(emails: string[]): string[] {
  return emails.map((e) => e.split('@')[1] ?? '').filter(Boolean);
}

/** person → normalized org names via HELD → ROLE_AT. */
export function orgNamesByPerson(graph: Graph): Map<string, string[]> {
  const roleOrg = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type !== 'ROLE_AT') continue;
    const org = graph.nodes.get(e.dst);
    if (org) roleOrg.set(e.src, normalizeForMatch(org.title));
  }
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== 'HELD') continue;
    const org = roleOrg.get(e.dst);
    if (org) (out.get(e.src) ?? out.set(e.src, []).get(e.src)!).push(org);
  }
  return out;
}

export interface DupPair {
  a: { id: string; type: NodeType; title: string; meta: string; rev: number };
  b: { id: string; type: NodeType; title: string; meta: string; rev: number };
  weight: number;
  verdict: 'possible' | 'probable';
  evidence: string[];
  signals: MatchSignal[];
  contradictions: MatchSignal[];
  fingerprint: string;
}

export interface DupCluster {
  id: string;
  type: NodeType;
  verdict: 'possible' | 'probable';
  score: number;
  members: DupPair['a'][];
  pairs: DupPair[];
}

export interface DuplicateCheck {
  fingerprint: string;
  candidates: Array<DupPair['a'] & {
    score: number;
    verdict: 'possible' | 'probable';
    evidence: string[];
    signals: MatchSignal[];
    contradictions: MatchSignal[];
  }>;
}

export interface DedupAlias {
  id: string;
  type: NodeType;
  alias: string;
  normalized: string;
  canonical_id: string;
  canonical_title: string;
  created_at: string;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('__');
}

function fingerprintNode(node: EntityMatchInput & { id?: string; rev?: number }): string {
  const material = JSON.stringify({
    id: node.id,
    rev: node.rev,
    type: node.type,
    title: node.title,
    subtitle: node.subtitle,
    props: node.props,
    identity_keys: node.identity_keys,
    start_date: node.start_date,
    end_date: node.end_date,
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 24);
}

function pairFingerprint(a: EntityMatchInput & { id?: string; rev?: number }, b: EntityMatchInput & { id?: string; rev?: number }): string {
  return [fingerprintNode(a), fingerprintNode(b)].sort().join('.');
}

function metaFor(n: NodeRecord): string {
  const props = n.props as Record<string, unknown>;
  const email = ((props.emails as string[]) ?? [])[0];
  const detail =
    email ??
    (typeof props.domain === 'string' ? props.domain : undefined) ??
    n.subtitle ??
    n.start_date ??
    `rev ${n.rev}`;
  return [n.source, detail].join(' · ');
}

function summary(n: NodeRecord): DupPair['a'] {
  return { id: n.id, type: n.type, title: n.title, meta: metaFor(n), rev: n.rev };
}

function entityInput(n: NodeRecord): EntityMatchInput {
  return {
    type: n.type,
    title: n.title,
    subtitle: n.subtitle,
    props: n.props as Record<string, unknown>,
    identity_keys: n.identity_keys,
    start_date: n.start_date,
    end_date: n.end_date,
  };
}

function signalEvidence(signals: MatchSignal[]): string[] {
  return signals
    .filter((signal) => signal.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((signal) => signal.label);
}

interface PersonLike {
  title: string;
  emails: string[];
  phones: string[];
  eventIds: string[];
  orgDomains: string[];
}

/**
 * A bucket bigger than this contributes nothing but noise (think the trigram
 * "mar" across a large address book) and would reintroduce quadratic cost, so
 * it is skipped. Any real duplicate pair shares several keys, so recall through
 * the remaining, more selective buckets is preserved.
 */
const MAX_BUCKET = 200;
const MAX_CANDIDATE_PAIRS = 50_000;

function blockingKeys(p: PersonLike): string[] {
  const keys: string[] = [];
  for (const e of p.emails) if (e) keys.push(`e:${e.trim().toLowerCase()}`);
  for (const ph of p.phones) {
    const digits = ph.replace(/\D/g, '');
    if (digits.length >= 7) keys.push(`p:${digits.slice(-7)}`);
  }
  for (const ev of p.eventIds) keys.push(`v:${ev}`);
  for (const d of p.orgDomains) if (d) keys.push(`o:${d.toLowerCase()}`);
  // Name trigrams: trigram similarity is zero without a shared trigram, so this
  // block never drops a pair the name comparator could have scored.
  const name = normalizeForMatch(p.title);
  if (name.length < 3) {
    if (name) keys.push(`s:${name}`);
  } else {
    for (let i = 0; i + 3 <= name.length; i++) keys.push(`n:${name.slice(i, i + 3)}`);
    // Short/fuzzy names often differ in their only trigram. A first-two-letter
    // block preserves recall while MAX_BUCKET/MAX_CANDIDATE_PAIRS cap work.
    if (name.length <= 6) keys.push(`f:${name.slice(0, 2)}`);
  }
  return keys;
}

/** Candidate pairs from blocking keys, never an all-pairs sweep. */
export function candidatePairs(persons: Array<{ id: string; like: PersonLike }>): Array<[string, string]> {
  const buckets = new Map<string, string[]>();
  for (const { id, like } of persons) {
    for (const key of new Set(blockingKeys(like))) {
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(id);
    }
  }
  const pairs = new Map<string, [string, string]>();
  for (const ids of buckets.values()) {
    if (ids.length < 2 || ids.length > MAX_BUCKET) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        pairs.set(pairKey(a, b), [a, b]);
        if (pairs.size >= MAX_CANDIDATE_PAIRS) return [...pairs.values()];
      }
    }
  }
  return [...pairs.values()];
}

function genericBlockingKeys(node: NodeRecord, aliases: DedupAlias[] = []): string[] {
  const props = node.props as Record<string, unknown>;
  const keys = new Set<string>();
  const add = (prefix: string, value: string | null | undefined) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized) keys.add(`${node.type}:${prefix}:${normalized}`);
  };
  for (const identity of node.identity_keys ?? []) add('id', identity);
  for (const email of (props.emails as string[] | undefined) ?? []) add('email', email);
  for (const phone of (props.phones as string[] | undefined) ?? []) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) add('phone', digits.slice(-10));
  }
  for (const raw of [props.domain, props.website, props.url, props.credential_url]) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      add('host', url.hostname.replace(/^www\./, ''));
      add('url', `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`);
    } catch {
      add('url', normalizeForMatch(raw));
    }
  }
  const country = canonicalCountryCode(String(props.country_code ?? props.country ?? (node.type === 'location' ? node.title : '')));
  if (country) add('country', country);
  if (node.start_date) add('date', node.start_date);

  const canonical =
    node.type === 'person'
      ? canonicalPersonName(node.title)
      : node.type === 'organization'
        ? canonicalOrganizationName(node.title)
        : normalizeForMatch(node.title);
  const tokens = canonical.split(/\s+/).filter(Boolean);
  for (const token of tokens) if (token.length >= 2) add('token', token);
  const compact = canonical.replace(/\s+/g, '');
  if (compact.length < 3) add('name', compact);
  else for (let i = 0; i + 3 <= compact.length; i += 1) add('tri', compact.slice(i, i + 3));
  for (const alias of aliases) {
    if (alias.type !== node.type) continue;
    if (alias.canonical_id === node.id || alias.normalized === normalizeForMatch(node.title)) {
      add('alias', alias.canonical_id);
    }
  }
  return [...keys];
}

function genericCandidatePairs(nodes: NodeRecord[], aliases: DedupAlias[] = []): Array<[string, string]> {
  const buckets = new Map<string, string[]>();
  for (const node of nodes) {
    for (const key of genericBlockingKeys(node, aliases)) {
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(node.id);
    }
  }
  const pairs = new Map<string, [string, string]>();
  for (const ids of buckets.values()) {
    if (ids.length < 2 || ids.length > MAX_BUCKET) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i]!;
        const b = ids[j]!;
        pairs.set(pairKey(a, b), [a, b]);
        if (pairs.size >= MAX_CANDIDATE_PAIRS) return [...pairs.values()];
      }
    }
  }
  return [...pairs.values()];
}

/** Scan all live entity types for candidates, excluding unchanged dismissals. */
async function computeDuplicates(): Promise<DupPair[]> {
  const graph = await loadGraph();
  const nodes = [...graph.nodes.values()].filter((n) => !n.merged_into && !n.deleted_at);
  const contextByNode = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.deleted_at) continue;
    (contextByNode.get(edge.src) ?? contextByNode.set(edge.src, new Set()).get(edge.src)!).add(`${edge.type}:${edge.dst}`);
    (contextByNode.get(edge.dst) ?? contextByNode.set(edge.dst, new Set()).get(edge.dst)!).add(`${edge.type}:${edge.src}`);
  }
  const [dismissedRows, aliases] = await Promise.all([
    repository.docList<{ a: string; b: string; fingerprint?: string }>('dedup_dismissals'),
    repository.docList<DedupAlias>('dedup_aliases'),
  ]);
  // Keyed the same way the document id is, so the lookup below is unchanged.
  const dismissed = new Map(dismissedRows.map((row) => [pairKey(row.a, row.b), row]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = genericCandidatePairs(nodes, aliases);

  const pairs: DupPair[] = [];
  for (const [aId, bId] of candidates) {
    const a = byId.get(aId)!;
    const b = byId.get(bId)!;
    if (a.type !== b.type) continue;
    const fingerprint = pairFingerprint({ ...entityInput(a), id: a.id, rev: a.rev }, { ...entityInput(b), id: b.id, rev: b.rev });
    const decision = dismissed.get(pairKey(aId, bId));
    if (decision && (!decision.fingerprint || decision.fingerprint === fingerprint)) continue;
    const score = compareEntities(entityInput(a), entityInput(b));
    const aContext = contextByNode.get(a.id) ?? new Set<string>();
    const bContext = contextByNode.get(b.id) ?? new Set<string>();
    const sharedContext = [...aContext].filter((key) => bContext.has(key));
    if (sharedContext.length) {
      const contextSignal: MatchSignal = {
        kind: 'context',
        label: `Shared graph context (${Math.min(sharedContext.length, 3)})`,
        similarity: Math.min(1, sharedContext.length / 3),
        weight: Math.min(24, 10 + sharedContext.length * 5),
      };
      score.signals.push(contextSignal);
      score.score = Math.min(100, score.score + contextSignal.weight);
      if (score.score >= 78) score.verdict = 'probable';
      else if (score.score >= 48) score.verdict = 'possible';
    }
    const aliasMatch = aliases.find(
      (alias) =>
        alias.type === a.type &&
        ((alias.canonical_id === a.id && alias.normalized === normalizeForMatch(b.title)) ||
          (alias.canonical_id === b.id && alias.normalized === normalizeForMatch(a.title))),
    );
    if (aliasMatch && score.verdict !== 'probable') {
      score.signals.unshift({ kind: 'name', label: 'Confirmed alias', similarity: 1, weight: 80 });
      score.score = Math.max(80, score.score);
      score.verdict = 'probable';
    }
    if (score.verdict === 'non_match') continue;
    pairs.push({
      a: summary(a),
      b: summary(b),
      weight: score.score,
      verdict: score.verdict,
      evidence: signalEvidence(score.signals),
      signals: score.signals,
      contradictions: score.contradictions,
      fingerprint,
    });
  }
  return pairs.sort((a, b) => b.weight - a.weight);
}

const scanPromises = new Map<string, Promise<DupPair[]>>();
const SCAN_CACHE_MS = 5 * 60 * 1000;
const SCAN_LEASE_MS = 60 * 1000;
const DEDUP_MODEL_VERSION = 2;

const SCAN_DOC = 'dedup_scan';

interface ScanJob {
  status?: string;
  run_id?: string;
  completed_at?: string;
  lease_until?: string;
  published_run?: string;
  model_version?: number;
}

async function loadPersistedPairs(runId: string): Promise<DupPair[]> {
  const rows = await repository.docQuery<{ pair: DupPair }>('meta_runs', {
    meta_id: SCAN_DOC,
    run_id: runId,
  });
  return rows.map((r) => r.pair).sort((a, b) => b.weight - a.weight);
}

async function waitForPublishedRun(): Promise<DupPair[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const job = await repository.docGet<ScanJob>('meta', SCAN_DOC);
    if (job?.status === 'complete' && job.published_run) return loadPersistedPairs(job.published_run);
    if (job?.status === 'failed') throw new Error('duplicate scan failed in another process');
  }
  throw new Error('duplicate scan is still running; retry shortly');
}

/** Leased, generation-isolated persisted scan; one writer across all instances. */
export function scanDuplicates(): Promise<DupPair[]> {
  const workspaceId = currentWorkspaceId();
  const existing = scanPromises.get(workspaceId);
  if (existing) return existing;
  const runId = newId();
  const scanPromise = (async () => {
    const claim = await repository.transaction(async (tx) => {
      const job = await repository.docGet<ScanJob>('meta', SCAN_DOC, tx);
      const now = Date.now();
      if (
        job?.status === 'complete' &&
        job.model_version === DEDUP_MODEL_VERSION &&
        job.published_run &&
        now - new Date(job.completed_at ?? 0).getTime() < SCAN_CACHE_MS
      ) return { kind: 'cached' as const, runId: job.published_run };
      if (job?.status === 'running' && new Date(job.lease_until ?? 0).getTime() > now) {
        return { kind: 'waiting' as const };
      }
      await repository.docMerge('meta', SCAN_DOC, {
        status: 'running',
        run_id: runId,
        started_at: nowIso(),
        lease_until: new Date(now + SCAN_LEASE_MS).toISOString(),
        work_limit: MAX_CANDIDATE_PAIRS,
        model_version: DEDUP_MODEL_VERSION,
      }, tx);
      return { kind: 'claimed' as const };
    });
    if (claim.kind === 'cached') return loadPersistedPairs(claim.runId);
    if (claim.kind === 'waiting') return waitForPublishedRun();

    const pairs = await computeDuplicates();
    // Results are keyed by run so a superseded scan's rows never mix with the
    // published one's, which is what the nested `runs/{id}/results` collection
    // gave us for free.
    await repository.docBulkPut(
      'meta_runs',
      pairs.map((pair) => ({
        id: `${runId}:${pairKey(pair.a.id, pair.b.id)}`,
        data: { run_id: runId, pair },
        extra: { meta_id: SCAN_DOC },
      })),
    );
    await repository.transaction(async (tx) => {
      const current = await repository.docGet<ScanJob>('meta', SCAN_DOC, tx);
      if (current?.run_id !== runId) throw new Error('duplicate scan lease was superseded');
      await repository.docMerge('meta', SCAN_DOC, {
        status: 'complete',
        completed_at: nowIso(),
        published_run: runId,
        result_count: pairs.length,
        lease_until: null,
        model_version: DEDUP_MODEL_VERSION,
      }, tx);
    });
    return pairs;
  })().catch(async (error: unknown) => {
    await repository.transaction(async (tx) => {
      const current = await repository.docGet<ScanJob>('meta', SCAN_DOC, tx);
      if (current?.run_id === runId) {
        await repository.docMerge('meta', SCAN_DOC, {
          status: 'failed', completed_at: nowIso(), error: String(error), lease_until: null,
        }, tx);
      }
    });
    throw error;
  }).finally(() => {
    scanPromises.delete(workspaceId);
  });
  scanPromises.set(workspaceId, scanPromise);
  return scanPromise;
}

export async function scanDuplicateClusters(): Promise<DupCluster[]> {
  const pairs = await scanDuplicates();
  const adjacency = new Map<string, Set<string>>();
  const pairByMember = new Map<string, DupPair[]>();
  const memberById = new Map<string, DupPair['a']>();
  for (const pair of pairs) {
    memberById.set(pair.a.id, pair.a);
    memberById.set(pair.b.id, pair.b);
    (adjacency.get(pair.a.id) ?? adjacency.set(pair.a.id, new Set()).get(pair.a.id)!).add(pair.b.id);
    (adjacency.get(pair.b.id) ?? adjacency.set(pair.b.id, new Set()).get(pair.b.id)!).add(pair.a.id);
    (pairByMember.get(pair.a.id) ?? pairByMember.set(pair.a.id, []).get(pair.a.id)!).push(pair);
    (pairByMember.get(pair.b.id) ?? pairByMember.set(pair.b.id, []).get(pair.b.id)!).push(pair);
  }

  const seen = new Set<string>();
  const clusters: DupCluster[] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const ids: string[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      for (const neighbor of adjacency.get(id) ?? []) if (!seen.has(neighbor)) stack.push(neighbor);
    }
    const clusterPairs = [...new Set(ids.flatMap((id) => pairByMember.get(id) ?? []))];
    const members = ids.map((id) => memberById.get(id)!).sort((a, b) => a.title.localeCompare(b.title));
    const score = Math.max(...clusterPairs.map((pair) => pair.weight));
    clusters.push({
      id: createHash('sha1').update([...ids].sort().join('|')).digest('hex').slice(0, 16),
      type: members[0]!.type,
      verdict: clusterPairs.some((pair) => pair.verdict === 'probable') ? 'probable' : 'possible',
      score,
      members,
      pairs: clusterPairs.sort((a, b) => b.weight - a.weight),
    });
  }
  return clusters.sort((a, b) => b.score - a.score);
}

export async function checkDuplicateDraft(
  draft: EntityMatchInput,
  opts: { excludeId?: string; limit?: number } = {},
): Promise<DuplicateCheck> {
  const [nodes, aliasSnap] = await Promise.all([
    repository.listNodes({ type: draft.type, includeArchived: true, limit: 2_000 }),
    repository.docQuery<DedupAlias>('dedup_aliases', { type: draft.type }),
  ]);
  const aliasCanonicalIds = new Set(
    aliasSnap
      .filter((alias) => alias.normalized === normalizeForMatch(draft.title))
      .map((alias) => alias.canonical_id),
  );
  const candidates = nodes
    .filter((node) => node.id !== opts.excludeId && !node.merged_into)
    .map((node) => {
      const score = compareEntities(draft, entityInput(node));
      if (aliasCanonicalIds.has(node.id) && score.verdict !== 'probable') {
        const aliasSignal: MatchSignal = { kind: 'name', label: 'Confirmed alias', similarity: 1, weight: 80 };
        return { node, score: { ...score, score: Math.max(80, score.score), verdict: 'probable' as const, signals: [aliasSignal, ...score.signals] } };
      }
      return { node, score };
    })
    .filter(({ score }) => score.verdict !== 'non_match')
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, opts.limit ?? 6)
    .map(({ node, score }) => ({
      ...summary(node),
      score: score.score,
      verdict: score.verdict as 'possible' | 'probable',
      evidence: signalEvidence(score.signals),
      signals: score.signals,
      contradictions: score.contradictions,
    }));
  return { fingerprint: fingerprintNode(draft), candidates };
}

export async function listDedupAliases(): Promise<DedupAlias[]> {
  const aliases = await repository.docList<DedupAlias>('dedup_aliases');
  return aliases.sort((a, b) => a.type.localeCompare(b.type) || a.alias.localeCompare(b.alias));
}

export async function deleteDedupAlias(id: string): Promise<void> {
  await repository.docDelete('dedup_aliases', id);
  await invalidateDuplicateScan();
}

export async function invalidateDuplicateScan(): Promise<void> {
  await repository.docMerge('meta', SCAN_DOC, { completed_at: null });
}

export async function dismissPair(aId: string, bId: string): Promise<void> {
  const [a, b] = await Promise.all([
    repository.getNode(aId, { includeDeleted: true }),
    repository.getNode(bId, { includeDeleted: true }),
  ]);
  if (!a || !b) throw new Error('both nodes must exist');
  await repository.docPut('dedup_dismissals', pairKey(aId, bId), {
    a: aId,
    b: bId,
    fingerprint: pairFingerprint({ ...entityInput(a), id: a.id, rev: a.rev }, { ...entityInput(b), id: b.id, rev: b.rev }),
    dismissed_at: nowIso(),
  });
  await invalidateDuplicateScan();
}

export class MergeConflictError extends Error {
  constructor(
    message: string,
    readonly conflicts: Array<{ kind: 'node' | 'edge'; id: string; expected_rev: number; actual_rev: number }>,
  ) {
    super(message);
    this.name = 'MergeConflictError';
  }
}

export interface MergeRecord {
  id: string;
  keep_id: string;
  drop_id: string;
  merged_at: string;
  undone_at: string | null;
  /** Exact pre-images for replay-undo. */
  pre: { keep: NodeRecord; drop: NodeRecord; edges: EdgeRecord[] };
  /**
   * The revision each record carried immediately after the merge. Undo compares
   * these to the live revisions and refuses when anything moved on since
   * (FR-003), a later edit to the survivor must not be silently destroyed.
   */
  post?: { keep_rev: number; drop_rev: number; edge_revs: Record<string, number> };
  alias_id?: string;
}

/**
 * Merge `dropId` into `keepId`. `fields` picks per-field survivors
 * ('keep' | 'drop') for title/subtitle/notes; props merge with keep winning
 * unless the field choice says otherwise. Edges rewire; drop is tombstoned
 * with merged_into (never hard-deleted). One transaction, revisions included.
 */
export async function mergePair(
  keepId: string,
  dropId: string,
  fields: Record<string, 'keep' | 'drop'> = {},
  meta: { actor?: string } = {},
): Promise<MergeRecord> {
  if (keepId === dropId) throw new Error('keepId and dropId must be different');
  const result = await repository.transaction(async (tx) => {
    // ── READ phase ───────────────────────────────────────────────────────────
    const [keep, drop] = await Promise.all([
      repository.getNode(keepId, { includeDeleted: true }, tx),
      repository.getNode(dropId, { includeDeleted: true }, tx),
    ]);
    if (!keep || !drop) throw new Error('both nodes must exist');
    if (keep.deleted_at || drop.deleted_at) throw new Error('both nodes must be live');
    if (keep.type !== drop.type) throw new Error('only records of the same type can be merged');
    if (keep.merged_into || drop.merged_into) throw new Error('an already-merged record cannot be merged again');

    const dropEdges = await repository.edgesForNodeTx(tx, dropId);
    const keepEdges = await repository.edgesForNodeTx(tx, keepId);

    // ── WRITE phase ──────────────────────────────────────────────────────────
    // Survivor fields: keep wins by default; props union with chosen precedence.
    const keepProps = keep.props as Record<string, unknown>;
    const dropProps = drop.props as Record<string, unknown>;
    const mergedProps: Record<string, unknown> = { ...dropProps, ...keepProps };
    for (const [field, who] of Object.entries(fields)) {
      if (who === 'drop' && field in dropProps) mergedProps[field] = dropProps[field];
    }
    // Emails/phones union, contact info should never be lost in a merge.
    for (const listField of ['emails', 'phones'] as const) {
      const merged = [...new Set([...((keepProps[listField] as string[]) ?? []), ...((dropProps[listField] as string[]) ?? [])])];
      if (merged.length) mergedProps[listField] = merged;
    }

    const keptAfter = await repository.stageNodeUpdate(
      tx,
      keep,
      {
        title: fields.title === 'drop' ? drop.title : keep.title,
        subtitle: (fields.subtitle === 'drop' ? drop.subtitle : keep.subtitle) ?? null,
        notes_md:
          fields.notes_md === 'drop'
            ? drop.notes_md
            : fields.notes_md === 'keep'
              ? keep.notes_md
              : keep.notes_md || drop.notes_md,
        props: mergedProps,
      },
      { op: 'merge', actor: meta.actor },
    );

    // Rewire drop's edges onto keep, skipping ones that would self-loop or
    // duplicate an existing keep edge.
    const seen = new Set(keepEdges.map((e) => `${e.type}|${e.src === keepId ? 'out' : 'in'}|${e.src === keepId ? e.dst : e.src}`));
    const edgeRevs: Record<string, number> = {};
    for (const e of dropEdges) {
      const isSrc = e.src === dropId;
      const other = isSrc ? e.dst : e.src;
      let after: EdgeRecord;
      if (other === keepId || seen.has(`${e.type}|${isSrc ? 'out' : 'in'}|${other}`)) {
        // Edge between the two, or a duplicate of one keep already has: tombstone.
        after = await repository.stageEdgeUpdate(tx, e, { deleted_at: nowIso() }, { op: 'merge', actor: meta.actor });
      } else {
        after = await repository.stageEdgeUpdate(tx, e, isSrc ? { src: keepId } : { dst: keepId }, { op: 'merge', actor: meta.actor });
        seen.add(`${e.type}|${isSrc ? 'out' : 'in'}|${other}`);
      }
      edgeRevs[e.id] = after.rev;
    }

    // Tombstone the duplicate (soft, replayable).
    const droppedAfter = await repository.stageNodeUpdate(
      tx,
      drop,
      { merged_into: keepId, deleted_at: nowIso() },
      { op: 'merge', actor: meta.actor },
    );

    const normalizedAlias = normalizeForMatch(drop.title);
    const aliasId =
      normalizedAlias && normalizedAlias !== normalizeForMatch(keep.title)
        ? createHash('sha1').update(`${keep.type}|${normalizedAlias}`).digest('hex')
        : undefined;
    const merge: MergeRecord = {
      id: newId(),
      keep_id: keepId,
      drop_id: dropId,
      merged_at: nowIso(),
      undone_at: null,
      pre: { keep: structuredClone(keep), drop: structuredClone(drop), edges: structuredClone(dropEdges) },
      post: { keep_rev: keptAfter.rev, drop_rev: droppedAfter.rev, edge_revs: edgeRevs },
      ...(aliasId ? { alias_id: aliasId } : {}),
    };
    await repository.docPut('merges', merge.id, merge as unknown as Record<string, unknown>, {}, tx);
    if (aliasId) {
      await repository.docPut('dedup_aliases', aliasId, {
        id: aliasId,
        type: keep.type,
        alias: drop.title,
        normalized: normalizedAlias,
        canonical_id: keep.id,
        canonical_title: fields.title === 'drop' ? drop.title : keep.title,
        created_at: nowIso(),
      } satisfies DedupAlias as unknown as Record<string, unknown>, {}, tx);
    }
    return merge;
  });
  await invalidateDuplicateScan();
  return result;
}

const UNDO_WINDOW_DAYS = 30;

/**
 * Replay-undo from stored pre-images, within the 30-day window.
 *
 * FR-003: refuses when any record has been edited since the merge (its live
 * revision no longer matches the one the merge produced), because replaying the
 * pre-image would destroy those edits without warning. The caller surfaces the
 * conflict; the owner can then edit or dismiss instead of undoing.
 */
export async function undoMerge(mergeId: string, meta: { actor?: string } = {}): Promise<void> {
  await repository.transaction(async (tx) => {
    // ── READ phase ───────────────────────────────────────────────────────────
    const merge = await repository.docGet<MergeRecord>('merges', mergeId, tx);
    if (!merge) throw new Error('merge not found');
    if (merge.undone_at) throw new Error('merge already undone');
    const ageDays = (Date.now() - new Date(merge.merged_at).getTime()) / 86_400_000;
    if (ageDays > UNDO_WINDOW_DAYS) throw new Error(`undo window is ${UNDO_WINDOW_DAYS} days`);

    const [keepNow, dropNow] = await Promise.all([
      repository.getNode(merge.keep_id, { includeDeleted: true }, tx),
      repository.getNode(merge.drop_id, { includeDeleted: true }, tx),
    ]);
    const edgeSnaps = await Promise.all(
      merge.pre.edges.map((e) => repository.getEdge(e.id, { includeDeleted: true }, tx)),
    );
    if (!keepNow || !dropNow) throw new Error('a merged node no longer exists, undo cannot replay');

    // ── Version guard ────────────────────────────────────────────────────────
    // A legacy merge has no expected post-merge revisions. Replaying its whole
    // pre-image would be a blind overwrite, which is exactly the data-loss bug
    // FR-003 closes; require manual recovery instead.
    if (!merge.post) {
      throw new MergeConflictError(
        'This merge predates version-guarded undo and cannot be undone safely; restore it manually from revision history.',
        [],
      );
    }
    const conflicts: Array<{ kind: 'node' | 'edge'; id: string; expected_rev: number; actual_rev: number }> = [];
    if (keepNow.rev !== merge.post.keep_rev) {
      conflicts.push({ kind: 'node', id: keepNow.id, expected_rev: merge.post.keep_rev, actual_rev: keepNow.rev });
    }
    if (dropNow.rev !== merge.post.drop_rev) {
      conflicts.push({ kind: 'node', id: dropNow.id, expected_rev: merge.post.drop_rev, actual_rev: dropNow.rev });
    }
    edgeSnaps.forEach((edgeNow, i) => {
      const pre = merge.pre.edges[i]!;
      const expected = merge.post!.edge_revs[pre.id];
      const actual = edgeNow ? (edgeNow.rev ?? 0) : -1;
      if (expected === undefined) {
        conflicts.push({ kind: 'edge', id: pre.id, expected_rev: -1, actual_rev: actual });
        return;
      }
      if (actual !== expected) conflicts.push({ kind: 'edge', id: pre.id, expected_rev: expected, actual_rev: actual });
    });
    if (conflicts.length > 0) {
      throw new MergeConflictError(
        `${conflicts.length} record(s) changed since this merge, undoing would discard those edits.`,
        conflicts,
      );
    }

    // ── WRITE phase ──────────────────────────────────────────────────────────
    // Replay pre-images as forward revisions (append-only history, SRS §4.7):
    // content returns to the pre-merge snapshot, `rev` keeps moving up.
    const asPatch = (record: Record<string, unknown>): Record<string, unknown> => {
      const { id: _id, rev: _rev, created_at: _c, captured_at: _cap, updated_at: _u, ...rest } = record;
      return rest;
    };
    await repository.stageNodeUpdate(tx, keepNow, asPatch(merge.pre.keep as unknown as Record<string, unknown>), {
      op: 'restore',
      actor: meta.actor,
    });
    await repository.stageNodeUpdate(tx, dropNow, asPatch(merge.pre.drop as unknown as Record<string, unknown>), {
      op: 'restore',
      actor: meta.actor,
    });
    for (const [i, edgeNow] of edgeSnaps.entries()) {
      if (!edgeNow) continue;
      const pre = merge.pre.edges[i]!;
      await repository.stageEdgeUpdate(tx, edgeNow, asPatch(pre as unknown as Record<string, unknown>), {
        op: 'restore',
        actor: meta.actor,
      });
    }
    if (merge.alias_id) await repository.docDelete('dedup_aliases', merge.alias_id, tx);
    await repository.docMerge('merges', mergeId, { undone_at: nowIso() }, tx);
  });
}

export async function listMerges(): Promise<Array<Omit<MergeRecord, 'pre'> & { keep_title: string; drop_title: string }>> {
  const merges = await repository.docList<MergeRecord>('merges');
  return merges
    .map((merge) => {
      const { pre, ...rest } = merge;
      return { ...rest, keep_title: pre.keep.title, drop_title: pre.drop.title };
    })
    .sort((a, b) => b.merged_at.localeCompare(a.merged_at));
}
