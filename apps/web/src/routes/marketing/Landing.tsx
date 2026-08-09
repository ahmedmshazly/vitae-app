/**
 * The public landing page: the poster for the instrument. Quiet identity:
 * flat surfaces, no ambient wash, brand as the hero signal, product shot as
 * the only first-viewport visual. Sections below carry the argument.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Button, Glyph, Kbd } from '@vitae/ui';
import { MkFoot, MkNav } from './Chrome.js';

/** Facts that used to crowd the hero; they belong after the product argument. */
export const LANDING_FACTS: Array<{ num: string; label: string }> = [
  { num: '28', label: 'typed records, from roles to habits' },
  { num: '18', label: 'connection kinds, each with real fields' },
  { num: '1', label: 'life map that connects all of it' },
  { num: '0', label: 'lock-in: full export, documented schema' },
];

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function Frame({ src, alt, url }: { src: string; alt: string; url: string }) {
  return (
    <figure className="mk-frame" style={{ margin: 0 }}>
      <div className="mk-frame__bar" aria-hidden>
        <span className="mk-frame__dot" />
        <span className="mk-frame__dot" />
        <span className="mk-frame__dot" />
        <span className="mk-frame__url">{url}</span>
      </div>
      <img src={src} alt={alt} loading="lazy" />
    </figure>
  );
}

export function Landing() {
  return (
    <div className="mk">
      <MkNav />

      {/* Hero: brand · headline · sentence · CTAs · product shot */}
      <section className="mk-hero" aria-labelledby="landing-brand">
        <div className="mk__inner">
          <p id="landing-brand" className="mk-hero__brand">
            Vitae
          </p>
          <h1 className="mk-hero__title">Your life, as a living network.</h1>
          <p className="mk-hero__sub">
            People, work, and moments: captured in one line, connected into one private network.
          </p>
          <div className="mk-hero__ctas">
            <Link to="/signin">
              <Button variant="primary" size="lg">
                Get started
              </Button>
            </Link>
            <Link to="/tour">
              <Button size="lg">Take the tour</Button>
            </Link>
          </div>
          <div className="mk-hero__frame">
            <Frame
              src="/landing/today.png"
              alt="Vitae Today dashboard with momentum score, reconnect lane, pipeline and habits"
              url="vitae · today"
            />
          </div>
        </div>
      </section>

      {/* Product pillars */}
      <section className="mk-section" id="product">
        <div className="mk__inner">
          <Reveal>
            <div className="mk-section__kicker">The instrument</div>
            <h2 className="mk-section__title">File what happens when it happens.</h2>
            <p className="mk-section__lede">
              Capture with a short grammar when you need speed. Use structured forms when you need
              depth. Both write into one network of records and connections.
            </p>
            <p className="mk-hero__hint" style={{ marginTop: 'var(--ae-space-3)' }}>
              Keyboard-first: <Kbd>⌘K</Kbd> captures anything · <Kbd>⌘P</Kbd> jumps anywhere · <Kbd>n</Kbd> creates
              any record
            </p>
          </Reveal>

          <Reveal>
            <div className="mk-strip" aria-label="Product facts">
              {LANDING_FACTS.map((fact) => (
                <div key={fact.label} className="mk-strip__cell">
                  <div className="mk-strip__num">{fact.num}</div>
                  <div className="mk-strip__label">{fact.label}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="mk-feature">
            <Reveal>
              <div className="mk-feature__copy">
                <div className="mk-section__kicker">Capture</div>
                <h3 className="mk-section__title" style={{ fontSize: 26 }}>
                  One line, four records.
                </h3>
                <span className="mk-feature__code">
                  p Lina Farouk @@DevFest #ml &gt; met at the speaker dinner
                </span>
                <ul className="mk-feature__list">
                  <li>Person, event, topic, and note: parsed and connected in one keystroke.</li>
                  <li>Prefer forms? Each of the 28 record types has a structured editor.</li>
                  <li>Import history from LinkedIn, vCard, bookmarks, or calendars. Imports stage, dedupe, and roll back.</li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <Frame src="/landing/capture.png" alt="The ⌘K capture bar parsing a one-line entry" url="vitae · ⌘K capture" />
            </Reveal>
          </div>

          <div className="mk-feature mk-feature--flip">
            <Reveal>
              <div className="mk-feature__copy">
                <div className="mk-section__kicker">Relationships</div>
                <h3 className="mk-section__title" style={{ fontSize: 26 }}>
                  See who has gone quiet.
                </h3>
                <ul className="mk-feature__list">
                  <li>Closeness and cadence per person. Vitae surfaces who has gone quiet.</li>
                  <li>Favor ledger, met-via provenance, and topics feed the ranking engine.</li>
                  <li>Momentum, streaks, and a daily reconnect lane keep cadence visible.</li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <Frame
                src="/landing/person.png"
                alt="A person profile with relationship strength, cadence and favor ledger"
                url="vitae · profile"
              />
            </Reveal>
          </div>

          <div className="mk-feature">
            <Reveal>
              <div className="mk-feature__copy">
                <div className="mk-section__kicker">Life map</div>
                <h3 className="mk-section__title" style={{ fontSize: 26 }}>
                  See the shape of your life.
                </h3>
                <ul className="mk-feature__list">
                  <li>Force-directed explorer over your records: drag, zoom, hover to light a neighborhood.</li>
                  <li>Expand from any record; each hop is a connection you already logged.</li>
                  <li>Timeline and map views over the same network, sliced by time and place.</li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <Frame src="/landing/graph.png" alt="The life map showing a connected network of records" url="vitae · life map" />
            </Reveal>
          </div>

          <Reveal>
            <div className="mk-trio">
              <div className="mk-card">
                <span className="mk-card__glyph">
                  <Glyph name="ask" size={18} />
                </span>
                <div className="mk-card__title">Ask real questions</div>
                <p className="mk-card__body">
                  &quot;Who should I call about a robotics referral?&quot; Rankings are deterministic and
                  weight-tunable. Every score decomposes into factor chips.
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card__glyph">
                  <Glyph name="resume" size={18} />
                </span>
                <div className="mk-card__title">A résumé that compiles</div>
                <p className="mk-card__body">
                  Experience lives as atoms with provenance. Paste a job description; Vitae selects,
                  budgets, and compiles a tailored LaTeX PDF with keyword coverage.
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card__glyph">
                  <Glyph name="export" size={18} />
                </span>
                <div className="mk-card__title">Yours by design</div>
                <p className="mk-card__body">
                  Single-owner, default-deny access, one-click export of the whole network. Provenance and
                  confidence on every fact. Leave with everything.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="mk-section">
        <div className="mk__inner">
          <Reveal>
            <div className="mk-section__kicker">How it works</div>
            <h2 className="mk-section__title">Capture, connect, act.</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="mk-steps">
              <div className="mk-step">
                <div className="mk-step__num">01 · CAPTURE</div>
                <div className="mk-step__title">Write it down once</div>
                <p className="mk-step__body">
                  A conversation, a talk, a book, a goal. One line in ⌘K or one form, filed with date, source, and
                  connections.
                </p>
              </div>
              <div className="mk-step">
                <div className="mk-step__num">02 · CONNECT</div>
                <div className="mk-step__title">Let the network assemble</div>
                <p className="mk-step__body">
                  People link to events, skills to projects, highlights to books. Structure comes from use, not from
                  upfront ceremony.
                </p>
              </div>
              <div className="mk-step">
                <div className="mk-step__num">03 · ACT</div>
                <div className="mk-step__title">Use what you already banked</div>
                <p className="mk-step__body">
                  Reconnect nudges land before relationships cool. Asks rank your network. The résumé builds from
                  evidence you already captured.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Open source */}
      <section className="mk-section" id="pricing">
        <div className="mk__inner">
          <Reveal>
            <div className="mk-section__kicker">Open source</div>
            <h2 className="mk-section__title">A system you can run yourself.</h2>
            <p className="mk-section__lede">
              Vitae is Apache-2.0 licensed software for people who want a durable, personal system without handing
              their history to a hosted platform.
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="mk-plans">
              <div className="mk-plan">
                <div className="mk-plan__name">Self-host</div>
                <div className="mk-plan__price">
                  $0 <small>software license</small>
                </div>
                <div className="mk-plan__tag">For one life, well kept.</div>
                <ul className="mk-plan__list">
                  <li>Full network: all 28 record types</li>
                  <li>⌘K capture grammar and structured forms</li>
                  <li>Reconnect lane, habits, and streaks</li>
                  <li>Life map, timeline, and map explorers</li>
                  <li>Full export, always</li>
                </ul>
                <Link to="/signin">
                  <Button style={{ width: '100%', justifyContent: 'center' }}>Sign in</Button>
                </Link>
              </div>
              <div className="mk-plan mk-plan--hero">
                <span className="mk-plan__flag">Built in public</span>
                <div className="mk-plan__name">Own your data</div>
                <div className="mk-plan__price">
                  JSON <small>and CSV exports</small>
                </div>
                <div className="mk-plan__tag">For careers in motion.</div>
                <ul className="mk-plan__list">
                  <li>Documented portable data model</li>
                  <li>Résumé studio: atoms, tailoring, LaTeX PDF compile</li>
                  <li>&quot;Who should I call?&quot; explainable rankings</li>
                  <li>Warm-intro pathfinding</li>
                  <li>Imports with dedup and batch rollback</li>
                </ul>
                <a href="mailto:maintainers@vitae.example?subject=Vitae%20self-hosting%20question">
                  <Button variant="primary" style={{ width: '100%', justifyContent: 'center' }} aria-label="Ask a self-hosting question">
                    Ask a question
                  </Button>
                </a>
              </div>
              <div className="mk-plan">
                <div className="mk-plan__name">Make it yours</div>
                <div className="mk-plan__price">
                  TypeScript <small>throughout</small>
                </div>
                <div className="mk-plan__tag">For people who want to shape it.</div>
                <ul className="mk-plan__list">
                  <li>Clear module boundaries and typed APIs</li>
                  <li>Postgres data plane with migrations</li>
                  <li>Automated tests, accessibility checks, and CI</li>
                  <li>No runtime AI and no behavioural analytics</li>
                  <li>Contributions are welcome</li>
                </ul>
                <a href="mailto:maintainers@vitae.example?subject=Vitae%20contribution%20question">
                  <Button style={{ width: '100%', justifyContent: 'center' }} aria-label="Ask a contribution question">
                    Get involved
                  </Button>
                </a>
              </div>
            </div>
            <p className="mk-plans__note">
              Each installation has one configured operator. Records stay owner-scoped, encrypted in transit, and
              exportable. Questions? <a href="mailto:maintainers@vitae.example">Write to the maintainers</a>.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="mk-section">
        <div className="mk__inner">
          <Reveal>
            <div className="mk-section__kicker">Questions</div>
            <h2 className="mk-section__title">Straight answers.</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="mk-faq">
              <details>
                <summary>Who can see my data?</summary>
                <p>
                  You. The backend admits exactly one owner identity per network and denies everything else by default.
                  There is no feed, no social layer, no analytics resale. When multi-account lands, that stays true per
                  user: your records are yours alone.
                </p>
              </details>
              <details>
                <summary>Can I get my data out?</summary>
                <p>
                  Yes. One click exports the entire network as portable JSON with a documented schema, plus CSVs for
                  the tabular parts. Export is a design principle, not a gated feature.
                </p>
              </details>
              <details>
                <summary>Do I have to learn the keyboard grammar?</summary>
                <p>
                  No. The ⌘K grammar is the fast lane, but every record type has a full structured form, and every
                  connection has a visual editor. Use grammar in the moment and forms for depth.
                </p>
              </details>
              <details>
                <summary>What&apos;s a &quot;résumé atom&quot;?</summary>
                <p>
                  A single verifiable unit of experience (for example, &quot;cut inference latency 38%&quot;) with links to the
                  project, the role, and the skill it proves. Atoms carry provenance, so tailoring a résumé is
                  selection, not rewriting from memory.
                </p>
              </details>
              <details>
                <summary>How do I get started?</summary>
                <p>
                  Clone Vitae, configure one owner identity, and follow the setup guide in the repository. The demo
                  seed is fictional, so you can explore the whole system before adding your own records.
                </p>
              </details>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mk-cta">
        <div className="mk__inner">
          <h2 className="mk-cta__title">Start capturing.</h2>
          <p className="mk-cta__sub">
            A few minutes gets you your first records. The network grows as you use it.
          </p>
          <div className="mk-cta__actions">
            <Link to="/signin">
              <Button variant="primary" size="lg">
                Get started
              </Button>
            </Link>
            <Link to="/manifesto">
              <Button size="lg">Read the manifesto</Button>
            </Link>
          </div>
        </div>
      </section>

      <MkFoot />
    </div>
  );
}
