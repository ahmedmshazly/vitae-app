/**
 * The documentation surface.
 *
 * Mounted above the authentication wildcard in App.tsx and outside `Shell`,
 * for the same reason `/reference/entities` is: it has no workspace chrome to
 * inherit. It is *not* public, which is the difference between the two. Every
 * page it renders is fetched from `GET /api/v1/docs/*`, which refuses the
 * request unless it carries the owner's identity, so this shell holds nothing
 * until an authenticated request returns something. See `App.tsx` for why the
 * route stays above the gate even though the content does not.
 *
 * Routing is not declared here. The manifest lists every page with the route
 * it is served at, so this component resolves the current path against that
 * list. Adding a page to `docs/observatory/` therefore adds a route, with no
 * second place to update and no way for the two to disagree.
 *
 * Both stylesheets are imported by this chunk rather than by main.tsx, which
 * is the convention routes/reference/EntityCatalog.tsx established: route CSS
 * that ships to every user on every screen is a cost paid by people who never
 * open the route.
 */
import '../../styles/docs.css';
import '../../styles/docs-print.css';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, LogoHorizontal, Skeleton } from '@vitae/ui';
import { QueryBoundary } from '../../components/QueryBoundary.js';
import { DocsNav } from './DocsChrome.js';
import { DocsPage } from './DocsPage.js';
import { DocsCommandPalette, useDocsPalette } from './DocsCommandPalette.js';
import { DocsCatalog, DocsReferenceIndex, catalogDocumentTitle } from './DocsReference.js';
import { DocsSearch } from './DocsSearch.js';
import { catalogByKey } from './docsReference.js';
import { manifestQueryOptions } from './docsContent.js';
import { type DocsManifest, normalizeDocsRoute, pageAtRoute } from './docsModel.js';

/**
 * A path under `/docs` that the corpus does not produce.
 *
 * This is a real state, not an error: an old link, a typo, or a page that was
 * retired without a supersession stub. It says which of those it cannot tell
 * apart, and offers the one thing that always works.
 */
function DocsNotFound({ pathname }: { pathname: string }) {
  return (
    <main className="docs-main docs-main--message" id="main-content" tabIndex={-1}>
      <EmptyState
        glyph="document"
        title="There is no documentation page at this address."
        hint={
          <>
            Nothing in the corpus is published at{' '}
            <span className="docs-mono">{pathname}</span>. The page may have been renamed, or the
            link may be older than the page it pointed at.
          </>
        }
        action={
          <Link className="docs-button" to="/docs">
            Go to the documentation home
          </Link>
        }
      />
    </main>
  );
}

/** The shell while the index itself is in flight. */
function ShellSkeleton() {
  return (
    <div className="docs-layout" aria-hidden="true">
      <div className="docs-nav">
        <Skeleton height={12} width="70%" />
        <Skeleton height={12} width="52%" />
        <Skeleton height={12} width="61%" />
      </div>
      <div className="docs-main">
        <div className="docs-head">
          <Skeleton height={30} width="46%" />
          <Skeleton height={14} width="72%" />
        </div>
      </div>
    </div>
  );
}

/**
 * The routes the application serves that no page in the corpus produces.
 *
 * Kept as a list rather than as conditions scattered through the resolver, so
 * that adding one is a single edit and so that a corpus page can never quietly
 * shadow a built-in surface: the manifest is consulted first, and anything it
 * claims wins.
 */
const SEARCH_ROUTE = '/docs/search';
const REFERENCE_ROUTE = '/docs/reference';

/**
 * What the application serves at a path the corpus does not produce.
 *
 * The manifest is consulted first and always wins, so a curated page can never
 * be shadowed by a built-in surface; only paths no page claims reach this.
 */
function builtInAt(route: string) {
  if (route === SEARCH_ROUTE) return { kind: 'search' as const };
  if (route === REFERENCE_ROUTE) return { kind: 'reference' as const };
  if (route.startsWith(`${REFERENCE_ROUTE}/`)) {
    const spec = catalogByKey(route.slice(REFERENCE_ROUTE.length + 1));
    if (spec) return { kind: 'catalog' as const, spec };
  }
  return null;
}

/** A catalog names its own tab, the way a curated page does. */
function useCatalogHead(title: string | null) {
  useEffect(() => {
    if (title === null || typeof document === 'undefined') return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

function DocsRoute({ manifest }: { manifest: DocsManifest }) {
  const { pathname } = useLocation();
  const route = normalizeDocsRoute(pathname);
  const summary = pageAtRoute(manifest, pathname);
  const built = summary ? null : builtInAt(route);

  useCatalogHead(built?.kind === 'catalog' ? catalogDocumentTitle(built.spec) : null);

  if (!summary && !built) return <DocsNotFound pathname={route} />;

  return (
    <div className="docs-layout">
      <DocsNav manifest={manifest} currentRoute={route} />
      {/* The section rail sits before `main` in the document so that its
          visual position on the left matches the order it is read in. Below
          the two-column breakpoint it moves to the end of the page, which is
          what the skip link above it exists to make cheap. */}
      <main className="docs-main" id="main-content" tabIndex={-1}>
        {summary && <DocsPage manifest={manifest} summary={summary} />}
        {built?.kind === 'search' && <DocsSearch manifest={manifest} />}
        {built?.kind === 'reference' && <DocsReferenceIndex />}
        {built?.kind === 'catalog' && <DocsCatalog spec={built.spec} />}
      </main>
    </div>
  );
}

export default function DocsApp() {
  const manifest = useQuery(manifestQueryOptions());
  const palette = useDocsPalette();

  return (
    <div className="docs-root">
      {/* Both targets below carry `tabIndex={-1}`, and without it this link
          scrolls without skipping. A fragment link moves the viewport whether
          or not the element it names can hold focus; when it cannot, focus
          stays where it was, the next Tab returns to the masthead the reader
          was trying to get past, and nothing announces that the context
          changed. `-1` makes `main` a target focus can be placed on while
          keeping it out of the tab order. Measured before the fix: activating
          this link left `document.activeElement` on `body`. */}
      <a className="docs-skip" href="#main-content">
        Skip to the page
      </a>
      <header className="docs-masthead">
        <Link className="docs-masthead__brand" to="/docs" aria-label="Vitae documentation home">
          <LogoHorizontal markSize={22} />
          <span className="docs-masthead__label">Documentation</span>
        </Link>
        <nav className="docs-masthead__links" aria-label="Vitae">
          <button
            className="docs-masthead__jump"
            type="button"
            onClick={() => palette.setOpen(true)}
          >
            Jump to a page <span aria-hidden="true">/</span>
          </button>
          <Link to="/docs/search">Search</Link>
          <Link to="/docs/reference">Reference</Link>
          <Link to="/reference/entities">Entity reference</Link>
          <Link to="/">Vitae</Link>
        </nav>
      </header>

      <QueryBoundary
        query={manifest}
        loading={<ShellSkeleton />}
        loadingLabel="Loading the documentation index"
        errorTitle="Couldn’t load the documentation"
        retryLabel="Try again"
      >
        {(data) => (
          <>
            <DocsRoute manifest={data} />
            {/* Mounted only while open, so the index it needs is not fetched
                by a reader who never opens it. The overlay remembers where
                focus came from and puts it back on close. */}
            {palette.open && (
              <DocsCommandPalette manifest={data} onClose={() => palette.setOpen(false)} />
            )}
          </>
        )}
      </QueryBoundary>

      <footer className="docs-foot">
        <p>
          Compiled from <span className="docs-mono">docs/observatory</span> in this repository.
          Examples use fictional demonstration data.
        </p>
      </footer>
    </div>
  );
}
