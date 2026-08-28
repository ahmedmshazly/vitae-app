/**
 * Personalized PageRank over the typed life graph (SRS §10.7.3).
 *
 * PPR is the principled generalization of ad-hoc "shared org / 2-hop"
 * heuristics for social/organizational proximity [Kloumann 2016]. We run power
 * iteration from a seed distribution (the self node, optionally averaged with a
 * target-org node) over a graph whose edges carry per-type transition weights
 * (KNOWS·closeness > WORKED_ON > ATTENDED ...). Computed nightly and cached on
 * person nodes; at A5 scale (≤50k nodes) this is well under a second.
 */
import { PAGERANK } from './constants.js';

export interface GraphEdge {
  src: string;
  dst: string;
  type: string;
  /** Optional per-edge multiplier (e.g. KNOWS closeness/5). */
  weight?: number;
}

export interface PageRankOptions {
  alpha?: number;
  maxIterations?: number;
  tolerance?: number;
  edgeWeights?: Record<string, number>;
}

/**
 * @param nodes    all node ids in the graph
 * @param edges    directed edges (undirected relations should be supplied both ways)
 * @param seeds    seed node ids → mass; normalized internally (the teleport set)
 */
export function personalizedPageRank(
  nodes: string[],
  edges: GraphEdge[],
  seeds: Record<string, number>,
  options: PageRankOptions = {},
): Map<string, number> {
  const alpha = options.alpha ?? PAGERANK.alpha;
  const maxIter = options.maxIterations ?? PAGERANK.maxIterations;
  const tol = options.tolerance ?? PAGERANK.tolerance;
  const edgeWeights = options.edgeWeights ?? PAGERANK.edgeWeights;

  const n = nodes.length;
  const rank = new Map<string, number>();
  if (n === 0) return rank;

  const index = new Map<string, number>();
  nodes.forEach((id, i) => index.set(id, i));

  // Weighted out-adjacency and out-degree.
  const out: Array<Array<{ j: number; w: number }>> = Array.from({ length: n }, () => []);
  const outSum = new Array<number>(n).fill(0);
  for (const e of edges) {
    const i = index.get(e.src);
    const j = index.get(e.dst);
    if (i === undefined || j === undefined) continue;
    const w = (edgeWeights[e.type] ?? 1) * (e.weight ?? 1);
    if (w <= 0) continue;
    out[i]!.push({ j, w });
    outSum[i]! += w;
  }

  // Normalized teleport vector from seeds (falls back to uniform).
  const teleport = new Array<number>(n).fill(0);
  let seedTotal = 0;
  for (const [id, mass] of Object.entries(seeds)) {
    const i = index.get(id);
    if (i !== undefined && mass > 0) {
      teleport[i]! += mass;
      seedTotal += mass;
    }
  }
  if (seedTotal === 0) {
    teleport.fill(1 / n);
  } else {
    for (let i = 0; i < n; i++) teleport[i]! /= seedTotal;
  }

  let r = teleport.slice();
  for (let iter = 0; iter < maxIter; iter++) {
    const next = new Array<number>(n).fill(0);
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (outSum[i]! === 0) {
        danglingMass += r[i]!;
        continue;
      }
      const share = r[i]! / outSum[i]!;
      for (const { j, w } of out[i]!) next[j]! += share * w;
    }
    // (1 − alpha) walk + alpha teleport + redistribute dangling mass via teleport.
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const walked = (1 - alpha) * (next[i]! + danglingMass * teleport[i]!);
      const value = walked + alpha * teleport[i]!;
      delta += Math.abs(value - r[i]!);
      next[i] = value;
    }
    r = next;
    if (delta < tol) break;
  }

  nodes.forEach((id, i) => rank.set(id, r[i]!));
  return rank;
}
