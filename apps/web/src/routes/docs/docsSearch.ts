/**
 * Full-text search over the corpus, without a search dependency.
 *
 * The index is built once at build time and read as static JSON, for the same
 * reason the pages are: it must work with the API stopped and it must not
 * enter the JavaScript budget. What is left at runtime is scoring, which is
 * about eighty lines of BM25 and nothing else.
 *
 * The tokenizer is not written here. `@vitae/core`'s `algorithms/text.ts`
 * already normalises, tokenises and stems for the product's own search, and it
 * is already tested and already tuned to keep technical tokens intact: `c++`
 * and `node.js` survive it. Using it means a reader who searches the
 * documentation and a reader who searches their own graph get the same idea of
 * what a word is, and there is one stemmer in this repository rather than two
 * that agree until they do not.
 *
 * Both halves live here on purpose. The builder runs in Node inside Vite's
 * config loader; the scorer runs in the browser. A field weight or a stemming
 * rule that differed between them would silently rank against an index built
 * under different assumptions, which is the kind of defect that never produces
 * an error, only quietly wrong results.
 */
import { STOPWORDS, stem, tokenize } from '@vitae/core';
import type { DocsAudience, DocsPageSummary, DocsStatus, DocsType } from './docsModel.js';

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * How much a hit is worth by where it lands.
 *
 * A word in a title is a much stronger signal than the same word in the tenth
 * paragraph, and the corpus is written so that titles and summaries carry the
 * subject. Weighting at index time rather than at query time keeps the scorer
 * free of field bookkeeping: by the time it runs, a term frequency already
 * means "how much this page is about this word".
 */
const FIELD_WEIGHT = { title: 8, summary: 4, heading: 3, body: 1 } as const;

/** BM25's saturation and length-normalisation constants, at their usual values. */
const K1 = 1.2;
const B = 0.75;

/** One page, as the index knows it. */
export interface DocsIndexDocument {
  id: string;
  route: string;
  title: string;
  summary: string;
  audience: readonly DocsAudience[];
  domain: string;
  section: string | null;
  type: DocsType;
  status: DocsStatus;
  /** Section headings, so a result can say which part of the page matched. */
  headings: readonly { id: string; text: string }[];
}

export interface DocsSearchIndex {
  version: 1;
  documents: readonly DocsIndexDocument[];
  /** term -> [document index, weighted frequency] pairs, ascending by index. */
  postings: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /** Weighted length of each document, and the mean, for length normalisation. */
  lengths: readonly number[];
  averageLength: number;
}

/** What the builder needs from a page beyond its manifest entry. */
export interface DocsIndexInput {
  summary: DocsPageSummary;
  headings: readonly { id: string; text: string; level: number }[];
  /** The page's prose, already flattened out of the block tree. */
  text: string;
}

/**
 * A term as the index stores it.
 *
 * Both the stem and the original token go in. Stemming alone loses exact
 * technical spellings a reader is likely to type verbatim; the original alone
 * fails to match "migrations" against a page that says "migration". Indexing
 * both costs a little size and removes both failures.
 */
function terms(text: string): string[] {
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (STOPWORDS.has(token)) continue;
    out.push(token);
    const stemmed = stem(token);
    if (stemmed !== token) out.push(stemmed);
  }
  return out;
}

function addTerms(into: Map<string, number>, text: string, weight: number): number {
  let length = 0;
  for (const term of terms(text)) {
    into.set(term, (into.get(term) ?? 0) + weight);
    length += weight;
  }
  return length;
}

/**
 * Build the index. Deterministic: the same corpus produces byte-identical JSON.
 *
 * That matters because the artifact is regenerated in CI and compared. Sorting
 * the term list and the postings is what makes the comparison meaningful. A
 * map's insertion order would otherwise turn a reordered page into a diff.
 */
export function buildDocsIndex(inputs: readonly DocsIndexInput[]): DocsSearchIndex {
  const documents: DocsIndexDocument[] = [];
  const lengths: number[] = [];
  const postings = new Map<string, [number, number][]>();

  inputs.forEach((input, index) => {
    const { summary } = input;
    const counts = new Map<string, number>();
    let length = 0;
    length += addTerms(counts, summary.title, FIELD_WEIGHT.title);
    length += addTerms(counts, summary.summary, FIELD_WEIGHT.summary);
    for (const heading of input.headings) {
      length += addTerms(counts, heading.text, FIELD_WEIGHT.heading);
    }
    length += addTerms(counts, input.text, FIELD_WEIGHT.body);

    for (const [term, frequency] of counts) {
      const list = postings.get(term);
      if (list) list.push([index, frequency]);
      else postings.set(term, [[index, frequency]]);
    }

    documents.push({
      id: summary.id,
      route: summary.route,
      title: summary.title,
      summary: summary.summary,
      audience: summary.audience,
      domain: summary.domain,
      section: summary.section,
      type: summary.type,
      status: summary.status,
      headings: input.headings.filter((h) => h.level === 2).map((h) => ({ id: h.id, text: h.text })),
    });
    lengths.push(length);
  });

  const sorted: Record<string, readonly (readonly [number, number])[]> = {};
  for (const term of [...postings.keys()].sort()) sorted[term] = postings.get(term)!;

  const total = lengths.reduce((sum, value) => sum + value, 0);
  return {
    version: 1,
    documents,
    postings: sorted,
    lengths,
    averageLength: lengths.length === 0 ? 0 : total / lengths.length,
  };
}

// ---------------------------------------------------------------------------
// Asking it a question
// ---------------------------------------------------------------------------

export interface DocsFacets {
  audience?: readonly DocsAudience[];
  domain?: readonly string[];
  type?: readonly DocsType[];
  status?: readonly DocsStatus[];
}

export interface DocsSearchHit {
  document: DocsIndexDocument;
  score: number;
  /** The terms that actually matched, for highlighting and for explaining a result. */
  matched: readonly string[];
}

export interface DocsFacetCount {
  value: string;
  count: number;
}

export interface DocsSearchResult {
  hits: readonly DocsSearchHit[];
  /** How many results each facet value would give, counted before filtering. */
  facets: Readonly<Record<keyof DocsFacets, readonly DocsFacetCount[]>>;
  /** Terms from the query that no page contains, so the surface can say so. */
  missing: readonly string[];
  /**
   * Whether every asked-for word is on every result.
   *
   * `any` means no page carried them all and this is the relaxed answer. The
   * surface says so, because a list that silently drops half the query looks
   * like a wrong result rather than a widened one.
   */
  mode: 'all' | 'any';
}

const EMPTY: DocsSearchResult = {
  hits: [],
  facets: { audience: [], domain: [], type: [], status: [] },
  missing: [],
  mode: 'all',
};

/**
 * Expand the final query term by prefix.
 *
 * Someone typing "migrat" has not finished the word, and refusing to match
 * until they do makes the surface feel broken rather than precise. Only the
 * last term expands, and only when it is short of a real word boundary, so an
 * earlier complete term still constrains the result.
 */
function expandLast(index: DocsSearchIndex, term: string): string[] {
  if (index.postings[term]) return [term];
  const found: string[] = [];
  for (const candidate of Object.keys(index.postings)) {
    if (candidate.startsWith(term)) found.push(candidate);
    if (found.length >= 24) break;
  }
  return found;
}

function idf(documentCount: number, containing: number): number {
  return Math.log(1 + (documentCount - containing + 0.5) / (containing + 0.5));
}

function matchesFacets(document: DocsIndexDocument, facets: DocsFacets): boolean {
  if (facets.domain?.length && !facets.domain.includes(document.domain)) return false;
  if (facets.type?.length && !facets.type.includes(document.type)) return false;
  if (facets.status?.length && !facets.status.includes(document.status)) return false;
  if (facets.audience?.length && !facets.audience.some((who) => document.audience.includes(who))) {
    return false;
  }
  return true;
}

function countFacets(hits: readonly DocsSearchHit[]): DocsSearchResult['facets'] {
  const tally = (pick: (d: DocsIndexDocument) => readonly string[]) => {
    const counts = new Map<string, number>();
    for (const hit of hits) {
      for (const value of pick(hit.document)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  return {
    audience: tally((d) => d.audience),
    domain: tally((d) => [d.domain]),
    type: tally((d) => [d.type]),
    status: tally((d) => [d.status]),
  };
}

/**
 * Score the corpus against a query.
 *
 * Facets filter what is returned but not what is counted: the counts describe
 * the whole match set, so a reader narrowing by audience can see what they are
 * about to exclude rather than watching numbers appear and vanish.
 */
export function searchDocs(
  index: DocsSearchIndex,
  query: string,
  facets: DocsFacets = {},
): DocsSearchResult {
  const asked = tokenize(query).filter((token) => !STOPWORDS.has(token));
  if (asked.length === 0) return EMPTY;

  const documentCount = index.documents.length;
  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();
  // How many of the asked-for words each page carries. BM25 on its own is an
  // OR query, and on a corpus this small that answers "workspace primary key"
  // with every page that says "key". Counting the words satisfied lets the
  // result require all of them and relax only when nothing satisfies all.
  const satisfied = new Map<number, number>();
  const missing: string[] = [];
  let wanted = 0;

  asked.forEach((token, position) => {
    const last = position === asked.length - 1;
    const stemmed = stem(token);
    const candidates = new Set<string>();
    for (const form of [token, stemmed]) {
      if (index.postings[form]) candidates.add(form);
      else if (last) for (const expanded of expandLast(index, form)) candidates.add(expanded);
    }
    if (candidates.size === 0) {
      missing.push(token);
      return;
    }
    wanted += 1;
    const here = new Set<number>();
    for (const term of candidates) {
      const list = index.postings[term] ?? [];
      const weight = idf(documentCount, list.length);
      for (const [document, frequency] of list) {
        const length = index.lengths[document] ?? 0;
        const norm = 1 - B + (B * length) / (index.averageLength || 1);
        const score = (weight * (frequency * (K1 + 1))) / (frequency + K1 * norm);
        scores.set(document, (scores.get(document) ?? 0) + score);
        const seen = matched.get(document);
        if (seen) seen.add(term);
        else matched.set(document, new Set([term]));
        here.add(document);
      }
    }
    // A word counts once per page however many of its forms hit, or a page
    // carrying both "migration" and "migrations" would look like two words.
    for (const document of here) satisfied.set(document, (satisfied.get(document) ?? 0) + 1);
  });

  const rank = (entries: readonly (readonly [number, number])[]): DocsSearchHit[] =>
    entries
      .map(([document, score]) => ({
        document: index.documents[document]!,
        score,
        matched: [...(matched.get(document) ?? [])].sort(),
      }))
      // Ties break by route so the order is stable across reloads. A result
      // list that reshuffles on every keystroke is one a reader cannot aim at.
      .sort((a, b) => b.score - a.score || a.document.route.localeCompare(b.document.route));

  const complete = [...scores].filter(([document]) => (satisfied.get(document) ?? 0) === wanted);
  const mode: 'all' | 'any' = complete.length > 0 || wanted === 0 ? 'all' : 'any';
  const all = rank(mode === 'all' ? complete : [...scores]);

  return {
    hits: all.filter((hit) => matchesFacets(hit.document, facets)),
    facets: countFacets(all),
    missing,
    mode,
  };
}
