/**
 * The documentation surface.
 *
 * Mounted above the authentication wildcard in App.tsx and outside `Shell`,
 * for the same reason `/reference/entities` is: this is a public reading
 * surface, and a reader must never need an account, a session or a running API
 * to reach it. Everything it renders comes from static files under
 * `public/docs-content/`.
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
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, LogoHorizontal, Skeleton } from '@vitae/ui';
import { QueryBoundary } from '../../components/QueryBoundary.js';
import { DocsNav } from './DocsChrome.js';
import { DocsPage } from './DocsPage.js';
import {
  type DocsManifest,
  manifestQueryOptions,
  normalizeDocsRoute,
  pageAtRoute,
} from './docsModel.js';

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

function DocsRoute({ manifest }: { manifest: DocsManifest }) {
  const { pathname } = useLocation();
  const route = normalizeDocsRoute(pathname);
  const summary = pageAtRoute(manifest, pathname);

  if (!summary) return <DocsNotFound pathname={route} />;

  return (
    <div className="docs-layout">
      <DocsNav manifest={manifest} currentRoute={route} />
      {/* The section rail sits before `main` in the document so that its
          visual position on the left matches the order it is read in. Below
          the two-column breakpoint it moves to the end of the page, which is
          what the skip link above it exists to make cheap. */}
      <main className="docs-main" id="main-content" tabIndex={-1}>
        <DocsPage manifest={manifest} summary={summary} />
      </main>
    </div>
  );
}

export default function DocsApp() {
  const manifest = useQuery(manifestQueryOptions());

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
        {(data) => <DocsRoute manifest={data} />}
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
