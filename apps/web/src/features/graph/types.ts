import type { NodeObject } from 'react-force-graph-2d';

export interface GNode {
  id: string;
  type: string;
  title: string;
  isSelf: boolean;
  degree: number;
  hop: number;
  /** Overview-only island assembled from a computed community. */
  kind?: 'record' | 'community';
  communityId?: string;
  memberCount?: number;
}

export interface GEdge {
  src: string;
  dst: string;
  type: string;
  strength?: number;
  relation?: string;
  kind?: string;
}

export interface GraphData {
  focus: string | null;
  nodes: GNode[];
  edges: GEdge[];
  truncated: boolean;
}

export type FgNode = NodeObject & GNode;

export interface FgLink {
  source: string | FgNode;
  target: string | FgNode;
  type: string;
  strength?: number;
  relation?: string;
  kind?: string;
  relationshipCount?: number;
}

export type GraphMode = 'explore' | 'path';

export type GraphLens = 'neighborhood' | 'strength' | 'career' | 'hubs' | 'edgeKinds';

export interface FocusTrailHop {
  id: string;
  title: string;
}

export interface GraphPathHop {
  nodeId: string;
  title: string;
  type: string;
  viaEdgeType?: string;
  viaEdgeId?: string;
}

export interface GraphPathResult {
  from: string;
  to: string;
  hops: GraphPathHop[];
  edges: Array<{ id: string; src: string; dst: string; type: string }>;
  found: boolean;
}

export interface DiscoveryRecord {
  id: string;
  title: string;
  type: string;
  degree: number;
}

export interface DiscoveryCommunity {
  id: string;
  label: string;
  memberCount: number;
  recordTypes: Record<string, number>;
  representatives: DiscoveryRecord[];
  connections: Array<{ communityId: string; label: string; relationships: number }>;
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

export interface GraphDiscovery {
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

export interface CommunityDetail {
  community: DiscoveryCommunity;
  members: DiscoveryRecord[];
  relationships: Array<{ id: string; src: string; dst: string; type: string; relation?: string; kind?: string }>;
  totalMembers: number;
  totalRelationships: number;
  offset: number;
  limit: number;
  sceneTruncated: boolean;
}

export interface CommunityConnectionDetail {
  from: { id: string; label: string };
  to: { id: string; label: string };
  relationships: Array<{ id: string; src: string; dst: string; type: string; relation?: string; kind?: string }>;
  totalRelationships: number;
  offset: number;
  limit: number;
}

export function linkEndId(end: string | FgNode): string {
  return typeof end === 'string' ? end : end.id;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
