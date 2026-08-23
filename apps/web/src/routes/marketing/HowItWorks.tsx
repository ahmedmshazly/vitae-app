/** A career-move workflow rather than a feature inventory. */
import { Link } from 'react-router-dom';
import { ProductFrame, MarketingShell } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

const WORKFLOW = [
  {
    title: 'Capture the signal while it is still specific.',
    body: 'A person, project, interaction, role, or next action can enter through quick capture or a structured form. The goal is not volume. It is enough context to make the record useful later.',
    image: '/landing/capture.png',
    alt: 'Vitae command capture bar parsing a person, organization, tag, and note',
    label: 'Capture · inspect the parse before saving',
  },
  {
    title: 'Connect the facts that explain why it matters.',
    body: 'Relationships, organizations, roles, source context, dates, and revisions stay attached to the record. The network becomes a way to check your memory, not a separate visual toy.',
    image: '/landing/graph.png',
    alt: 'Vitae graph view connecting people, work, skills, and events',
    label: 'Graph · a lens over the same record',
  },
  {
    title: 'Inspect the evidence before acting on it.',
    body: 'When you look for a warm path, relationship score, or relevant achievement, Vitae shows the connection types and evidence behind it. You make the call; the system keeps the trail visible.',
    image: '/landing/person.png',
    alt: 'Vitae person record with relationship strength, cadence, interactions, and favor ledger',
    label: 'Person · relationship context in one ledger',
  },
  {
    title: 'Move the opportunity forward without reassembling your story.',
    body: 'Track the next conversation or application, select reviewed achievement atoms for a target, compile an ATS-safe output, and keep the context ready for the next revision.',
    image: '/landing/today.png',
    alt: 'Vitae Today view with reconnect work, application pipeline, and daily follow-through',
    label: 'Today · return to the next useful action',
  },
] as const;

export function HowItWorks() {
  return (
    <MarketingShell>
      <section className="mk-page-hero" aria-labelledby="how-heading">
        <div className="mk__inner mk-page-hero__layout">
          <div>
            <h1 id="how-heading">A career move is a chain of evidence, not a fresh start every time.</h1>
            <p>
              Vitae gives one private career record four jobs: preserve context, connect it, make
              the reasoning visible, and move the opportunity forward.
            </p>
            <div className="mk-page-hero__actions">
              <CloudAction className="mk-action mk-action--primary mk-action--lg" />
              <Link className="mk-text-link" to="/tour">
                Take the product tour <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <ol className="mk-page-trace" aria-label="Opportunity workflow">
            <li><span>01</span><strong>Capture</strong><p>Keep the specific detail.</p></li>
            <li><span>02</span><strong>Connect</strong><p>Preserve the surrounding context.</p></li>
            <li><span>03</span><strong>Decide</strong><p>Read the evidence trail.</p></li>
            <li><span>04</span><strong>Move</strong><p>Act with a credible record behind you.</p></li>
          </ol>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="workflow-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="workflow-heading">The same record supports the ordinary day and the important window.</h2>
            <p>
              Start with what happened. The daily view, relationship work, application pipeline,
              and career output all read from the same underlying evidence.
            </p>
          </div>
          <ol className="mk-workflow">
            {WORKFLOW.map((step, index) => (
              <li key={step.title}>
                <div className="mk-workflow__copy">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                <ProductFrame src={step.image} alt={step.alt} label={step.label} />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="not-heading">
        <div className="mk__inner mk-boundary">
          <div>
            <h2 id="not-heading">What Vitae does not ask you to do.</h2>
            <p>
              It does not turn your professional life into a feed, guess the facts it cannot know,
              or make you maintain separate tools for the relationship, the career story, and the output.
            </p>
          </div>
          <ul aria-label="Vitae product boundaries">
            <li><strong>No engagement feed</strong><span>The record serves your commitments, not an attention loop.</span></li>
            <li><strong>No black-box recommendation</strong><span>Scores and paths remain traceable to your recorded data.</span></li>
            <li><strong>No runtime AI provider</strong><span>Parsing, ranking, and selection stay deterministic and inspectable.</span></li>
          </ul>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="how-closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="how-closing-heading">Start with the next move, not a migration project.</h2>
            <p>One person, one project, and one next action are enough to make the record begin working.</p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" />
            <Link className="mk-action mk-action--lg" to="/guides/first-career-record">Read the setup guide</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
