/** Shared chrome for the public marketing pages: sticky nav + footer. */
import { Link } from 'react-router-dom';
import { Button, LogoHorizontal } from '@vitae/ui';

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
          <a className="mk-nav__link" href="/welcome#pricing">
            Pricing
          </a>
          <Link className="mk-nav__link" to="/tour">
            Tour
          </Link>
          <Link className="mk-nav__link" to="/manifesto">
            Manifesto
          </Link>
          <Link to="/signin">
            <Button variant="primary" size="sm">
              Sign in
            </Button>
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
        <a className="mk-nav__link" href="mailto:maintainers@vitae.example?subject=Vitae%20waitlist">
          Contact
        </a>
        <span className="mk-foot__legal">
          © {new Date().getFullYear()} Vitae · your data stays yours · export anytime
        </span>
      </div>
    </footer>
  );
}
