/**
 * Searching the corpus.
 *
 * Every part of the query lives in the URL: the words, and each facet. A
 * search someone found useful is then a link they can send, and the back
 * button walks their refinements instead of leaving the page. That is the same
 * decision `/reference/entities` made about its lenses, for the same reason.
 *
 * There is no result cap and no pagination. The corpus is tens of pages, not
 * thousands; truncating it would be a limit the reader cannot see, and this
 * documentation has a rule against those.
 */
import { useEffect, useId, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, EmptyState, Skeleton } from '@vitae/ui';
import { QueryBoundary } from '../../components/QueryBoundary.js';
import { DocsStatusBadge } from './DocsChrome.js';
import { searchIndexQueryOptions } from './docsContent.js';
import {
  type DocsAudience,
  type DocsManifest,
  type DocsStatus,
  type DocsType,
  audienceMeta,
  docsDocumentTitle,
  typeMeta,
} from './docsModel.js';
import { searchDocs, type DocsFacets, type DocsSearchIndex } from './docsSearch.js';

/** The facets a reader can narrow by, in the order they appear. */
const FACETS = ['audience', 'domain', 'type', 'status'] as const;
type FacetName = (typeof FACETS)[number];

const FACET_LABEL: Record<FacetName, string> = {
  audience: 'Written for',
  domain: 'Section',
  type: 'Page type',
  status: 'Status',
};

/**
 * A facet's values, read from and written to the URL.
 *
 * Comma-separated rather than repeated keys, because the resulting address is
 * one a person can read and edit: `?domain=architecture,operate`.
 */
function readFacet(params: URLSearchParams, name: FacetName): string[] {
  const raw = params.get(name);
  return raw ? raw.split(',').filter(Boolean) : [];
}

export function DocsSearch({ manifest }: { manifest: DocsManifest }) {
  const [params, setParams] = useSearchParams();
  const index = useQuery(searchIndexQueryOptions(manifest));
  const field = useRef<HTMLInputElement>(null);
  const queryId = useId();

  const query = params.get('q') ?? '';
  const selected = useMemo(
    () => Object.fromEntries(FACETS.map((name) => [name, readFacet(params, name)])) as Record<FacetName, string[]>,
    [params],
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.title;
    document.title = docsDocumentTitle(query ? `Search: ${query}` : 'Search');
    return () => {
      document.title = previous;
    };
  }, [query]);

  // The field is where a reader arriving at this route wants to be, whether
  // they came from the command palette or from a pasted link they mean to
  // edit. It is not stolen from anywhere: this route has nothing else to focus.
  useEffect(() => {
    field.current?.focus();
  }, []);

  const update = (next: URLSearchParams) => {
    // `replace` on every keystroke, so one search does not leave twenty
    // entries between the reader and the page they came from.
    setParams(next, { replace: true });
  };

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    update(next);
  };

  const toggleFacet = (name: FacetName, value: string) => {
    const next = new URLSearchParams(params);
    const current = readFacet(params, name);
    const after = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    if (after.length) next.set(name, after.join(','));
    else next.delete(name);
    update(next);
  };

  const clearFacets = () => {
    const next = new URLSearchParams(params);
    for (const name of FACETS) next.delete(name);
    update(next);
  };

  const narrowed = FACETS.some((name) => selected[name].length > 0);

  return (
    <>
      <header className="docs-head">
        <h1 className="docs-head__title" tabIndex={-1}>
          Search the documentation
        </h1>
        <p className="docs-head__summary">
          Every curated page, by the words in it. The index is built from the same corpus the pages
          are, so a result cannot point at something that is not there.
        </p>
      </header>

      <form className="docs-search__form" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="docs-search__label" htmlFor={queryId}>
          What are you looking for?
        </label>
        <input
          className="docs-search__field"
          id={queryId}
          ref={field}
          type="search"
          name="q"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="workspace primary key"
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <QueryBoundary
        query={index}
        className="docs-search"
        loading={<SearchSkeleton />}
        loadingLabel="Loading the search index"
        errorTitle="Couldn't load the search index"
        compact
      >
        {(built) => (
          <Results
            manifest={manifest}
            index={built}
            query={query}
            selected={selected}
            narrowed={narrowed}
            onToggle={toggleFacet}
            onClear={clearFacets}
          />
        )}
      </QueryBoundary>
    </>
  );
}

function SearchSkeleton() {
  return (
    <div className="docs-search__skeleton" aria-hidden="true">
      <Skeleton height={16} width="38%" />
      <Skeleton height={12} width="72%" />
      <Skeleton height={16} width="44%" />
      <Skeleton height={12} width="66%" />
    </div>
  );
}

function Results({
  manifest,
  index,
  query,
  selected,
  narrowed,
  onToggle,
  onClear,
}: {
  manifest: DocsManifest;
  index: DocsSearchIndex;
  query: string;
  selected: Record<FacetName, string[]>;
  narrowed: boolean;
  onToggle: (name: FacetName, value: string) => void;
  onClear: () => void;
}) {
  const facets = useMemo<DocsFacets>(
    () => ({
      audience: selected.audience as DocsAudience[],
      domain: selected.domain,
      type: selected.type as DocsType[],
      status: selected.status as DocsStatus[],
    }),
    [selected],
  );
  const result = useMemo(() => searchDocs(index, query, facets), [index, query, facets]);

  if (!query.trim()) {
    return (
      <EmptyState
        glyph="search"
        title="Type to search the corpus."
        hint={`${index.documents.length} pages are indexed, including their headings, tables and code.`}
      />
    );
  }

  if (result.hits.length === 0) {
    return (
      <>
        <EmptyState
          glyph="search"
          title={`Nothing matches '${query}'.`}
          hint={
            narrowed
              ? 'The words may be right and the filters wrong. Clearing them widens the search.'
              : 'Try a different word, or a word from the page title you have in mind.'
          }
          action={
            narrowed ? (
              <button className="docs-button" type="button" onClick={onClear}>
                Clear the filters
              </button>
            ) : undefined
          }
        />
        {result.missing.length > 0 && <MissingWords missing={result.missing} />}
      </>
    );
  }

  return (
    <div className="docs-search__results">
      <p className="docs-search__count" role="status">
        {result.hits.length} {result.hits.length === 1 ? 'page' : 'pages'}
        {narrowed ? ' after filtering' : ''}
      </p>

      {result.mode === 'any' && (
        <Banner tone="info" title="No page contains all of those words">
          These pages contain some of them. The words are ranked by how much each page is about
          them, so the closest is first.
        </Banner>
      )}
      {result.missing.length > 0 && <MissingWords missing={result.missing} />}

      <div className="docs-search__body">
        <ol className="docs-search__list">
          {result.hits.map((hit) => (
            <li key={hit.document.id}>
              <Link className="docs-search__hit" to={hit.document.route}>
                <span className="docs-search__hit-title">{hit.document.title}</span>
                <span className="docs-search__hit-summary">{hit.document.summary}</span>
              </Link>
              <p className="docs-search__hit-meta">
                <DocsStatusBadge manifest={manifest} status={hit.document.status} />
                <span className="docs-search__hit-where">
                  {typeMeta(manifest, hit.document.type).label} in{' '}
                  {manifest.domains.find((d) => d.key === hit.document.domain)?.title ??
                    hit.document.domain}
                </span>
              </p>
              {hit.document.headings.length > 0 && (
                <p className="docs-search__hit-sections">
                  Sections: {hit.document.headings.map((heading) => heading.text).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ol>

        <div className="docs-search__facets">
          {narrowed && (
            <button className="docs-search__clear" type="button" onClick={onClear}>
              Clear all filters
            </button>
          )}
          {FACETS.map((name) => {
            const values = result.facets[name];
            if (values.length < 2 && selected[name].length === 0) return null;
            return (
              <fieldset className="docs-search__facet" key={name}>
                <legend>{FACET_LABEL[name]}</legend>
                <ul>
                  {values.map(({ value, count }) => (
                    <li key={value}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected[name].includes(value)}
                          onChange={() => onToggle(name, value)}
                        />
                        <span className="docs-search__facet-name">
                          {facetLabel(manifest, name, value)}
                        </span>
                        <span className="docs-search__facet-count">{count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A facet value in the words the rest of the surface uses for it. */
function facetLabel(manifest: DocsManifest, name: FacetName, value: string): string {
  if (name === 'audience') return audienceMeta(manifest, value as DocsAudience).label;
  if (name === 'type') return typeMeta(manifest, value as DocsType).label;
  if (name === 'status') return manifest.statuses[value]?.label ?? value;
  return manifest.domains.find((domain) => domain.key === value)?.title ?? value;
}

function MissingWords({ missing }: { missing: readonly string[] }) {
  return (
    <p className="docs-search__missing">
      No page contains {missing.map((word) => `'${word}'`).join(', ')}.
    </p>
  );
}
