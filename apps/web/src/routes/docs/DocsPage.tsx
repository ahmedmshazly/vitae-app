/**
 * One documentation page.
 *
 * The manifest has already told the shell that this route exists, so nothing
 * here handles "not found" — that decision was made before this component
 * mounted. What it does handle is the page's own content arriving or failing,
 * which is why only the prose goes through `QueryBoundary` while the header
 * and the pager render from the manifest immediately. A reader who follows a
 * link sees the title, the breadcrumb and the way onward before the prose
 * lands, instead of watching the whole screen blank.
 *
 * Every region is rendered exactly once. A responsive documentation layout is
 * usually built by writing the table of contents twice and hiding one copy per
 * breakpoint; this one places single elements into named grid areas instead,
 * so there is no second copy to fall out of step, no duplicated headings in
 * the accessibility tree, and one printable document.
 *
 * Because the grid places by name, the order below is free to be the reading
 * order rather than the drawing order — and the reading order is the article
 * first. The rail describes the page: its contents, what the page was checked
 * against, what it relates to. On a wide screen the grid lifts it into the
 * right-hand column and nothing about that is visible. On a phone the column
 * collapses into the stack, and when the rail came first a reader scrolled
 * past 1,700px of table of contents to reach the first sentence.
 */
import { useEffect, useId, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Skeleton } from '@vitae/ui';
import { QueryBoundary } from '../../components/QueryBoundary.js';
import { DocsBlocks } from './DocsBlocks.js';
import { DocsBreadcrumb, DocsPrevNext, DocsStatusBadge, DocsToc } from './DocsChrome.js';
import {
  type DocsManifest,
  type DocsPageContent,
  type DocsPageSummary,
  type DocsReference,
  audienceMeta,
  breadcrumbs,
  neighbours,
  pageQueryOptions,
  sectionEntrance,
  sectionPages,
  typeMeta,
} from './docsModel.js';

/**
 * Title and description for the tab and for anything that reads the head.
 *
 * The public marketing routes get theirs from a typed registry and a build
 * plugin; a documentation page's comes from the page itself, so it is applied
 * here on navigation. The description element is tagged and reused rather than
 * appended, or a reader moving through ten pages would leave ten of them
 * behind.
 */
const TITLE_SUFFIX = 'Vitae documentation';

function useDocsHead(title: string, description: string) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.title;
    // The corpus entrance is itself called "Vitae documentation", so appending
    // unconditionally titled that tab "Vitae documentation · Vitae
    // documentation". A page whose title already ends in the suffix keeps it.
    document.title = title.endsWith(TITLE_SUFFIX) ? title : `${title} · ${TITLE_SUFFIX}`;
    let tag = document.head.querySelector<HTMLMetaElement>('meta[data-vitae-docs-seo]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      tag.setAttribute('data-vitae-docs-seo', '');
      document.head.append(tag);
    }
    tag.setAttribute('content', description);
    return () => {
      document.title = previous;
    };
  }, [title, description]);
}

/**
 * Where the browser lands after a client-side navigation.
 *
 * A link to `#anchor` on another page arrives with the hash already set and no
 * element to match it yet, so the scroll waits until the content carrying that
 * heading has rendered. Without a hash the reader starts at the top, because
 * carrying the previous page's scroll offset into a new document drops them
 * into the middle of a sentence they have not read.
 */
function useDocsScroll(hash: string, ready: boolean) {
  useEffect(() => {
    if (!ready || typeof document === 'undefined') return;
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [hash, ready]);
}

function ReferenceList({ title, items }: { title: string; items: readonly DocsReference[] }) {
  if (items.length === 0) return null;
  return (
    <section className="docs-rail__group">
      <h2 className="docs-rail__title">{title}</h2>
      <ul className="docs-rail__list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.route}>{item.title}</Link>
            <span className="docs-rail__note">{item.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The rail: what is on this page, and what the page was checked against.
 *
 * Source paths are repository paths, not links to a code host. The corpus is
 * read from a self-hosted checkout as often as from anywhere else, and a link
 * to a host a given deployment does not use is worse than a path anyone can
 * paste into their own editor.
 */
function DocsRail({ page, source }: { page: DocsPageContent | undefined; source: string }) {
  return (
    <div className="docs-rail">
      {page && <DocsToc headings={page.headings} />}
      {page && page.sources.length > 0 && (
        <section className="docs-rail__group">
          <h2 className="docs-rail__title">Checked against</h2>
          <ul className="docs-rail__list docs-rail__list--mono">
            {page.sources.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </section>
      )}
      {page && page.requirements.length > 0 && (
        <section className="docs-rail__group">
          <h2 className="docs-rail__title">Requirements</h2>
          <ul className="docs-rail__ids">
            {page.requirements.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </section>
      )}
      {page && <ReferenceList title="Related" items={page.related} />}
      {page && <ReferenceList title="Replaces" items={page.supersedes} />}
      <section className="docs-rail__group">
        <h2 className="docs-rail__title">Written in</h2>
        <p className="docs-rail__source">{source}</p>
      </section>
    </div>
  );
}

/** A section entrance also lists what is below it. */
function SectionContents({ manifest, page }: { manifest: DocsManifest; page: DocsPageSummary }) {
  const key = page.section;
  if (page.type !== 'index' || key === null) return null;
  const pages = sectionPages(manifest, key);
  if (pages.length === 0) return null;
  return (
    <section className="docs-contents">
      <h2 className="docs-contents__title">In this section</h2>
      <ul className="docs-contents__list">
        {pages.map((entry) => (
          <li key={entry.id}>
            <Link className="docs-contents__link" to={entry.route}>
              <span className="docs-contents__name">{entry.title}</span>
              <span className="docs-contents__summary">{entry.summary}</span>
            </Link>
            <DocsStatusBadge manifest={manifest} status={entry.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The corpus entrance also lists every section. */
function CorpusContents({ manifest }: { manifest: DocsManifest }) {
  return (
    <section className="docs-contents">
      <h2 className="docs-contents__title">Sections</h2>
      <ul className="docs-contents__list">
        {manifest.domains.map((domain) => {
          const entrance = sectionEntrance(manifest, domain.key);
          return (
            <li key={domain.key}>
              <Link className="docs-contents__link" to={entrance?.route ?? domain.route}>
                <span className="docs-contents__name">{domain.title}</span>
                <span className="docs-contents__summary">{domain.summary}</span>
              </Link>
              <span className="docs-contents__count">
                {domain.pages} {domain.pages === 1 ? 'page' : 'pages'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A skeleton the shape of prose, so the region keeps its box while it loads. */
function ArticleSkeleton() {
  return (
    <div className="docs-article__skeleton" aria-hidden="true">
      <Skeleton height={14} width="92%" />
      <Skeleton height={14} width="88%" />
      <Skeleton height={14} width="64%" />
      <Skeleton height={22} width="40%" />
      <Skeleton height={14} width="90%" />
      <Skeleton height={14} width="80%" />
    </div>
  );
}

export function DocsPage({
  manifest,
  summary,
}: {
  manifest: DocsManifest;
  summary: DocsPageSummary;
}) {
  const { hash } = useLocation();
  const audienceLabelId = useId();
  const query = useQuery(pageQueryOptions(summary));
  const heading = useRef<HTMLHeadingElement>(null);
  const trail = breadcrumbs(manifest, summary);
  const { previous, next } = neighbours(manifest, summary);

  useDocsHead(summary.title, summary.summary);
  useDocsScroll(hash, query.data !== undefined);

  // A client-side navigation replaces the document without telling anyone who
  // is not watching the viewport. Moving focus to the new title is what makes
  // the change audible, and it leaves the keyboard at the top of the new page
  // rather than wherever the previous page's link happened to be.
  //
  // The first page a reader opens is not a navigation. Focusing then puts a
  // heavy ring around the title of every page anyone opens from a fresh tab or
  // a pasted link, reporting a move that nobody made — and it takes focus off
  // the document body, so the first Tab lands after the title instead of on
  // the skip link. The ring is right when it says where focus went; it is
  // noise when nothing went anywhere.
  //
  // What is remembered is which page was last shown, not a flag saying the
  // effect has run before. StrictMode runs a mount effect twice to prove it is
  // safe to remount, and a flag cannot survive that proof: the first pass sets
  // it, the second reads it and focuses, so every development build put the
  // ring back while a test suite that does not double-invoke stayed green.
  // Comparing identifiers gives both passes the same answer.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const previous = shown.current;
    shown.current = summary.id;
    if (previous !== null && previous !== summary.id) heading.current?.focus();
  }, [summary.id]);

  return (
    <>
      <header className="docs-head">
        <DocsBreadcrumb trail={trail} />
        <h1 className="docs-head__title" tabIndex={-1} ref={heading}>
          {summary.title}
        </h1>
        <p className="docs-head__summary">{summary.summary}</p>
        <div className="docs-head__meta">
          <DocsStatusBadge
            manifest={manifest}
            status={summary.status}
            verifiedAt={summary.verified_at}
          />
          <span className="docs-head__type">{typeMeta(manifest, summary.type).label}</span>
          {/* The legend is visible rather than an aria-label, because "security"
              on its own reads as a subject and not as a reader. Sighted readers
              were the ones left guessing. */}
          <span className="docs-head__for" id={audienceLabelId}>
            Written for
          </span>
          <ul className="docs-head__audience" aria-labelledby={audienceLabelId}>
            {summary.audience.map((who) => (
              <li key={who}>{audienceMeta(manifest, who).label}</li>
            ))}
          </ul>
        </div>
      </header>

      <QueryBoundary
        query={query}
        className="docs-article"
        loading={<ArticleSkeleton />}
        loadingLabel={`Loading ${summary.title}`}
        errorTitle={`Couldn’t load “${summary.title}”`}
        compact
      >
        {(page) => (
          <>
            {page.superseded_by.length > 0 && (
              <Banner
                tone="warning"
                title="This page has been replaced"
                action={
                  <Link className="docs-link" to={page.superseded_by[0]!.route}>
                    Read {page.superseded_by[0]!.title}
                  </Link>
                }
              >
                It is kept so that existing links still resolve.
              </Banner>
            )}
            <article className="docs-prose">
              <DocsBlocks blocks={page.blocks} />
            </article>
            <SectionContents manifest={manifest} page={summary} />
            {summary.route === '/docs' && <CorpusContents manifest={manifest} />}
          </>
        )}
      </QueryBoundary>

      <DocsRail page={query.data} source={summary.source} />

      <DocsPrevNext previous={previous} next={next} />
    </>
  );
}
