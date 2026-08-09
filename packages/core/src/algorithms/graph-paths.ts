/**
 * Warm-intro path finding (reference P: intros). Deterministic bounded search
 * from self to a target organization over the social layer of the life graph.
 *
 * Model: hops traverse KNOWS (person↔person, weight = tie strength) and
 * affiliation chains person -HELD-> role -ROLE_AT-> org (collapsed to one
 * person→org hop with a fixed weight). An introduction edge (INTRODUCED) also
 * counts. Path score = product of hop strengths, so long weak chains rank
 * below short strong ones. Results are sorted by score, deterministically
 * tie-broken by path node ids.
 */

export interface PathGraphNode {
  id: string;
  type: string;
  title: string;
}

export interface PathGraphEdge {
  src: string;
  dst: string;
  type: string;
  /** For KNOWS edges: persisted tie strength ∈ [0,1]. */
  strength?: number;
}

export interface PathHop {
  nodeId: string;
  title: string;
  type: string;
  /** Edge that led into this node (absent on the first hop = self). */
  viaEdgeType?: string;
  viaStrength?: number;
}

export interface IntroPath {
  hops: PathHop[];
  score: number;
}

export interface FindPathsOptions {
  maxHops?: number; // person-to-person hops before the org hop
  maxPaths?: number;
  /** Weight for a person→org affiliation hop (they work there). */
  affiliationWeight?: number;
  /** Floor for KNOWS strength so unknown strengths still traverse. */
  minStrength?: number;
}

interface Adj {
  to: string;
  edgeType: string;
  strength: number;
}

const DEFAULTS: Required<FindPathsOptions> = {
  maxHops: 3,
  maxPaths: 5,
  affiliationWeight: 0.9,
  minStrength: 0.05,
};

/**
 * Find up to `maxPaths` simple paths self → … → targetOrg, ranked by the
 * product of hop strengths.
 */
export function findIntroPaths(
  nodes: PathGraphNode[],
  edges: PathGraphEdge[],
  selfId: string,
  targetOrgId: string,
  options: FindPathsOptions = {},
): IntroPath[] {
  const opts = { ...DEFAULTS, ...options };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(selfId) || !byId.has(targetOrgId)) return [];

  // Build adjacency over persons; org affiliation collapses role hops.
  const adj = new Map<string, Adj[]>();
  const add = (from: string, to: string, edgeType: string, strength: number) => {
    (adj.get(from) ?? adj.set(from, []).get(from)!).push({ to, edgeType, strength });
  };

  // person -HELD-> role -ROLE_AT-> org (two directed edge lists to join).
  const heldByRole = new Map<string, string[]>(); // roleId -> [personId]
  const roleAt = new Map<string, string>(); // roleId -> orgId
  for (const e of edges) {
    if (e.type === 'HELD') (heldByRole.get(e.dst) ?? heldByRole.set(e.dst, []).get(e.dst)!).push(e.src);
    if (e.type === 'ROLE_AT') roleAt.set(e.src, e.dst);
  }
  for (const [roleId, orgId] of roleAt) {
    for (const personId of heldByRole.get(roleId) ?? []) {
      add(personId, orgId, 'works_at', opts.affiliationWeight);
    }
  }

  for (const e of edges) {
    if (e.type === 'KNOWS') {
      const s = Math.max(opts.minStrength, e.strength ?? opts.minStrength);
      add(e.src, e.dst, 'knows', s);
      add(e.dst, e.src, 'knows', s);
    } else if (e.type === 'INTRODUCED') {
      const s = Math.max(opts.minStrength, e.strength ?? 0.5);
      add(e.src, e.dst, 'introduced', s);
      add(e.dst, e.src, 'introduced', s);
    }
  }

  // Sort adjacency for determinism.
  for (const list of adj.values()) list.sort((a, b) => b.strength - a.strength || a.to.localeCompare(b.to));

  // Bounded DFS over simple paths.
  const results: IntroPath[] = [];
  const visited = new Set<string>([selfId]);
  const hops: PathHop[] = [{ nodeId: selfId, title: byId.get(selfId)!.title, type: byId.get(selfId)!.type }];

  function dfs(nodeId: string, score: number, personHops: number) {
    for (const a of adj.get(nodeId) ?? []) {
      if (a.to === targetOrgId) {
        const org = byId.get(targetOrgId)!;
        results.push({
          hops: [...hops, { nodeId: org.id, title: org.title, type: org.type, viaEdgeType: a.edgeType, viaStrength: a.strength }],
          score: score * a.strength,
        });
        continue;
      }
      const node = byId.get(a.to);
      if (!node || node.type !== 'person' || visited.has(a.to)) continue;
      if (personHops >= opts.maxHops) continue;
      visited.add(a.to);
      hops.push({ nodeId: a.to, title: node.title, type: node.type, viaEdgeType: a.edgeType, viaStrength: a.strength });
      dfs(a.to, score * a.strength, personHops + 1);
      hops.pop();
      visited.delete(a.to);
    }
  }

  dfs(selfId, 1, 0);

  // De-duplicate by hop-id signature, rank by score.
  const seen = new Set<string>();
  return results
    .filter((p) => {
      const key = p.hops.map((h) => h.nodeId).join('>');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.hops.length - b.hops.length || a.hops.map((h) => h.nodeId).join().localeCompare(b.hops.map((h) => h.nodeId).join()))
    .slice(0, opts.maxPaths);
}
