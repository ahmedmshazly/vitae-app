/**
 * Whole-workspace discovery read model for the life map.
 *
 * The existing graph endpoint is deliberately a small, focused neighbourhood.
 * Discovery is a different question: it reads the complete live workspace
 * first, then derives the map's communities and the records which join them.
 */
import { createRequire } from 'node:module';
import type { EdgeRecord, NodeRecord } from '@vitae/core';
import { loadGraph, type Graph } from './crm.js';

const SCENE_RECORD_CAP = 750;
const SCENE_ELEMENT_CAP = 1500;
const DETAIL_PAGE_SIZE = 100;
const MAX_DETAIL_PAGE_SIZE = 250;
const require = createRequire(import.meta.url);
// Both packages publish CommonJS runtime entrypoints and ESM type entrypoints.
// Loading the runtime through Node's require bridge keeps that distinction
// explicit under this package's NodeNext compiler settings.
const Graphology = require('graphology') as new (options: {
  type: 'undirected';
  multi: boolean;
  allowSelfLoops: boolean;
}) => {
  addNode(id: string): void;
  addUndirectedEdgeWithKey(key: string, source: string, target: string): void;
};
const louvain = require('graphology-communities-louvain') as (
  graph: unknown,
  options: { resolution: number; rng: () => number },
) => Record<string, number>;

export interface DiscoveryRecord {
  id: string;
  title: string;
  type: string;
  degree: number;
}

export interface DiscoveryConnection {
  communityId: string;
  label: string;
  relationships: number;
}

export interface DiscoveryCommunity {
  id: string;
  label: string;
  memberCount: number;
  recordTypes: Record<string, number>;
  representatives: DiscoveryRecord[];
  connections: DiscoveryConnection[];
}

export interface DiscoveryBridge extends DiscoveryRecord {
  communities: Array<{ id: string; label: string }>;
  connectedCommunityCount: number;
  crossCommunityNeighborCount: number;
}

export interface DiscoveryComponent {
  id: string;
  recordCount: number;
  relationshipCount: number;
  records: DiscoveryRecord[];
  isolated: boolean;
}

export interface GraphDiscoveryResult {
  totals: {
    records: number;
    relationships: number;
    communities: number;
    components: number;
    isolatedRecords: number;
  };
  communities: DiscoveryCommunity[];
  bridges: DiscoveryBridge[];
  disconnected: DiscoveryComponent[];
  explanation: string;
}

export interface CommunityDetailResult {
  community: DiscoveryCommunity;
  members: DiscoveryRecord[];
  relationships: DiscoveryRelationship[];
  totalMembers: number;
  totalRelationships: number;
  offset: number;
  limit: number;
  sceneTruncated: boolean;
}

export interface DiscoveryRelationship {
  id: string;
  src: string;
  dst: string;
  type: string;
  relation?: string;
  kind?: string;
}

export interface ConnectionDetailResult {
  from: { id: string; label: string };
  to: { id: string; label: string };
  relationships: DiscoveryRelationship[];
  totalRelationships: number;
  offset: number;
  limit: number;
}

interface Analysis {
  graph: Graph;
  communities: DiscoveryCommunity[];
  communityByNode: Map<string, string>;
  byId: Map<string, DiscoveryCommunity>;
  degree: Map<string, number>;
  components: DiscoveryComponent[];
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function communityId(members: readonly string[]): string {
  return `community-${stableHash([...members].sort().join('\u001f'))}`;
}

function record(node: NodeRecord, degree: Map<string, number>): DiscoveryRecord {
  return { id: node.id, title: node.title, type: node.type, degree: degree.get(node.id) ?? 0 };
}

function relationship(edge: EdgeRecord): DiscoveryRelationship {
  const props = (edge.props ?? {}) as Record<string, unknown>;
  return {
    id: edge.id,
    src: edge.src,
    dst: edge.dst,
    type: edge.type,
    ...(typeof props.relation === 'string' ? { relation: props.relation } : {}),
    ...(typeof props.kind === 'string' ? { kind: props.kind } : {}),
  };
}

function compareRecords(a: DiscoveryRecord, b: DiscoveryRecord): number {
  return b.degree - a.degree || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function page(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function limit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DETAIL_PAGE_SIZE;
  return Math.min(MAX_DETAIL_PAGE_SIZE, Math.max(1, Math.floor(value ?? DETAIL_PAGE_SIZE)));
}

/** Build a deterministic undirected, de-duplicated adjacency graph for Louvain. */
function louvainCommunities(graph: Graph): Map<string, string> {
  const topology = new Graphology({ type: 'undirected', multi: false, allowSelfLoops: false });
  const ids = [...graph.nodes.keys()].sort();
  for (const id of ids) topology.addNode(id);

  const pairs = new Set<string>();
  for (const edge of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!graph.nodes.has(edge.src) || !graph.nodes.has(edge.dst) || edge.src === edge.dst) continue;
    const [a, b] = edge.src < edge.dst ? [edge.src, edge.dst] : [edge.dst, edge.src];
    const key = `${a}\u001f${b}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    topology.addUndirectedEdgeWithKey(`edge-${stableHash(key)}`, a, b);
  }

  // Input insertion order is sorted and the fixed RNG removes a hidden source
  // of drift in the Louvain implementation. The membership ID below is based
  // on members, not Louvain's numeric labels.
  const assignment = louvain(topology, { resolution: 1, rng: () => 0.5 });
  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const key = String(assignment[id]);
    (grouped.get(key) ?? grouped.set(key, []).get(key)!).push(id);
  }

  const result = new Map<string, string>();
  for (const members of grouped.values()) {
    const id = communityId(members);
    for (const member of members) result.set(member, id);
  }
  return result;
}

function connectedComponents(graph: Graph, degree: Map<string, number>): DiscoveryComponent[] {
  const adjacency = new Map<string, Set<string>>();
  for (const id of graph.nodes.keys()) adjacency.set(id, new Set());
  for (const edge of graph.edges) {
    if (!graph.nodes.has(edge.src) || !graph.nodes.has(edge.dst)) continue;
    adjacency.get(edge.src)!.add(edge.dst);
    adjacency.get(edge.dst)!.add(edge.src);
  }
  const seen = new Set<string>();
  const results: DiscoveryComponent[] = [];
  for (const start of [...graph.nodes.keys()].sort()) {
    if (seen.has(start)) continue;
    const ids: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const id = queue.shift()!;
      ids.push(id);
      for (const next of [...(adjacency.get(id) ?? [])].sort()) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const set = new Set(ids);
    const records = ids.map((id) => record(graph.nodes.get(id)!, degree)).sort(compareRecords);
    const relationshipCount = graph.edges.filter((edge) => set.has(edge.src) && set.has(edge.dst)).length;
    results.push({
      id: `component-${stableHash([...ids].sort().join('\u001f'))}`,
      recordCount: ids.length,
      relationshipCount,
      records: records.slice(0, 6),
      isolated: ids.length === 1 && relationshipCount === 0,
    });
  }
  return results.sort((a, b) => a.recordCount - b.recordCount || a.id.localeCompare(b.id));
}

async function analyze(): Promise<Analysis> {
  const graph = await loadGraph();
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    if (!graph.nodes.has(edge.src) || !graph.nodes.has(edge.dst)) continue;
    degree.set(edge.src, (degree.get(edge.src) ?? 0) + 1);
    degree.set(edge.dst, (degree.get(edge.dst) ?? 0) + 1);
  }
  const communityByNode = louvainCommunities(graph);
  const members = new Map<string, string[]>();
  for (const id of [...graph.nodes.keys()].sort()) {
    const idForNode = communityByNode.get(id)!;
    (members.get(idForNode) ?? members.set(idForNode, []).get(idForNode)!).push(id);
  }

  const recordsFor = (ids: readonly string[]) => ids.map((id) => record(graph.nodes.get(id)!, degree)).sort(compareRecords);
  const labelFor = (ids: readonly string[]) => recordsFor(ids).slice(0, 2).map((item) => item.title).join(' · ') || 'Untitled records';
  const raw = [...members.entries()].map(([id, ids]) => {
    const recordTypes: Record<string, number> = {};
    for (const nodeId of ids) {
      const type = graph.nodes.get(nodeId)!.type;
      recordTypes[type] = (recordTypes[type] ?? 0) + 1;
    }
    return {
      id,
      label: labelFor(ids),
      memberCount: ids.length,
      recordTypes,
      representatives: recordsFor(ids).slice(0, 3),
      connections: [] as DiscoveryConnection[],
    };
  });
  const byId = new Map(raw.map((item) => [item.id, item]));
  const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    const from = communityByNode.get(edge.src);
    const to = communityByNode.get(edge.dst);
    if (!from || !to || from === to) continue;
    const key = from < to ? `${from}\u001f${to}` : `${to}\u001f${from}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, relationships] of counts) {
    const [a, b] = key.split('\u001f');
    const ca = byId.get(a!);
    const cb = byId.get(b!);
    if (!ca || !cb) continue;
    ca.connections.push({ communityId: cb.id, label: cb.label, relationships });
    cb.connections.push({ communityId: ca.id, label: ca.label, relationships });
  }
  for (const item of raw) {
    item.connections.sort((a, b) => b.relationships - a.relationships || a.label.localeCompare(b.label));
  }
  const communities = raw.sort((a, b) => b.memberCount - a.memberCount || a.label.localeCompare(b.label));
  return { graph, communities, communityByNode, byId, degree, components: connectedComponents(graph, degree) };
}

export async function graphDiscovery(): Promise<GraphDiscoveryResult> {
  const analysis = await analyze();
  const bridges: DiscoveryBridge[] = [];
  for (const node of analysis.graph.nodes.values()) {
    const own = analysis.communityByNode.get(node.id);
    if (!own) continue;
    const otherCommunities = new Set<string>();
    const otherNeighbors = new Set<string>();
    for (const edge of analysis.graph.bySrc.get(node.id) ?? []) {
      const community = analysis.communityByNode.get(edge.dst);
      if (community && community !== own) {
        otherCommunities.add(community);
        otherNeighbors.add(edge.dst);
      }
    }
    for (const edge of analysis.graph.byDst.get(node.id) ?? []) {
      const community = analysis.communityByNode.get(edge.src);
      if (community && community !== own) {
        otherCommunities.add(community);
        otherNeighbors.add(edge.src);
      }
    }
    if (!otherCommunities.size) continue;
    bridges.push({
      ...record(node, analysis.degree),
      communities: [...otherCommunities]
        .map((id) => analysis.byId.get(id))
        .filter((item): item is DiscoveryCommunity => Boolean(item))
        .map((item) => ({ id: item.id, label: item.label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      connectedCommunityCount: otherCommunities.size,
      crossCommunityNeighborCount: otherNeighbors.size,
    });
  }
  bridges.sort(
    (a, b) =>
      b.connectedCommunityCount - a.connectedCommunityCount ||
      b.crossCommunityNeighborCount - a.crossCommunityNeighborCount ||
      compareRecords(a, b),
  );
  const disconnected = analysis.components.filter((component) => component.isolated || component.recordCount > 1);
  return {
    totals: {
      records: analysis.graph.nodes.size,
      relationships: analysis.graph.edges.length,
      communities: analysis.communities.length,
      components: analysis.components.length,
      isolatedRecords: analysis.components.filter((component) => component.isolated).length,
    },
    communities: analysis.communities,
    bridges,
    disconnected,
    explanation: 'Communities are computed from recorded relationships. The map groups records with denser connections to each other; names come from the records with the most connections.',
  };
}

export async function communityDetail(options: { id: string; offset?: number; limit?: number; q?: string }): Promise<CommunityDetailResult | null> {
  const analysis = await analyze();
  const community = analysis.byId.get(options.id);
  if (!community) return null;
  const ids = [...analysis.communityByNode.entries()]
    .filter(([, id]) => id === options.id)
    .map(([id]) => id);
  const query = options.q?.trim().toLowerCase();
  const allMembers = ids
    .map((id) => record(analysis.graph.nodes.get(id)!, analysis.degree))
    .filter((item) => !query || item.title.toLowerCase().includes(query) || item.type.includes(query))
    .sort(compareRecords);
  const memberSet = new Set(ids);
  const allRelationships = analysis.graph.edges
    .filter((edge) => memberSet.has(edge.src) && memberSet.has(edge.dst))
    .sort((a, b) => a.id.localeCompare(b.id));
  const from = page(options.offset);
  const take = limit(options.limit);
  const members = allMembers.slice(from, from + take);
  const sceneMembers = allMembers.slice(0, SCENE_RECORD_CAP);
  const visible = new Set(sceneMembers.map((item) => item.id));
  const relationships = allRelationships
    .filter((edge) => visible.has(edge.src) && visible.has(edge.dst))
    .slice(0, Math.max(0, SCENE_ELEMENT_CAP - sceneMembers.length))
    .map(relationship);
  return {
    community,
    members,
    relationships,
    totalMembers: allMembers.length,
    totalRelationships: allRelationships.length,
    offset: from,
    limit: take,
    sceneTruncated: sceneMembers.length < allMembers.length || relationships.length < allRelationships.length,
  };
}

export async function communityConnectionDetail(options: { from: string; to: string; offset?: number; limit?: number }): Promise<ConnectionDetailResult | null> {
  const analysis = await analyze();
  const from = analysis.byId.get(options.from);
  const to = analysis.byId.get(options.to);
  if (!from || !to || from.id === to.id) return null;
  const relationships = analysis.graph.edges
    .filter((edge) => {
      const a = analysis.communityByNode.get(edge.src);
      const b = analysis.communityByNode.get(edge.dst);
      return (a === from.id && b === to.id) || (a === to.id && b === from.id);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const start = page(options.offset);
  const take = limit(options.limit);
  return {
    from: { id: from.id, label: from.label },
    to: { id: to.id, label: to.label },
    relationships: relationships.slice(start, start + take).map(relationship),
    totalRelationships: relationships.length,
    offset: start,
    limit: take,
  };
}
