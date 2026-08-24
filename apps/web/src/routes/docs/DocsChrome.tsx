/**
 * Everything around the prose: the badge, the breadcrumb, the section rail,
 * the table of contents, and the two links out of a page.
 *
 * The rail shows every section but expands only the one being read. A corpus
 * of a hundred pages listed in full is a rail nobody scans; a corpus with one
 * section open is a rail that answers "where am I and what else is here". No
 * state is involved — the open section is derived from the route, so the rail
 * cannot disagree with the page beside it, and a deep link opens correctly.
 */
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  type DocsCrumb,
  type DocsHeading,
  type DocsManifest,
  type DocsPageSummary,
  prefetchDocsPage,
  sectionEntrance,
  sectionPages,
  statusMeta,
} from './docsModel.js';

/**
 * What the page claims, in a word.
 *
 * The tone is carried by a class, but the claim is carried by the label, and
 * the label is always present. A reader who cannot tell the warning amber from
 * the neutral grey still reads "Needs review". `title` holds the sentence the
 * content model attaches to each status, so the badge can be interrogated
 * without leaving the page.
 */
export function DocsStatusBadge({
  manifest,
  status,
  verifiedAt,
}: {
  manifest: DocsManifest;
  status: string;
  verifiedAt?: string;
}) {
  const meta = statusMeta(manifest, status);
  return (
    <span className="docs-badge" data-tone={meta.tone} title={meta.note}>
      <span className="docs-badge__label">{meta.label}</span>
      {verifiedAt && <span className="docs-badge__date">{verifiedAt}</span>}
    </span>
  );
}

export function DocsBreadcrumb({ trail }: { trail: readonly DocsCrumb[] }) {
  return (
    <nav className="docs-crumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={crumb.route}>
              {last ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <Link to={crumb.route}>{crumb.label}</Link>
              )}
              {!last && (
                <span className="docs-crumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A link that fetches its destination when the pointer arrives or focus lands.
 * Following a documentation link should not show a skeleton for a file that
 * was already sitting one hover away.
 */
function NavLink({
  page,
  active,
  className,
}: {
  page: DocsPageSummary;
  active: boolean;
  className: string;
}) {
  const client = useQueryClient();
  const warm = () => prefetchDocsPage(client, page);
  return (
    <Link
      className={className}
      to={page.route}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={warm}
      onFocus={warm}
    >
      {page.title}
    </Link>
  );
}

export function DocsNav({
  manifest,
  currentRoute,
}: {
  manifest: DocsManifest;
  currentRoute: string;
}) {
  const current = manifest.pages.find((page) => page.route === currentRoute) ?? null;
  const openSection = current?.section ?? null;
  const home = manifest.pages.find((page) => page.route === '/docs');

  return (
    <nav className="docs-nav" aria-label="Documentation sections">
      <ul className="docs-nav__list">
        {home && (
          <li>
            <NavLink
              page={home}
              active={currentRoute === '/docs'}
              className="docs-nav__section"
            />
          </li>
        )}
        {manifest.domains.map((domain) => {
          const open = domain.key === openSection;
          const entrance = sectionEntrance(manifest, domain.key);
          const pages = sectionPages(manifest, domain.key);
          return (
            <li key={domain.key} data-open={open ? 'true' : undefined}>
              {entrance ? (
                <NavLink
                  page={entrance}
                  active={currentRoute === entrance.route}
                  className="docs-nav__section"
                />
              ) : (
                <span className="docs-nav__section docs-nav__section--plain">{domain.title}</span>
              )}
              {open && pages.length > 0 && (
                <ul className="docs-nav__pages">
                  {pages.map((page) => (
                    <li key={page.id}>
                      <NavLink
                        page={page}
                        active={currentRoute === page.route}
                        className="docs-nav__page"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The contextual table of contents.
 *
 * Level 3 headings indent under their level 2, which is the only nesting the
 * builder emits. Nothing here observes scroll position: a highlight that
 * follows the viewport is a second, silent claim about where the reader is,
 * and it is wrong every time they use the keyboard to move without scrolling.
 */
export function DocsToc({ headings }: { headings: readonly DocsHeading[] }) {
  if (headings.length < 2) return null;
  return (
    <nav className="docs-toc" aria-labelledby="docs-toc-title">
      <p className="docs-toc__title" id="docs-toc-title">
        On this page
      </p>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DocsPrevNext({
  previous,
  next,
}: {
  previous: DocsPageSummary | null;
  next: DocsPageSummary | null;
}) {
  const client = useQueryClient();
  if (!previous && !next) return null;
  return (
    <nav className="docs-pager" aria-label="Reading order">
      {previous ? (
        <Link
          className="docs-pager__link"
          to={previous.route}
          onMouseEnter={() => prefetchDocsPage(client, previous)}
          onFocus={() => prefetchDocsPage(client, previous)}
        >
          <span className="docs-pager__label">Previous</span>
          <span className="docs-pager__title">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          className="docs-pager__link docs-pager__link--next"
          to={next.route}
          onMouseEnter={() => prefetchDocsPage(client, next)}
          onFocus={() => prefetchDocsPage(client, next)}
        >
          <span className="docs-pager__label">Next</span>
          <span className="docs-pager__title">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
