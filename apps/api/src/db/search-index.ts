/**
 * In-app full-text + fuzzy search index (SRS FR-SRCH-001..004). Built from live
 * nodes with FlexSearch; rebuilt lazily when marked dirty by a mutation. At A5 scale
 * (single user, ≤50k nodes) an in-memory index is fast and simple.
 *
 * It powers three surfaces:
 *   • unified ranked FTS over title/subtitle/notes/props (FR-SRCH-001)
 *   • the filter-grammar clauses applied on top (FR-SRCH-002)
 *   • the ⌘P fuzzy quick-switcher over titles (FR-SRCH-004)
 */
import FlexSearchPkg from 'flexsearch';
import { parseFilterQuery, trigramSimilarity, type NodeRecord } from '@vitae/core';
import { repository } from './repository.js';
import { currentSpace, type Space } from './space.js';

// FlexSearch ships an awkward CJS/ESM default; normalize it.
const FlexSearch = (FlexSearchPkg as unknown as { Document?: unknown }).Document
  ? (FlexSearchPkg as unknown as { Document: new (o: unknown) => FlexDoc })
  : ((FlexSearchPkg as unknown as { default: { Document: new (o: unknown) => FlexDoc } }).default);

interface FlexDoc {
  add(doc: Record<string, unknown>): void;
  search(query: string, opts?: Record<string, unknown>): Array<{ field: string; result: string[] }>;
}

const WHITELISTED_PROPS = ['headline', 'outcome', 'description', 'saved_reason', 'extracted_text', 'one_liner', 'blurb', 'jd_text', 'prep_notes', 'reflection', 'relationship'];

export interface SearchHit {
  node: NodeRecord;
  score: number;
}

class SearchIndex {
  private index: FlexDoc | null = null;
  private nodesById = new Map<string, NodeRecord>();
  /**
   * Invalidation is a generation counter, not a boolean (FR-017). A mutation
   * during an in-flight rebuild bumps `generation`; the finishing rebuild only
   * publishes itself if it read at that generation, otherwise the mutation it
   * missed would be lost until the next unrelated write. `building` shares one
   * in-flight build between concurrent searches instead of doing the work twice.
   */
  private generation = 1;
  private builtGeneration = 0;
  private building: Promise<void> | null = null;
  private remoteGeneration: number | null = null;
  private remoteCheckedAt = 0;

  markDirty(): void {
    this.generation += 1;
    // The counter increments atomically in the upsert, so two processes marking
    // dirty at once cannot lose one of the bumps.
    void repository
      .publishSearchInvalidation()
      .catch((error: unknown) => console.error('[search] invalidation publish failed:', error));
  }

  private async refreshRemoteGeneration(): Promise<void> {
    if (Date.now() - this.remoteCheckedAt < 1_000) return;
    this.remoteCheckedAt = Date.now();
    const doc = await repository.docGet<{ generation?: number }>('meta', 'search_generation');
    const remote = Number(doc?.generation ?? 0);
    if (this.remoteGeneration !== null && remote !== this.remoteGeneration) this.generation += 1;
    this.remoteGeneration = remote;
  }

  private propsText(node: NodeRecord): string {
    const props = node.props as Record<string, unknown>;
    return WHITELISTED_PROPS.map((k) => (typeof props[k] === 'string' ? (props[k] as string) : ''))
      .filter(Boolean)
      .join(' ');
  }

  async ensureBuilt(): Promise<void> {
    await this.refreshRemoteGeneration();
    for (;;) {
      if (this.index && this.builtGeneration === this.generation) return;
      if (!this.building) {
        this.building = this.build().finally(() => {
          this.building = null;
        });
      }
      await this.building;
      // A mutation may have landed during that build. Loop and rebuild against
      // the new generation before serving this search.
    }
  }

  private async build(): Promise<void> {
    const startedAt = this.generation;
    const nodes = await repository.allLiveNodes();
    const idx = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title', 'subtitle', 'notes', 'props'],
      },
      tokenize: 'forward',
    });
    const byId = new Map<string, NodeRecord>();
    for (const n of nodes) {
      byId.set(n.id, n);
      idx.add({
        id: n.id,
        title: n.title,
        subtitle: n.subtitle ?? '',
        notes: n.notes_md ?? '',
        props: this.propsText(n),
      });
    }
    // Do not publish a snapshot that was invalidated while the graph was being
    // read. ensureBuilt() will immediately retry against the newer generation.
    if (startedAt === this.generation) {
      this.index = idx;
      this.nodesById = byId;
      this.builtGeneration = startedAt;
    }
  }

  /** Unified search: free text (FTS) + filter clauses, ranked. */
  async search(rawQuery: string, opts: { limit?: number } = {}): Promise<SearchHit[]> {
    await this.ensureBuilt();
    const ast = parseFilterQuery(rawQuery);
    const limit = opts.limit ?? 50;

    let candidates: NodeRecord[];
    if (ast.text) {
      const ranked = this.index!.search(ast.text, { limit: 200 });
      const ids = new Set<string>();
      for (const group of ranked) for (const id of group.result) ids.add(id as string);
      candidates = [...ids].map((id) => this.nodesById.get(id)!).filter(Boolean);
    } else {
      candidates = [...this.nodesById.values()];
    }

    const filtered = candidates.filter((n) => this.matchesClauses(n, ast.clauses));

    // Rank: exact-title bonus + recency + pinned (SRS FR-SRCH-003), deterministic.
    const q = ast.text.toLowerCase();
    const scored = filtered.map((n) => {
      let score = 0;
      if (q && n.title.toLowerCase() === q) score += 5;
      if (q && n.title.toLowerCase().includes(q)) score += 2;
      if (n.pinned) score += 1;
      score += trigramSimilarity(q || n.title, n.title);
      return { node: n, score };
    });
    scored.sort(
      (a, b) => b.score - a.score || b.node.updated_at.localeCompare(a.node.updated_at) || a.node.id.localeCompare(b.node.id),
    );
    return scored.slice(0, limit);
  }

  /** Fuzzy title-only quick-switcher (⌘P). Trigram-tolerant. */
  async quickSwitch(
    query: string,
    opts: { limit?: number; types?: string[] } = {},
  ): Promise<SearchHit[]> {
    await this.ensureBuilt();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const typeSet = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;
    const limit = opts.limit ?? (typeSet ? 20 : 10);
    const scored = [...this.nodesById.values()]
      .filter((n) => (typeSet ? typeSet.has(n.type) : true))
      .map((n) => ({ node: n, score: trigramSimilarity(q, n.title) + (n.title.toLowerCase().includes(q) ? 0.5 : 0) }))
      .filter((s) => s.score > 0.15)
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
    return scored.slice(0, limit);
  }

  private matchesClauses(n: NodeRecord, clauses: ReturnType<typeof parseFilterQuery>['clauses']): boolean {
    for (const c of clauses) {
      const v = c.value.toLowerCase();
      switch (c.field) {
        case 'type':
          if (n.type !== v) return false;
          break;
        case 'before':
          if (!(n.start_date && n.start_date < c.value)) return false;
          break;
        case 'after':
          if (!(n.start_date && n.start_date > c.value)) return false;
          break;
        case 'is':
          if (v === 'archived' && !n.archived_at) return false;
          if (v === 'pinned' && !n.pinned) return false;
          if (v === 'sensitive' && n.sensitivity !== 'sensitive') return false;
          break;
        case 'source':
          if (n.source !== v) return false;
          break;
        case 'city': {
          const city = (n.props as Record<string, unknown>).city;
          if (typeof city !== 'string' || city.toLowerCase() !== v) return false;
          break;
        }
        default:
          break; // tag/org/shared_by/has need edge joins, handled by callers/v2
      }
    }
    return true;
  }
}

// One index per data space (real vs demo) so demo mode never leaks into, or
// reads stale results from, the real graph. Resolved per call via ALS.
const instances = new Map<Space, SearchIndex>();
function indexForSpace(): SearchIndex {
  const space = currentSpace();
  let idx = instances.get(space);
  if (!idx) {
    idx = new SearchIndex();
    instances.set(space, idx);
  }
  return idx;
}

export const searchIndex = {
  markDirty: (): void => indexForSpace().markDirty(),
  ensureBuilt: (): Promise<void> => indexForSpace().ensureBuilt(),
  search: (rawQuery: string, opts: { limit?: number } = {}): Promise<SearchHit[]> => indexForSpace().search(rawQuery, opts),
  quickSwitch: (
    query: string,
    opts: { limit?: number; types?: string[] } = {},
  ): Promise<SearchHit[]> => indexForSpace().quickSwitch(query, opts),
};
