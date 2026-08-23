/** Trust copy only names behaviors that exist or are explicit launch gates. */
import { Link } from 'react-router-dom';
import { Glyph } from '@vitae/ui';
import { publicLaunchConfig } from '../../public/site.js';
import { MarketingShell } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

const OWNERSHIP_FACTS = [
  {
    title: 'Evidence before inference',
    body: 'Records, relationships, provenance, revisions, and score factors remain available to inspect. Vitae does not ask you to accept an unexplained career conclusion.',
    glyph: 'adjust' as const,
  },
  {
    title: 'No runtime AI provider',
    body: 'Capture parsing, relationship scoring, ranking, job-description parsing, and résumé selection run as deterministic product logic. Vitae does not send your graph to a runtime AI provider for those jobs.',
    glyph: 'document' as const,
  },
  {
    title: 'Portability is a product feature',
    body: 'Full export includes identity-preserving JSONL collections, an Obsidian-compatible Markdown vault, and a checksum manifest. Saved views can leave as CSV.',
    glyph: 'export' as const,
  },
] as const;

export function SecurityOwnership() {
  const cloudEnabled = publicLaunchConfig.cloudEnabled;
  const privacyAction = cloudEnabled ? 'Read the privacy policy' : 'Read privacy status';
  const privacyDocument = cloudEnabled ? 'Privacy policy' : 'Privacy information';
  return (
    <MarketingShell>
      <section className="mk-page-hero" aria-labelledby="ownership-heading">
        <div className="mk__inner mk-page-hero__layout">
          <div>
            <h1 id="ownership-heading">A career record should be inspectable while you use it and portable when you leave.</h1>
            <p>
              Vitae is designed for sensitive professional context: people, opportunities, work history,
              and evidence that should serve your decisions rather than an advertising or engagement system.
            </p>
            <div className="mk-page-hero__actions">
              <CloudAction className="mk-action mk-action--primary mk-action--lg" />
              <Link className="mk-text-link" to="/legal/privacy">{privacyAction} <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div className="mk-page-hero__aside">
            <p>Vitae does not use your record for</p>
            <ul>
              <li><Glyph name="bell" size={17} /> Behavioral advertising</li>
              <li><Glyph name="graph" size={17} /> A public social feed</li>
              <li><Glyph name="resume" size={17} /> Generated career claims</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="truth-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="truth-heading">The product should show its working.</h2>
            <p>
              Trust is not a badge or a broad promise. It is the everyday behavior of the system:
              visible evidence, clear limits, a usable export, and a plain explanation when a result is derived.
            </p>
          </div>
          <div className="mk-trust-ledger">
            {OWNERSHIP_FACTS.map((fact, index) => (
              <article key={fact.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <Glyph name={fact.glyph} size={20} />
                <div>
                  <h3>{fact.title}</h3>
                  <p>{fact.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="cloud-heading">
        <div className="mk__inner mk-boundary">
          <div>
            <h2 id="cloud-heading">Cloud access is only credible when the operational details are public.</h2>
            <p>
              Vitae Cloud is not presented as a certification program. Before public activation, it requires
              published legal terms, a privacy policy, subprocessor disclosure, support and incident paths,
              export and deletion procedures, verified backups, and authenticated workspace isolation.
            </p>
          </div>
          <ul aria-label="Cloud readiness commitments">
            <li><strong>Private workspace boundaries</strong><span>Every request and durable record must resolve through authenticated workspace membership, not a browser-selected tenant.</span></li>
            <li><strong>Clear lifecycle controls</strong><span>Trial, billing, read-only, export, cancellation, and deletion states must be enforced on the server and explained in product copy.</span></li>
            <li><strong>Public operational routes</strong><span>Privacy, terms, processing details, support, status, and security disclosure need working public destinations before Cloud checkout is enabled.</span></li>
          </ul>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="review-heading">
        <div className="mk__inner mk-review-links">
          <div>
            <h2 id="review-heading">Read the details, not a reassurance slogan.</h2>
            <p>The public documents below are where operational and legal commitments belong.</p>
          </div>
          <nav aria-label="Trust documents">
            <Link to="/legal/privacy"><span>01</span> {privacyDocument} <b aria-hidden="true">→</b></Link>
            <Link to="/legal/terms"><span>02</span> Terms of service <b aria-hidden="true">→</b></Link>
            <Link to="/legal/dpa"><span>03</span> Data processing addendum <b aria-hidden="true">→</b></Link>
            <Link to="/legal/subprocessors"><span>04</span> Subprocessors <b aria-hidden="true">→</b></Link>
            <Link to="/status"><span>05</span> Service status <b aria-hidden="true">→</b></Link>
          </nav>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="ownership-closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="ownership-closing-heading">Keep a career record you can inspect, export, and explain.</h2>
            <p>Start with the evidence you want to remain yours when the next opportunity appears.</p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" />
            <Link className="mk-action mk-action--lg" to="/guides/export-and-leave">Read the export guide</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
