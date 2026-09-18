import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { MarketingShell } from '../routes/marketing/Chrome.js';
import {
  type PublicContentBlock,
  type PublicDocument,
  publicDocumentForPath,
  publicGuideForSlug,
  publicLaunchConfig,
  publicMetadataForPath,
} from './site.js';
import { applyPublicMetadata } from './seo.js';

/** Keep SPA navigation aligned with the static HTML generated for each public route. */
export function PublicRouteMetadata({ path }: { path: string }) {
  const metadata = publicMetadataForPath(path);
  useEffect(() => {
    if (metadata) applyPublicMetadata(metadata, publicLaunchConfig);
  }, [metadata]);
  return null;
}

function PublicDocumentLayout({ document }: { document: PublicDocument }) {
  return (
    <MarketingShell mainClassName="mk-docs">
      <header className="mk-docs__header">
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        {publicLaunchConfig.supportEmail && document.slug.startsWith('terms') && (
          <p className="mk-docs__support">
            Need help?{' '}
            <a href={`mailto:${publicLaunchConfig.supportEmail}`}>
              {publicLaunchConfig.supportEmail}
            </a>
          </p>
        )}
      </header>

      <article>
        {document.blocks.map((block, index) => (
          <DocumentBlock key={`${document.slug}-${index}`} block={block} />
        ))}
        {document.related && document.related.length > 0 && (
          <nav className="mk-docs__section" aria-label="Related guides">
            <h2>Continue with</h2>
            <ul className="mk-docs__links">
              {document.related.map((slug) => {
                const guide = publicGuideForSlug(slug);
                if (!guide) return null;
                return (
                  <li key={slug}>
                    <Link to={`/guides/${slug}`}>{guide.title}</Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </article>
    </MarketingShell>
  );
}

function DocumentBlock({ block }: { block: PublicContentBlock }) {
  if (block.type === 'paragraph') {
    return (
      <section className="mk-docs__section">
        <p>{block.text}</p>
      </section>
    );
  }
  if (block.type === 'notice') {
    return (
      <aside className="mk-docs__notice" aria-label={block.title}>
        <p>
          <strong>{block.title}</strong>
          <br />
          {block.text}
        </p>
      </aside>
    );
  }
  const Element = block.type === 'steps' ? 'ol' : 'ul';
  return (
    <Element className="mk-docs__list">
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Element>
  );
}

function PublicMissingPage({ guide = false }: { guide?: boolean }) {
  return (
    <MarketingShell mainClassName="mk-docs">
      <header className="mk-docs__header">
        <h1>That public page is not available.</h1>
        <p>
          {guide
            ? 'This guide may have moved or the address may be incomplete. Browse the available guides to continue.'
            : 'Use the home page to continue exploring Vitae.'}
        </p>
        <div className="mk-docs__actions">
          {guide && (
            <Link className="mk-action mk-action--primary" to="/guides">
              Browse Vitae guides
            </Link>
          )}
          <Link className={guide ? 'mk-action' : 'mk-action mk-action--primary'} to="/">
            Go to Vitae home
          </Link>
        </div>
      </header>
    </MarketingShell>
  );
}

/** Render the stable public resource, legal, and status documents from the typed registry. */
export function PublicDocumentPage() {
  const { pathname } = useLocation();
  const document = publicDocumentForPath(pathname);
  const metadata = publicMetadataForPath(pathname);
  return (
    <>
      {metadata && <PublicRouteMetadata path={metadata.path} />}
      {document ? <PublicDocumentLayout document={document} /> : <PublicMissingPage />}
    </>
  );
}

/** Route wrapper for a single guide so a missing slug is a real public 404. */
export function PublicGuidePage() {
  const { slug } = useParams();
  const guide = publicGuideForSlug(slug);
  const metadata = slug ? publicMetadataForPath(`/guides/${slug}`) : null;
  return (
    <>
      {metadata && <PublicRouteMetadata path={metadata.path} />}
      {guide ? <PublicDocumentLayout document={guide} /> : <PublicMissingPage guide />}
    </>
  );
}
