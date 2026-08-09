/**
 * Token-level Aho-Corasick automaton (SRS §10.2: "Aho-Corasick alias
 * matching"). Matches multi-word skill aliases against a token stream in a
 * single linear pass, which is how the JD parser finds every dictionary term
 * (e.g. "reinforcement learning", "node.js") without O(patterns × text) scanning.
 */

interface ACNode {
  children: Map<string, number>;
  fail: number;
  /** Pattern ids whose token sequence ends at this node. */
  outputs: number[];
  depth: number;
}

export interface ACMatch<M> {
  /** Token index where the match starts (inclusive). */
  start: number;
  /** Token index where the match ends (inclusive). */
  end: number;
  /** Number of tokens in the matched pattern. */
  length: number;
  meta: M;
}

export class AhoCorasick<M> {
  private nodes: ACNode[] = [{ children: new Map(), fail: 0, outputs: [], depth: 0 }];
  private patterns: Array<{ tokens: string[]; meta: M }> = [];
  private built = false;

  /** Register a pattern (its token sequence) with attached metadata. */
  add(tokens: string[], meta: M): void {
    if (tokens.length === 0) return;
    let cur = 0;
    for (const tok of tokens) {
      const node = this.nodes[cur]!;
      let next = node.children.get(tok);
      if (next === undefined) {
        next = this.nodes.length;
        this.nodes.push({ children: new Map(), fail: 0, outputs: [], depth: node.depth + 1 });
        node.children.set(tok, next);
      }
      cur = next;
    }
    const id = this.patterns.length;
    this.patterns.push({ tokens, meta });
    this.nodes[cur]!.outputs.push(id);
    this.built = false;
  }

  /** Build fail links (BFS). Idempotent; called lazily by {@link search}. */
  build(): void {
    const queue: number[] = [];
    for (const child of this.nodes[0]!.children.values()) {
      this.nodes[child]!.fail = 0;
      queue.push(child);
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = this.nodes[cur]!;
      for (const [tok, child] of node.children) {
        let f = node.fail;
        while (f !== 0 && !this.nodes[f]!.children.has(tok)) f = this.nodes[f]!.fail;
        const failNode = this.nodes[f]!.children.get(tok);
        this.nodes[child]!.fail = failNode !== undefined && failNode !== child ? failNode : 0;
        this.nodes[child]!.outputs.push(...this.nodes[this.nodes[child]!.fail]!.outputs);
        queue.push(child);
      }
    }
    this.built = true;
  }

  /** Return every pattern occurrence in `tokens`. */
  search(tokens: string[]): Array<ACMatch<M>> {
    if (!this.built) this.build();
    const matches: Array<ACMatch<M>> = [];
    let state = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      while (state !== 0 && !this.nodes[state]!.children.has(tok)) {
        state = this.nodes[state]!.fail;
      }
      state = this.nodes[state]!.children.get(tok) ?? 0;
      for (const id of this.nodes[state]!.outputs) {
        const pat = this.patterns[id]!;
        matches.push({
          start: i - pat.tokens.length + 1,
          end: i,
          length: pat.tokens.length,
          meta: pat.meta,
        });
      }
    }
    return matches;
  }
}
