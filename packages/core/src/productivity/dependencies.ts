/**
 * Cycle detection for the `DEPENDS_ON` graph. Not a database constraint.
 */
export interface DependsOnEdge {
  readonly src: string;
  readonly dst: string;
}

/**
 * True when the directed graph has a cycle (including a 1-cycle / self-loop).
 */
export function dependsOnCycle(edges: readonly DependsOnEdge[]): boolean {
  const graph = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const edge of edges) {
    nodes.add(edge.src);
    nodes.add(edge.dst);
    const next = graph.get(edge.src) ?? [];
    next.push(edge.dst);
    graph.set(edge.src, next);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of nodes) {
    if (visit(node)) return true;
  }
  return false;
}
