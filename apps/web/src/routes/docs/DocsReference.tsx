/**
 * The generated catalogs, browsable.
 *
 * Eleven catalogs share one renderer, driven by the specs in
 * `docsReference.ts`. That is not only economy: a hand-written table per
 * catalog would be eleven chances to show a subset of a file and call it the
 * file. Here every row expands to whatever the artifact actually holds, so a
 * field a generator adds shows up without anyone remembering to surface it.
 *
 * Nothing on this surface is written by a person. Every number, path and flag
 * came out of a script reading the source, and the page says so, because a
 * reader deciding whether to trust a table needs to know which half of the
 * documentation they are standing in.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton } from '@vitae/ui';
import { QueryBoundary } from '../../components/QueryBoundary.js';
import { catalogQueryOptions } from './docsContent.js';
import { docsDocumentTitle } from './docsModel.js';
import {
  CATALOGS,
  type CatalogSpec,
  type Row,
  type Selection,
  cellText,
  detailFields,
  facetValues,
  filterRows,
} from './docsReference.js';

/** The corpus entrance for the generated half. */
export function DocsReferenceIndex() {
  return (
    <>
      <header className="docs-head">
        <h1 className="docs-head__title" tabIndex={-1}>
          Generated reference
        </h1>
        <p className="docs-head__summary">
          What exists, what depends on it, and what proves it. Every catalog below is derived from
          the source by a script and regenerated in continuous integration, which fails if the
          committed copy has drifted. None of it is written by hand.
        </p>
      </header>

      <section className="docs-contents">
        <h2 className="docs-contents__title">Catalogs</h2>
        <ul className="docs-contents__list">
          {CATALOGS.map((catalog) => (
            <li key={catalog.key}>
              <Link className="docs-contents__link" to={`/docs/reference/${catalog.key}`}>
                <span className="docs-contents__name">{catalog.title}</span>
                <span className="docs-contents__summary">{catalog.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function readFacet(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

export function DocsCatalog({ spec }: { spec: CatalogSpec }) {
  const [params, setParams] = useSearchParams();
  const rows = useQuery(catalogQueryOptions(spec));
  const fieldId = useId();
  const query = params.get('q') ?? '';

  const selection = useMemo<Selection>(
    () => Object.fromEntries(spec.facets.map((facet) => [facet.key, readFacet(params, facet.key)])),
    [params, spec.facets],
  );

  const update = (next: URLSearchParams) => setParams(next, { replace: true });

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    update(next);
  };

  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    const current = readFacet(params, key);
    const after = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    if (after.length) next.set(key, after.join(','));
    else next.delete(key);
    update(next);
  };

  const clear = () => {
    const next = new URLSearchParams(params);
    for (const facet of spec.facets) next.delete(facet.key);
    next.delete('q');
    update(next);
  };

  return (
    <>
      <header className="docs-head">
        <p className="docs-head__kicker">
          <Link to="/docs/reference">Generated reference</Link>
        </p>
        <h1 className="docs-head__title" tabIndex={-1}>
          {spec.title}
        </h1>
        <p className="docs-head__summary">{spec.summary}</p>
        <div className="docs-head__meta">
          <span className="docs-head__type">
            Generated from <span className="docs-mono">{spec.artifact}</span>
          </span>
          {spec.explains && (
            <Link className="docs-link" to={spec.explains}>
              What this is for
            </Link>
          )}
        </div>
      </header>

      <QueryBoundary
        query={rows}
        className="docs-catalog"
        loading={<CatalogSkeleton />}
        loadingLabel={`Loading the ${spec.title.toLowerCase()} catalog`}
        errorTitle={`Couldn’t load the ${spec.title.toLowerCase()} catalog`}
        compact
      >
        {(all) => (
          <CatalogTable
            spec={spec}
            all={all}
            query={query}
            selection={selection}
            fieldId={fieldId}
            onQuery={setQuery}
            onToggle={toggle}
            onClear={clear}
          />
        )}
      </QueryBoundary>
    </>
  );
}

function CatalogSkeleton() {
  return (
    <div className="docs-catalog__skeleton" aria-hidden="true">
      <Skeleton height={16} width="34%" />
      <Skeleton height={12} width="88%" />
      <Skeleton height={12} width="82%" />
      <Skeleton height={12} width="86%" />
    </div>
  );
}

function CatalogTable({
  spec,
  all,
  query,
  selection,
  fieldId,
  onQuery,
  onToggle,
  onClear,
}: {
  spec: CatalogSpec;
  all: readonly Row[];
  query: string;
  selection: Selection;
  fieldId: string;
  onQuery: (value: string) => void;
  onToggle: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => filterRows(all, query, selection), [all, query, selection]);
  const narrowed = query.trim() !== '' || Object.values(selection).some((values) => values.length > 0);

  return (
    <div className="docs-catalog__body">
      <form className="docs-search__form" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="docs-search__label" htmlFor={fieldId}>
          Filter {all.length} {all.length === 1 ? 'row' : 'rows'}
        </label>
        <input
          className="docs-search__field"
          id={fieldId}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Every word must appear somewhere in the row"
          onChange={(event) => onQuery(event.target.value)}
        />
      </form>

      <p className="docs-search__count" role="status">
        {shown.length} of {all.length} shown
        {narrowed && (
          <>
            {' · '}
            <button className="docs-search__clear" type="button" onClick={onClear}>
              Clear
            </button>
          </>
        )}
      </p>

      <div className="docs-catalog__layout">
        <div className="docs-catalog__scroll">
          {shown.length === 0 ? (
            <EmptyState
              glyph="filter"
              title="Nothing in this catalog matches."
              hint="Every word has to appear somewhere in the row. Try fewer of them."
            />
          ) : (
            <table className="docs-table docs-catalog__table">
              <thead>
                <tr>
                  {spec.columns.map((column) => (
                    <th key={column.key} scope="col" data-numeric={column.numeric ? 'yes' : undefined}>
                      {column.label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="u-visually-hidden">Everything else</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const id = String(row[spec.id] ?? '');
                  const expanded = open === id;
                  const rest = detailFields(spec, row);
                  return (
                    <tr key={id} data-expanded={expanded ? 'yes' : undefined}>
                      {spec.columns.map((column, position) => {
                        const text = cellText(row[column.key]);
                        const content = column.mono ? (
                          <span className="docs-mono">{text}</span>
                        ) : (
                          text
                        );
                        return position === 0 ? (
                          <th key={column.key} scope="row">
                            {content}
                          </th>
                        ) : (
                          <td key={column.key} data-numeric={column.numeric ? 'yes' : undefined}>
                            {content}
                          </td>
                        );
                      })}
                      <td className="docs-catalog__more">
                        {rest.length > 0 && (
                          <button
                            className="docs-catalog__toggle"
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : id)}
                          >
                            {expanded ? 'Less' : `${rest.length} more`}
                          </button>
                        )}
                        {expanded && (
                          <dl className="docs-catalog__detail">
                            {rest.map(([key, value]) => (
                              <div key={key}>
                                <dt>{key.replace(/_/g, ' ')}</dt>
                                <dd>
                                  {Array.isArray(value) ? (
                                    <ul>
                                      {value.map((item, position) => (
                                        <li key={position} className="docs-mono">
                                          {cellText(item)}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="docs-mono">{cellText(value)}</span>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {spec.facets.length > 0 && (
          <div className="docs-search__facets">
            {spec.facets.map((facet) => {
              // Counted over what the query already allows, so the numbers
              // describe what is reachable rather than what the file holds.
              const values = facetValues(filterRows(all, query, {}), facet);
              if (values.length < 2) return null;
              return (
                <fieldset className="docs-search__facet" key={facet.key}>
                  <legend>{facet.label}</legend>
                  <ul>
                    {values.map(({ value, count }) => (
                      <li key={value}>
                        <label>
                          <input
                            type="checkbox"
                            checked={(selection[facet.key] ?? []).includes(value)}
                            onChange={() => onToggle(facet.key, value)}
                          />
                          <span className="docs-search__facet-name">{value}</span>
                          <span className="docs-search__facet-count">{count}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The document title for a catalog, matching the rule curated pages use. */
export function catalogDocumentTitle(spec: CatalogSpec): string {
  return docsDocumentTitle(`${spec.title} reference`);
}
