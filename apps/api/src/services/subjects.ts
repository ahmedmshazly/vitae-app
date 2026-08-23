/**
 * Who owns which record.
 *
 * The graph holds several people's records, the owner's, plus profiles brought
 * in by imports. Ownership is expressed by the subject edge each type declares
 * (`HELD person→role`, `EARNED person→award`, …), but until now nothing read it
 * at query time, so every read model treated "all nodes of this type" as "all of
 * mine". That is only true in a graph with exactly one person in it.
 *
 * Ownership here is a *total* function over subject-bearing records: anything no
 * one claims belongs to the reserved placeholder person rather than to nobody.
 * "Not mine" and "nobody said" have to be distinguishable, because collapsing
 * them is precisely how other people's degrees reached the résumé.
 */
import {
  PLACEHOLDER_IDENTITY_KEY,
  PLACEHOLDER_TITLE,
  isSubjectBearing,
  subjectAssignment,
  type NodeRecord,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { currentWorkspaceId } from '../db/space.js';

/**
 * The minimum a graph must expose for ownership to be resolvable.
 *
 * `type` is a plain string rather than the NodeType union: resolution only ever
 * compares type names, and widening here lets every existing Graph shape
 * (crm's, resume-model's) satisfy it without a cast.
 */
export interface OwnableGraph {
  nodesById: Map<string, { id: string; type: string }>;
  edges: Array<{ type: string; src: string; dst: string }>;
}

/** Adapt `services/crm.ts`'s Graph (which keys its node map `nodes`). */
export function ownableFrom(graph: {
  nodes: Map<string, NodeRecord>;
  edges: Array<{ type: string; src: string; dst: string }>;
}): OwnableGraph {
  return { nodesById: graph.nodes, edges: graph.edges };
}

export interface OwnerIndex {
  /** record id → owning person id. Subject-bearing records only. */
  ownerOf: Map<string, string>;
  /** person id → the records they own. */
  recordsOf: Map<string, Set<string>>;
  /** Subject-bearing records nobody claims, candidates for the placeholder. */
  unowned: string[];
  /** Records more than one person claims; ownerOf keeps the first seen. */
  contested: string[];
}

/**
 * One pass over the edge list. Doing this per record instead would mean a query
 * per row, and the résumé needs the answer for every node in the graph at once.
 */
export function buildOwnerIndex(graph: OwnableGraph): OwnerIndex {
  const typeOf = (id: string): string | undefined => graph.nodesById.get(id)?.type;
  const ownerOf = new Map<string, string>();
  const recordsOf = new Map<string, Set<string>>();
  const contested: string[] = [];

  for (const edge of graph.edges) {
    const assignment = subjectAssignment(edge, typeOf);
    if (!assignment) continue;
    const { recordId, personId } = assignment;
    const existing = ownerOf.get(recordId);
    if (existing && existing !== personId) {
      contested.push(recordId);
      continue;
    }
    ownerOf.set(recordId, personId);
    (recordsOf.get(personId) ?? recordsOf.set(personId, new Set()).get(personId)!).add(recordId);
  }

  const unowned: string[] = [];
  for (const node of graph.nodesById.values()) {
    if (isSubjectBearing(node.type) && !ownerOf.has(node.id)) unowned.push(node.id);
  }

  return { ownerOf, recordsOf, unowned, contested };
}

/** The records a person owns. Empty set when they own nothing. */
export function ownedIdsFor(personId: string, index: OwnerIndex): Set<string> {
  return index.recordsOf.get(personId) ?? new Set<string>();
}

/**
 * The skills a person can claim.
 *
 * Skills are shared vocabulary, a skill node is *used*, never owned, and the
 * same node is referenced by several people. A skill counts as this person's
 * when a USES_SKILL edge starts at them directly (a claimed résumé skill) or at
 * any role, project or repository they own (evidence). Both patterns exist in
 * the graph, so taking either alone loses half the answer.
 */
export function skillIdsFor(personId: string, graph: OwnableGraph, owned: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== 'USES_SKILL') continue;
    if (edge.src !== personId && !owned.has(edge.src)) continue;
    if (graph.nodesById.get(edge.dst)?.type !== 'skill') continue;
    out.add(edge.dst);
  }
  return out;
}

// ── the reserved owner ───────────────────────────────────────────────────────

// Cached per durable workspace, like services/self.ts.
const cachedPlaceholderId = new Map<string, string | null>();

/** The reserved "Unattributed" person, if it exists yet. */
export async function getPlaceholder(): Promise<NodeRecord | null> {
  const workspaceId = currentWorkspaceId();
  const cached = cachedPlaceholderId.get(workspaceId);
  if (cached) {
    const n = await repository.getNode(cached);
    if (n) return n;
    cachedPlaceholderId.delete(workspaceId);
  }
  const found = await repository.findByIdentityKey(PLACEHOLDER_IDENTITY_KEY);
  cachedPlaceholderId.set(workspaceId, found?.id ?? null);
  return found;
}

/**
 * The reserved owner, created on first use. Never `is_self`: `getSelf()` keys
 * off that flag, and a placeholder that could answer "who am I" would be worse
 * than no placeholder at all.
 */
export async function ensurePlaceholder(meta: { actor?: string } = {}): Promise<NodeRecord> {
  const existing = await getPlaceholder();
  if (existing) return existing;
  const created = await repository.createNode(
    {
      type: 'person',
      title: PLACEHOLDER_TITLE,
      subtitle: 'Records with no stated owner',
      props: { is_placeholder: true },
      identity_keys: [PLACEHOLDER_IDENTITY_KEY],
      notes_md:
        'Reserved system record. Owns any subject-bearing record that carries no ' +
        'subject edge, so "not mine" and "nobody said" stay distinguishable. ' +
        'Reassign anything here to its real owner.',
      source: 'system',
      confidence: 1,
    },
    { actor: meta.actor ?? 'system' },
  );
  cachedPlaceholderId.set(currentWorkspaceId(), created.id);
  return created;
}

export function isPlaceholder(node: Pick<NodeRecord, 'props'> | null | undefined): boolean {
  return Boolean((node?.props as Record<string, unknown> | undefined)?.is_placeholder);
}

/** Test seam: drop the memoised placeholder id (mirrors resetServerEnvCache). */
export function resetPlaceholderCache(): void {
  cachedPlaceholderId.clear();
}
