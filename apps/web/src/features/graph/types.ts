import type { NodeObject } from 'react-force-graph-2d';

export interface GNode {
  id: string;
  type: string;
  title: string;
  isSelf: boolean;
  degree: number;
  hop: number;
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
