/** The manifesto: an editorial statement of product intent and boundaries. */
import { Link } from 'react-router-dom';
import { MkFoot, MkNav } from './Chrome.js';

/** Principles the product holds itself to. Kept exportable for truth tests. */
export const MANIFESTO_HOLDINGS = [
  {
    title: 'The data is yours.',
    body: "Full export, documented schema, no gates. If we ever make leaving hard, we've failed.",
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
      <main className="mk-manifesto">
        <div className="mk__inner">
          <header className="mk-manifesto__masthead">
            <div>
              <h1 id="manifesto-heading" className="mk-manifesto__title">
                A quiet instrument for a loud life.
              </h1>
              <p className="mk-manifesto__deck">
                Software for remembering the connections that made the work—and for acting on them
                without surrendering the record.
              </p>
            </div>
            <dl className="mk-manifesto__folio" aria-label="Manifesto edition">
              <div>
                <dt>Edition</dt>
                <dd>01</dd>
              </div>
              <div>
                <dt>Place</dt>
                <dd>Cairo</dd>
              </div>
              <div>
                <dt>Year</dt>
                <dd>2026</dd>
              </div>
            </dl>
          </header>

          <article className="mk-manifesto__body" aria-labelledby="manifesto-heading">
            <section className="mk-manifesto__chapter" aria-labelledby="manifesto-memory">
              <p className="mk-manifesto__chaptermark" aria-hidden="true">
                I
              </p>
              <div>
                <h2 id="manifesto-memory">Memory is relational.</h2>
                <p>
                  Your life produces more information than anything you have been given to hold it.
                  Your calendar owns your time. A social network owns your relationships and rents
                  them back to you. Your résumé is a document rewritten from memory, under deadline,
                  every time it matters.
                </p>
                <blockquote>
                  The useful fact is rarely the isolated fact. It is the path that explains why it
                  matters now.
                </blockquote>
                <p>
                  The person you met at dinner introduced you to the team that led to the role that
                  taught you the skill you are about to be hired for.{' '}
                  <strong>Nothing else owns that chain.</strong> Vitae begins there: a life is a
                  network, not a list.
                </p>
              </div>
            </section>

            <hr className="mk-manifesto__rule" />

            <section className="mk-manifesto__chapter" aria-labelledby="manifesto-instrument">
              <p className="mk-manifesto__chaptermark" aria-hidden="true">
                II
              </p>
              <div>
                <h2 id="manifesto-instrument">The record comes before the dashboard.</h2>
                <p>
                  People, roles, projects, talks, books, trips, habits, and favors enter one typed,
                  versioned network. The reconnect lane, who-to-call ranking, life map, and
                  self-compiling résumé are lenses over that network—not new silos asking you to
                  repeat yourself.
                </p>
                <p>
                  A tool that remembers on your behalf must show its work. Provenance belongs beside
                  the fact. Ranking factors belong beside the score. Revisions belong beside the
                  current version. The interface should help you inspect the machinery without
                  forcing you to operate it.
                </p>
              </div>
            </section>

            <hr className="mk-manifesto__rule" />

            <section className="mk-manifesto__chapter" aria-labelledby="manifesto-holdings">
              <p className="mk-manifesto__chaptermark" aria-hidden="true">
                III
              </p>
              <div>
                <h2 id="manifesto-holdings">Four holdings.</h2>
                <ul className="mk-manifesto__list" aria-label="What we hold ourselves to">
                  {MANIFESTO_HOLDINGS.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <hr className="mk-manifesto__rule" />

            <section className="mk-manifesto__chapter" aria-labelledby="manifesto-refusal">
              <p className="mk-manifesto__chaptermark" aria-hidden="true">
                IV
              </p>
              <div>
                <h2 id="manifesto-refusal">Attention is not the business model.</h2>
                <p>
                  We refuse feeds, followers, and engagement mechanics that farm attention. Vitae
                  can show habits, cadence, and momentum, but those signals serve your commitments,
                  not a retention curve. There are <strong>no ads and never will be</strong>; your
                  records are not inventory.
                </p>
                <p>
                  Vitae is deliberately built for one configured operator. It is self-hosted,
                  default-deny, and exportable because the owner of a life record should remain the
                  person living it. The software should feel like a well-made instrument: quiet at
                  rest, precise in use, and easy to put down.
                </p>
              </div>
            </section>

            <footer className="mk-manifesto__closing">
              <p className="mk-manifesto__sig">Vitae · built in Cairo · 2026</p>
              <div className="mk-manifesto__ctas">
                <Link className="mk-action mk-action--primary mk-action--lg" to="/signin">
                  Get started
                </Link>
                <Link className="mk-action mk-action--lg" to="/tour">
                  Take the tour
                </Link>
              </div>
            </footer>
          </article>
        </div>
      </main>
      <MkFoot />
    </div>
  );
}
