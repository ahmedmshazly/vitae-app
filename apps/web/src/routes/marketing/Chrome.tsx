/** Shared chrome for the public marketing pages: sticky nav + footer. */
import { Link } from 'react-router-dom';
import { LogoHorizontal } from '@vitae/ui';

const configuredRepositoryUrl = import.meta.env.VITE_PUBLIC_REPOSITORY_URL?.trim().replace(
  /\/$/,
  '',
);

/**
 * Public builds may provide a canonical repository URL. Until then, use a
 * source-discovery query built from README copy instead of publishing a
 * maintainer identity or inventing an organization URL.
 */
export const PUBLIC_SOURCE_URL =
  configuredRepositoryUrl ||
  'https://github.com/search?q=%22Vitae+is+a+self-hosted+life+and+career+system%22&type=code';

export function ProductFrame({
  src,
  alt,
  label,
  eager = false,
}: {
  src: string;
  alt: string;
  label: string;
  eager?: boolean;
}) {
  return (
    <figure className="mk-frame">
      <figcaption className="mk-frame__bar">
        <span className="mk-frame__url">{label}</span>
        <span className="mk-frame__meta">Real interface · fictional demo data</span>
      </figcaption>
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
      />
    </figure>
  );
}

export function MkNav() {
  return (
    <header className="mk-nav">
      <div className="mk__inner mk-nav__row">
        <Link to="/welcome" aria-label="Vitae home" style={{ display: 'inline-flex' }}>
          <LogoHorizontal markSize={24} />
        </Link>
        <nav className="mk-nav__links" aria-label="Site">
          <a className="mk-nav__link" href="/welcome#product">
            Product
          </a>
          <Link className="mk-nav__link" to="/tour">
            Tour
          </Link>
          <a className="mk-nav__link" href="/welcome#self-host">
            Self-host
          </a>
          <Link className="mk-nav__link" to="/manifesto">
            Manifesto
          </Link>
          <Link className="mk-action mk-action--primary mk-action--sm" to="/signin">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MkFoot() {
  return (
    <footer className="mk-foot">
      <div className="mk__inner mk-foot__row">
        <LogoHorizontal markSize={20} />
        <Link className="mk-nav__link" to="/manifesto">
          Manifesto
        </Link>
        <Link className="mk-nav__link" to="/tour">
          Tour
        </Link>
        <a className="mk-nav__link" href={PUBLIC_SOURCE_URL}>
          Source
        </a>
        <span className="mk-foot__legal">
          © {new Date().getFullYear()} Vitae · Apache-2.0 · export anytime
        </span>
      </div>
    </footer>
  );
}
