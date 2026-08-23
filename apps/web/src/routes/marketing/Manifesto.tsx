/** An editorial statement of the promises that shape the product. */
import { Link } from 'react-router-dom';
import { MarketingShell } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

/** Kept exportable so public commitments remain reviewable in tests. */
export const MANIFESTO_HOLDINGS = [
  {
    title: 'The record remains yours.',
    body: 'A career system should make leaving practical: full exports, documented structures, and no paid gate around the archive.',
  },
  {
    title: 'Every conclusion needs a trail.',
    body: 'Provenance, relationships, source context, and factors belong beside the result. A score without its evidence is only a number asking for faith.',
  },
  {
    title: 'Your professional history is not generated.',
    body: 'Vitae uses deterministic product logic to help you find and select evidence. It does not hand your graph to a runtime AI provider or invent a career story for you.',
  },
  {
    title: 'Attention is not the business model.',
    body: 'No public feed, behavioral advertising, or engagement theater. The product exists to help you make a better next move, then get out of the way.',
  },
] as const;

export function Manifesto() {
  return (
    <MarketingShell mainClassName="mk-manifesto">
      <div className="mk__inner">
        <header className="mk-manifesto__masthead">
          <div>
            <h1 id="manifesto-heading">A career move deserves more than a document rewritten from memory.</h1>
            <p>
              Vitae is for the professional who has done the work, built the relationships, and now
              needs a calm way to carry that history into the next consequential conversation.
            </p>
          </div>
          <dl className="mk-manifesto__folio" aria-label="Manifesto edition">
            <div><dt>Edition</dt><dd>02</dd></div>
            <div><dt>Form</dt><dd>Living ledger</dd></div>
            <div><dt>Year</dt><dd>2026</dd></div>
          </dl>
        </header>

        <article className="mk-manifesto__body" aria-labelledby="manifesto-heading">
          <section className="mk-manifesto__chapter" aria-labelledby="manifesto-memory">
            <p className="mk-manifesto__chaptermark" aria-hidden="true">I</p>
            <div>
              <h2 id="manifesto-memory">Memory is relational.</h2>
              <p>
                A career is not a sequence of titles. It is the person who introduced you to a team,
                the project that showed you a capability, the conversation that changed your direction,
                and the evidence that can still explain why you belong in the next room.
              </p>
              <blockquote>The useful fact is rarely the isolated fact. It is the path that explains why it matters now.</blockquote>
              <p>
                Most tools scatter that path across a calendar, contact list, résumé, job board, and note archive.
                Vitae begins with the opposite assumption: one connected career record can be read through many lenses
                without making you re-enter the same truth.
              </p>
            </div>
          </section>

          <hr className="mk-manifesto__rule" />

          <section className="mk-manifesto__chapter" aria-labelledby="manifesto-instrument">
            <p className="mk-manifesto__chaptermark" aria-hidden="true">II</p>
            <div>
              <h2 id="manifesto-instrument">The record comes before the recommendation.</h2>
              <p>
                People, roles, projects, applications, interactions, and achievement evidence enter a typed,
                versioned network. Warm paths, reconnect work, career output, and exports are views over that
                record—not fresh silos asking you to reconstruct your life in a new format.
              </p>
              <p>
                A trusted system should show its working without demanding that you become its operator. Vitae keeps
                provenance beside facts, factors beside scores, and revisions beside the current record. You can inspect
                the machinery when it matters and stay focused on the next action when it does not.
              </p>
            </div>
          </section>

          <hr className="mk-manifesto__rule" />

          <section className="mk-manifesto__chapter" aria-labelledby="manifesto-holdings">
            <p className="mk-manifesto__chaptermark" aria-hidden="true">III</p>
            <div>
              <h2 id="manifesto-holdings">Four holdings.</h2>
              <ul className="mk-manifesto__list" aria-label="What Vitae holds itself to">
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
            <p className="mk-manifesto__chaptermark" aria-hidden="true">IV</p>
            <div>
              <h2 id="manifesto-refusal">The system should be quiet enough to use for years.</h2>
              <p>
                The serious career work happens when an opportunity arrives, but the foundation is built between
                those moments: capture a project while it is fresh, remember the context of a relationship, and
                keep the evidence where you will find it again. The product should feel useful on an ordinary Tuesday,
                not only impressive in a demo.
              </p>
              <p>
                Vitae Cloud is designed around one private career workspace because the person living the story should
                remain close to it. The goal is not to make you more visible. It is to make your next move more grounded.
              </p>
            </div>
          </section>

          <footer className="mk-manifesto__closing">
            <p>Vitae · a quiet instrument for the work behind the work</p>
            <div>
              <CloudAction className="mk-action mk-action--primary mk-action--lg" />
              <Link className="mk-action mk-action--lg" to="/tour">Take the product tour</Link>
            </div>
          </footer>
        </article>
      </div>
    </MarketingShell>
  );
}
