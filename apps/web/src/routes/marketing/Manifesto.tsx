/** The manifesto: why Vitae exists, written to be read. Quiet poster prose. */
import { Link } from 'react-router-dom';
import { Button } from '@vitae/ui';
import { MkFoot, MkNav } from './Chrome.js';

/** Principles the product holds itself to. Kept exportable for truth tests. */
export const MANIFESTO_HOLDINGS = [
  {
    title: 'The data is yours.',
    body: 'Full export, documented schema, no gates. If we ever make leaving hard, we\'ve failed.',
  },
  {
    title: 'Provenance on every fact.',
    body: 'Where a datum came from and how much we trust it is visible, always. Memory deserves footnotes.',
  },
  {
    title: 'Scores you can decompose.',
    body: 'When Vitae ranks someone, it shows the factors and lets you re-weight them. No oracle, no vibes.',
  },
  {
    title: 'Keyboard first, dark, calm.',
    body: 'Speed respects your attention. The interface stays quiet so you can come back tomorrow.',
  },
] as const;

export function Manifesto() {
  return (
    <div className="mk">
      <MkNav />
      <section className="mk-manifesto" aria-labelledby="manifesto-heading">
        <div className="mk__inner">
          <div className="mk-section__kicker">Manifesto</div>
          <h1 id="manifesto-heading" className="mk-section__title mk-manifesto__title">
            A quiet instrument for a loud life.
          </h1>

          <div className="mk-manifesto__body">
            <p>
              Your life produces more information than anything you&apos;ve been given to hold it. Your
              calendar owns your time. A social network owns your relationships and rents them
              back to you. Your résumé is a document you rewrite from memory, under deadline, every
              time it matters. <strong>Nothing owns the connections</strong>: the fact that the
              person you met at that dinner introduced you to the team that led to the role that
              taught you the skill you&apos;re about to be hired for.
            </p>
            <p>
              Vitae is built on one idea: <strong>a life is a network, not a list.</strong>{' '}
              People, roles, projects, talks, books, trips, habits, favors. The value sits in the
              connections between them. So Vitae stores a network first, and every
              screen (the reconnect lane, the who-should-I-call ranking, the self-compiling résumé)
              is a lens over that network.
            </p>

            <hr className="mk-manifesto__rule" />

            <p>
              <strong>What we hold ourselves to:</strong>
            </p>
            <ul className="mk-manifesto__list" aria-label="What we hold ourselves to">
              {MANIFESTO_HOLDINGS.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong> {item.body}
                </li>
              ))}
            </ul>

            <p>
              <strong>What we refuse:</strong> feeds, followers, engagement mechanics that farm your
              attention. Vitae has streaks and momentum, but they serve <em>your</em> habits, not
              our retention curves. There are no ads and never will be; your records are not
              inventory. The software should feel like a well-made tool: silent until used, precise when it matters.
            </p>
            <p>
              Vitae is made for one person at a time. Multi-account is coming, but the unit will
              always be a single, owner-scoped network. Yours.
            </p>

            <hr className="mk-manifesto__rule" />
            <p className="mk-manifesto__sig">Vitae · built in Cairo · 2026</p>

            <div className="mk-manifesto__ctas">
              <Link to="/signin">
                <Button variant="primary" size="lg">
                  Get started
                </Button>
              </Link>
              <Link to="/tour">
                <Button size="lg">Take the tour</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <MkFoot />
    </div>
  );
}
