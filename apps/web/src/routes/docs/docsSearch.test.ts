/**
 * What the corpus search is expected to get right.
 *
 * The index is a build artifact and the scorer runs in the browser, so these
 * tests build a small corpus and ask it questions, rather than asserting on
 * the shape of the JSON. The shape is free to change; the answers are not.
 */
import { describe, expect, it } from 'vitest';
import type { DocsPageSummary } from './docsModel.js';
import { buildDocsIndex, searchDocs, type DocsIndexInput } from './docsSearch.js';

const summary = (
  id: string,
  title: string,
  over: Partial<DocsPageSummary> = {},
): DocsPageSummary =>
  ({
    id,
    route: `/docs/${id.toLowerCase()}`,
    content: `pages/${id.toLowerCase()}.json`,
    source: `docs/observatory/${id.toLowerCase()}.md`,
    title,
    summary: `About ${title.toLowerCase()}.`,
    audience: ['developer'],
    domain: 'architecture',
    section: 'architecture',
    type: 'explanation',
    status: 'verified',
    ...over,
  }) as DocsPageSummary;

const page = (
  id: string,
  title: string,
  text: string,
  over: Partial<DocsPageSummary> = {},
  headings: DocsIndexInput['headings'] = [],
): DocsIndexInput => ({ summary: summary(id, title, over), headings, text });

const corpus = [
  page('MIGRATE', 'Running database migrations', 'A migration is applied once and recorded.', {
    domain: 'operate',
    section: 'operate',
    audience: ['operator'],
    type: 'task',
  }),
  page(
    'SECURITY',
    'Trust boundaries',
    'The webhook verifies an HMAC before the handler runs. Every migration is reviewed.',
    { audience: ['security', 'maintainer'], status: 'partial' },
    [{ id: 'public-paths', text: 'The public paths', level: 2 }],
  ),
  page('SETUP', 'Setting up a checkout', 'Install node.js 22 and run the emulators.', {
    domain: 'develop',
    section: 'develop',
    type: 'tutorial',
  }),
];

const index = buildDocsIndex(corpus);

describe('building the index', () => {
  it('produces the same bytes for the same corpus', () => {
    expect(JSON.stringify(buildDocsIndex(corpus))).toBe(JSON.stringify(index));
  });

  it('orders its terms, so a reordered page is not a diff', () => {
    const terms = Object.keys(index.postings);
    expect(terms).toStrictEqual([...terms].sort());
  });

  it('records one document per page and a mean length to normalise by', () => {
    expect(index.documents).toHaveLength(3);
    expect(index.averageLength).toBeGreaterThan(0);
  });

  it('keeps only the top-level headings a result can point at', () => {
    const security = index.documents.find((d) => d.id === 'SECURITY');
    expect(security?.headings).toStrictEqual([{ id: 'public-paths', text: 'The public paths' }]);
  });
});

describe('asking the corpus a question', () => {
  it('puts the page the query is about first', () => {
    // Both pages contain the word. One is titled with it.
    const { hits } = searchDocs(index, 'migration');
    expect(hits[0]?.document.id).toBe('MIGRATE');
    expect(hits.map((hit) => hit.document.id)).toContain('SECURITY');
  });

  it('matches a plural against a page written in the singular', () => {
    const { hits } = searchDocs(index, 'migrations');
    expect(hits.map((hit) => hit.document.id)).toContain('SECURITY');
  });

  it('keeps a technical token intact', () => {
    const { hits } = searchDocs(index, 'node.js');
    expect(hits[0]?.document.id).toBe('SETUP');
  });

  it('completes the word a reader is still typing', () => {
    const { hits } = searchDocs(index, 'bound');
    expect(hits[0]?.document.id).toBe('SECURITY');
  });

  it('holds an earlier complete term to its exact form', () => {
    // Only the last term expands, so "hmac" still has to be present.
    const found = searchDocs(index, 'hmac veri');
    expect(found.hits[0]?.document.id).toBe('SECURITY');
    expect(found.mode).toBe('all');
  });

  it('requires every word a reader typed, when a page carries them all', () => {
    // "migration" is on two pages; only one of them is also about HMAC.
    const both = searchDocs(index, 'hmac migration');
    expect(both.mode).toBe('all');
    expect(both.hits.map((hit) => hit.document.id)).toStrictEqual(['SECURITY']);
  });

  it('relaxes to some of the words rather than answering nothing, and says so', () => {
    // No page carries both, so the alternative is an empty result for a query
    // that plainly has something to say about each half.
    const relaxed = searchDocs(index, 'hmac emulators');
    expect(relaxed.mode).toBe('any');
    expect(relaxed.hits.map((hit) => hit.document.id).sort()).toStrictEqual(['SECURITY', 'SETUP']);
  });

  it('says which words it could not find', () => {
    const { missing, hits } = searchDocs(index, 'migration kubernetes');
    expect(missing).toStrictEqual(['kubernetes']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('ignores a query made only of stopwords', () => {
    expect(searchDocs(index, 'the and of').hits).toHaveLength(0);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchDocs(index, '   ').hits).toHaveLength(0);
  });

  it('names the terms that matched, so a result can be explained', () => {
    const { hits } = searchDocs(index, 'migration');
    expect(hits[0]?.matched.length).toBeGreaterThan(0);
  });
});

describe('narrowing by facet', () => {
  it('filters the results', () => {
    const { hits } = searchDocs(index, 'migration', { domain: ['operate'] });
    expect(hits.map((hit) => hit.document.id)).toStrictEqual(['MIGRATE']);
  });

  it('matches a page carrying any one of the audiences asked for', () => {
    const { hits } = searchDocs(index, 'migration', { audience: ['security'] });
    expect(hits.map((hit) => hit.document.id)).toStrictEqual(['SECURITY']);
  });

  it('counts what a facet would give before the filter is applied', () => {
    // The reader is deciding whether to narrow, so the counts describe the
    // whole match set rather than the part already showing.
    const narrowed = searchDocs(index, 'migration', { domain: ['operate'] });
    expect(narrowed.hits).toHaveLength(1);
    expect(narrowed.facets.domain).toStrictEqual([
      { value: 'architecture', count: 1 },
      { value: 'operate', count: 1 },
    ]);
  });

  it('reports every facet a result set spans', () => {
    const { facets } = searchDocs(index, 'migration');
    expect(facets.status.map((f) => f.value).sort()).toStrictEqual(['partial', 'verified']);
    expect(facets.type.map((f) => f.value).sort()).toStrictEqual(['explanation', 'task']);
  });
});
