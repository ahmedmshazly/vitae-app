/** The public acquisition story: capture a fact, connect its context, use it. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { EDGE_TYPES, NODE_TYPES, SOURCE_TYPES } from '@vitae/core';
import { Glyph, Kbd } from '@vitae/ui';
import { MkFoot, MkNav, ProductFrame, PUBLIC_SOURCE_URL } from './Chrome.js';

const QUIET_EASE = [0.32, 0.72, 0, 1] as const;

/** Product facts derive from the shared vocabulary so marketing cannot drift. */
export const LANDING_FACTS: Array<{ num: string; label: string }> = [
  { num: String(NODE_TYPES.length), label: 'record types with structured forms' },
  { num: String(EDGE_TYPES.length), label: 'typed connection kinds' },
  { num: String(SOURCE_TYPES.length), label: 'provenance sources' },
  { num: '0', label: 'runtime AI calls' },
];

function Reveal({
  children,
  delay = 0,
  gesture = 'rise',
}: {
  children: ReactNode;
  delay?: number;
  gesture?: 'rise' | 'fade' | 'uncover';
}) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;

  const initial =
    gesture === 'fade'
      ? { opacity: 1 }
      : gesture === 'uncover'
        ? { opacity: 1, clipPath: 'inset(0 0 4px 0)' }
        : { opacity: 1, y: 4 };

  return (
    <motion.div
      initial={initial}
      whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
      viewport={{ once: true, margin: '-72px' }}
      transition={{ duration: 0.22, ease: QUIET_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Landing() {
  return (
    <div className="mk">
      <MkNav />

      <main>
        <section className="mk-hero" aria-labelledby="landing-heading">
          <div className="mk__inner mk-hero__layout">
            <div className="mk-hero__copy">
              <p className="mk-hero__brand">Vitae</p>
              <h1 id="landing-heading" className="mk-hero__title">
                Your life, as a living network.
              </h1>
              <p className="mk-hero__sub">
                Capture people, work, and moments while they are fresh. Vitae keeps the context
                between them—and turns it into your next useful action.
              </p>
              <div className="mk-hero__ctas">
                <Link className="mk-action mk-action--primary mk-action--lg" to="/signin">
                  Get started
                </Link>
                <Link className="mk-action mk-action--lg" to="/tour">
                  Take the tour
                </Link>
              </div>
              <ul className="mk-hero__proof" aria-label="Product boundaries">
                <li>Self-hosted</li>
                <li>One configured operator</li>
                <li>No runtime AI</li>
              </ul>
            </div>

            <div className="mk-hero__frame">
              <ProductFrame
                src="/landing/today.png"
                alt="Vitae Today dashboard with momentum score, reconnect lane, pipeline and habits"
                label="Today · daily operating view"
                eager
              />
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section--story"
          id="product"
          aria-labelledby="story-heading"
        >
          <div className="mk__inner">
            <Reveal>
              <header className="mk-section__head">
                <h2 id="story-heading" className="mk-section__title">
                  A sentence becomes a network.
                </h2>
                <p className="mk-section__lede">
                  Fast capture does not flatten the story. A deterministic grammar separates the
                  record, its context, and its provenance before anything is saved.
                </p>
              </header>
            </Reveal>

            <Reveal gesture="fade">
              <div className="mk-capture-line" aria-label="Example capture and parsed result">
                <code>p Lina Farouk @@DevFest #ml &gt; met at the speaker dinner</code>
                <span className="mk-capture-line__key">
                  <Kbd>⌘K</Kbd> then Enter
                </span>
              </div>
              <ol className="mk-story__steps">
                <li>
                  <span className="mk-story__verb">Capture</span>
                  <strong>Person · Lina Farouk</strong>
                  <span>A typed person record, ready to enrich.</span>
                </li>
                <li>
                  <span className="mk-story__verb">Connect</span>
                  <strong>Organization · DevFest</strong>
                  <span>The tag and note stay attached as context.</span>
                </li>
                <li>
                  <span className="mk-story__verb">Accumulate</span>
                  <strong>One inspectable life map</strong>
                  <span>Every hop comes from a connection you recorded.</span>
                </li>
              </ol>
            </Reveal>

            <div className="mk-story__frames">
              <Reveal gesture="uncover">
                <div className="mk-story__frame">
                  <ProductFrame
                    src="/landing/capture.png"
                    alt="The command capture bar parsing a person, organization, tag, and note"
                    label="Capture · parsed before save"
                  />
                  <p>
                    Preview chips show exactly what the grammar understood. Nothing is inferred by a
                    model and nothing is hidden behind a confidence-free guess.
                  </p>
                </div>
              </Reveal>
              <Reveal gesture="uncover" delay={0.08}>
                <div className="mk-story__frame">
                  <ProductFrame
                    src="/landing/graph.png"
                    alt="The life map showing connected people, work, skills, and events"
                    label="Life map · the accumulated network"
                  />
                  <p>
                    Drag, zoom, inspect a neighborhood, and expand from any record. The map is a
                    view over your ledger—not a second copy of it.
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal>
              <dl className="mk-strip" aria-label="Product facts">
                {LANDING_FACTS.map((fact) => (
                  <div key={fact.label} className="mk-strip__cell">
                    <dt className="mk-strip__num">{fact.num}</dt>
                    <dd className="mk-strip__label">{fact.label}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="depth-heading">
          <div className="mk__inner">
            <Reveal>
              <header className="mk-section__head">
                <h2 id="depth-heading" className="mk-section__title">
                  Keep the texture. Lose the scavenger hunt.
                </h2>
                <p className="mk-section__lede">
                  Relationships, evidence, and history stay legible at the moment you need them.
                  Fast entry and deep editing share the same records.
                </p>
              </header>
            </Reveal>

            <div className="mk-feature">
              <Reveal>
                <div className="mk-feature__copy">
                  <h3 className="mk-feature__title">Know why a relationship needs attention.</h3>
                  <p className="mk-feature__body">
                    Closeness, reconnect cadence, interactions, topics, and favors sit together. A
                    relationship score is decomposable, so the number never becomes an oracle.
                  </p>
                  <ul className="mk-feature__list">
                    <li>Cadence and quiet time are visible per person.</li>
                    <li>Favor entries preserve direction and balance.</li>
                    <li>Connection records carry their own fields and provenance.</li>
                  </ul>
                </div>
              </Reveal>
              <Reveal gesture="uncover" delay={0.08}>
                <ProductFrame
                  src="/landing/person.png"
                  alt="A person profile with relationship strength, cadence, interactions, and favor ledger"
                  label="Person · relationship ledger"
                />
              </Reveal>
            </div>

            <div className="mk-feature mk-feature--flip">
              <Reveal>
                <div className="mk-feature__copy">
                  <h3 className="mk-feature__title">Add depth when the moment allows.</h3>
                  <p className="mk-feature__body">
                    Every one of the {NODE_TYPES.length} record types has a sectioned, validated
                    form. Inline connection editors let you enrich context without leaving the
                    record.
                  </p>
                  <ul className="mk-feature__list">
                    <li>Dates, source, confidence, and sensitivity are first-class fields.</li>
                    <li>
                      LinkedIn, vCard, calendar, bookmark, and CSV imports stage before commit.
                    </li>
                    <li>Every write creates a revision; deleted records remain recoverable.</li>
                  </ul>
                </div>
              </Reveal>
              <Reveal gesture="uncover" delay={0.08}>
                <ProductFrame
                  src="/landing/form.png"
                  alt="A structured person form with sections, validation, and contextual fields"
                  label="Structured form · depth on demand"
                />
              </Reveal>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="outcomes-heading">
          <div className="mk__inner mk-outcomes__layout">
            <Reveal>
              <header className="mk-section__head mk-section__head--sticky">
                <h2 id="outcomes-heading" className="mk-section__title">
                  Your history should answer back.
                </h2>
                <p className="mk-section__lede">
                  The ledger earns its keep by turning already-captured evidence into decisions and
                  outputs—deterministically, with the reasoning left visible.
                </p>
              </header>
            </Reveal>

            <div className="mk-outcomes">
              <Reveal>
                <article className="mk-outcome">
                  <span className="mk-outcome__glyph" aria-hidden="true">
                    <Glyph name="ask" size={18} />
                  </span>
                  <div>
                    <h3>Ask the network</h3>
                    <p>
                      Rank who to call for a referral, introduction, or conversation. Every result
                      exposes its factors and weights.
                    </p>
                  </div>
                </article>
              </Reveal>
              <Reveal delay={0.06}>
                <article className="mk-outcome">
                  <span className="mk-outcome__glyph" aria-hidden="true">
                    <Glyph name="resume" size={18} />
                  </span>
                  <div>
                    <h3>Compile a résumé</h3>
                    <p>
                      Parse a job description, select verified achievement atoms, budget one page,
                      and compile an ATS-oriented LaTeX PDF.
                    </p>
                  </div>
                </article>
              </Reveal>
              <Reveal delay={0.12}>
                <article className="mk-outcome">
                  <span className="mk-outcome__glyph" aria-hidden="true">
                    <Glyph name="export" size={18} />
                  </span>
                  <div>
                    <h3>Leave with everything</h3>
                    <p>
                      Export one JSONL file per collection, an Obsidian-compatible Markdown vault,
                      and a checksum manifest. Saved views can leave as CSV.
                    </p>
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section--selfhost"
          id="self-host"
          aria-labelledby="selfhost-heading"
        >
          <span id="pricing" className="mk-anchor-legacy" aria-hidden="true" />
          <div className="mk__inner mk-selfhost">
            <Reveal>
              <div className="mk-selfhost__copy">
                <h2 id="selfhost-heading" className="mk-section__title">
                  A system you can run yourself.
                </h2>
                <p className="mk-section__lede">
                  Vitae is Apache-2.0 licensed, single-operator software. Run it on infrastructure
                  you control, configure the one owner identity, and keep recovery procedures close.
                </p>
                <div className="mk-selfhost__actions">
                  <a className="mk-action mk-action--primary" href={PUBLIC_SOURCE_URL}>
                    Find source on GitHub
                  </a>
                  <Link className="mk-action" to="/tour">
                    Tour the interface
                  </Link>
                  <Link className="mk-text-link" to="/manifesto">
                    Read the operating principles →
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal gesture="fade" delay={0.08}>
              <dl className="mk-selfhost__facts">
                <div>
                  <dt>Access model</dt>
                  <dd>One configured operator; every request denied by default.</dd>
                </div>
                <div>
                  <dt>Durable store</dt>
                  <dd>PostgreSQL 17 behind route, service, and repository boundaries.</dd>
                </div>
                <div>
                  <dt>Portability</dt>
                  <dd>Checksummed JSONL and Markdown-vault backup with documented restore.</dd>
                </div>
                <div>
                  <dt>Computation</dt>
                  <dd>
                    Deterministic TypeScript algorithms; no graph data sent to an AI provider.
                  </dd>
                </div>
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="questions-heading">
          <div className="mk__inner mk-faq__layout">
            <Reveal>
              <header className="mk-section__head">
                <h2 id="questions-heading" className="mk-section__title">
                  Straight answers.
                </h2>
                <p className="mk-section__lede">
                  Vitae is intentionally narrow about ownership, automation, and where your data
                  lives.
                </p>
              </header>
            </Reveal>
            <Reveal gesture="fade">
              <div className="mk-faq">
                <details>
                  <summary>Who can see my data?</summary>
                  <p>
                    The configured operator. Production access requires a verified identity matching
                    the owner email, and the API denies other requests by default. Vitae has no
                    social feed, behavioral advertising, or telemetry-based profiling.
                  </p>
                </details>
                <details>
                  <summary>Can I get my data out?</summary>
                  <p>
                    Yes. A full export contains identity-preserving JSONL, an Obsidian-compatible
                    Markdown vault, and SHA-256 checksums. Saved views can also be exported as CSV.
                  </p>
                </details>
                <details>
                  <summary>Do I have to learn the capture grammar?</summary>
                  <p>
                    No. The command grammar is the fast lane. All {NODE_TYPES.length} record types
                    have structured forms, and connections have visual editors. Use the path that
                    fits the moment.
                  </p>
                </details>
                <details>
                  <summary>Does Vitae send my graph to an AI model?</summary>
                  <p>
                    No. Capture parsing, relationship scoring, ranking, job-description parsing, and
                    résumé selection run as deterministic algorithms without a runtime AI provider.
                  </p>
                </details>
                <details>
                  <summary>How do I get started?</summary>
                  <p>
                    Clone the repository, configure one owner identity, and follow the quick start.
                    The seed records are fictional, so you can inspect the complete product before
                    adding your own history.
                  </p>
                </details>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-cta" aria-labelledby="closing-heading">
          <div className="mk__inner">
            <h2 id="closing-heading" className="mk-cta__title">
              Keep the next thing you will wish you remembered.
            </h2>
            <p className="mk-cta__sub">
              Start with one person, one project, or one conversation. The network gains shape
              through use.
            </p>
            <div className="mk-cta__actions">
              <Link className="mk-action mk-action--primary mk-action--lg" to="/signin">
                Get started
              </Link>
              <Link className="mk-action mk-action--lg" to="/manifesto">
                Read the manifesto
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MkFoot />
    </div>
  );
}
