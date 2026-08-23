/** Shared chrome for public Vitae pages. It stays independent of account and API state. */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Glyph, LogoHorizontal, Sheet } from '@vitae/ui';
import { publicLaunchConfig } from '../../public/site.js';
import { MARKETING_NAV } from './MarketingContent.js';
import { CloudAction } from './CloudAction.js';

const configuredRepositoryUrl = import.meta.env.VITE_PUBLIC_REPOSITORY_URL?.trim().replace(
  /\/$/,
  '',
);

/** A configured source URL is preferred; the fallback remains non-identifying. */
export const PUBLIC_SOURCE_URL =
  configuredRepositoryUrl ||
  'https://github.com/search?q=%22Vitae+is+a+life+and+career+system%22&type=code';

const EXPLORE_LINKS = [
  { label: 'Security and ownership', to: '/security-and-ownership' },
  { label: 'Guides', to: '/guides' },
  { label: 'Resources', to: '/resources' },
  { label: 'Manifesto', to: '/manifesto' },
] as const;

function activeRoute(pathname: string, target: string, matches?: readonly string[]): boolean {
  if (target === '/') return pathname === '/';
  return (matches ?? [target]).some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

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

function NavLink({
  to,
  children,
  match,
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  match?: readonly string[];
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const current = activeRoute(pathname, to, match);
  return (
    <Link
      className={`mk-nav__link${current ? ' mk-nav__link--active' : ''}`}
      to={to}
      aria-current={current ? 'page' : undefined}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

function MobileNavigation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="mk-menu" aria-label="Site">
      <p className="mk-menu__label">Explore Vitae</p>
      <div className="mk-menu__links">
        {MARKETING_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} match={item.match} onNavigate={onNavigate}>
            {item.label}
          </NavLink>
        ))}
        {EXPLORE_LINKS.map((item) => (
          <NavLink key={item.to} to={item.to} onNavigate={onNavigate}>
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="mk-menu__actions">
        <CloudAction className="mk-action mk-action--primary" onClick={onNavigate} />
        <Link className="mk-action" to="/signin" onClick={onNavigate}>
          Sign in
        </Link>
      </div>
      <a className="mk-menu__source" href={PUBLIC_SOURCE_URL} target="_blank" rel="noreferrer">
        Explore the open-source foundation <span aria-hidden="true">↗</span>
      </a>
    </nav>
  );
}

export function MkNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const hasExploreCurrent = EXPLORE_LINKS.some((item) => activeRoute(pathname, item.to));

  return (
    <header className="mk-nav">
      <div className="mk__inner mk-nav__row">
        <Link className="mk-nav__brand" to="/" aria-label="Vitae home">
          <LogoHorizontal markSize={24} />
        </Link>
        <nav className="mk-nav__links" aria-label="Primary">
          {MARKETING_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} match={item.match}>
              {item.label}
            </NavLink>
          ))}
          <button
            className={`mk-nav__more${hasExploreCurrent ? ' mk-nav__more--active' : ''}`}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            More <Glyph name="chevron-down" size={14} />
          </button>
          <Link className="mk-nav__signin" to="/signin">
            Sign in
          </Link>
          <CloudAction
            className="mk-action mk-action--primary mk-action--sm"
            fallbackChildren="Take tour"
          >
            Start free
          </CloudAction>
        </nav>
        <button
          className="mk-nav__mobile-toggle"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <span>Menu</span>
          <Glyph name="chevron-down" size={16} />
        </button>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Explore Vitae">
        <MobileNavigation onNavigate={() => setMenuOpen(false)} />
      </Sheet>
    </header>
  );
}

export function MkFoot() {
  const privacyLabel = publicLaunchConfig.cloudEnabled ? 'Privacy policy' : 'Privacy information';
  return (
    <footer className="mk-foot">
      <div className="mk__inner mk-foot__grid">
        <div className="mk-foot__identity">
          <LogoHorizontal markSize={22} />
          <p>A private, evidence-led career record for the next move that matters.</p>
        </div>
        <nav className="mk-foot__group" aria-label="Product">
          <p>Product</p>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/product/warm-paths">Warm paths</Link>
          <Link to="/product/career-evidence">Career evidence</Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <nav className="mk-foot__group" aria-label="Learn">
          <p>Learn</p>
          <Link to="/tour">Product tour</Link>
          <Link to="/guides">Guides</Link>
          <Link to="/resources">Resources</Link>
          <Link to="/manifesto">Manifesto</Link>
        </nav>
        <nav className="mk-foot__group" aria-label="Trust">
          <p>Trust</p>
          <Link to="/security-and-ownership">Security and ownership</Link>
          <Link to="/legal/privacy">{privacyLabel}</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/status">Status</Link>
        </nav>
      </div>
      <div className="mk__inner mk-foot__base">
        <span>© {new Date().getFullYear()} Vitae</span>
        <span>Career decisions deserve an evidence trail.</span>
        <a href={PUBLIC_SOURCE_URL} target="_blank" rel="noreferrer">
          Open-source foundation <span aria-hidden="true">↗</span>
        </a>
      </div>
    </footer>
  );
}

export function MarketingShell({
  children,
  mainClassName = '',
}: {
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="mk">
      <a className="mk-skip-link" href="#main-content">
        Skip to content
      </a>
      <MkNav />
      <main id="main-content" className={mainClassName || undefined}>
        {children}
      </main>
      <MkFoot />
    </div>
  );
}
