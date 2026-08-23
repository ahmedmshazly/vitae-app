/** Relationship intelligence stays evidence-led: a path is context, not permission. */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Glyph } from '@vitae/ui';
import { MarketingShell, ProductFrame } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

const ROUTE_EXAMPLES = [
  {
    key: 'nile',
    label: 'Reach Nile Robotics',
    destination: 'Nile Robotics · Perception',
    note: 'A recorded colleague path makes the final affiliation visible before an ask is drafted.',
    hops: [
      { name: 'Jordan Kim', meta: 'starting record' },
      { name: 'Lina Farouk', meta: 'knows · research circle' },
      { name: 'Karim Nabil', meta: 'knows · colleague context' },
      { name: 'Nile Robotics', meta: 'works at · Engineering Manager' },
    ],
  },
  {
    key: 'sarah',
    label: 'Reach a hiring conversation',
    destination: 'Staff platform conversation',
    note: 'A direct recorded relationship can still need context: cadence, past interactions, and the reason the request is timely.',
    hops: [
      { name: 'Jordan Kim', meta: 'starting record' },
      { name: 'Sarah Chen', meta: 'knows · DevFest speaker dinner' },
      { name: 'Nile Robotics', meta: 'works at · Staff SWE' },
    ],
  },
] as const;

export function WarmPaths() {
  const [selected, setSelected] = useState<(typeof ROUTE_EXAMPLES)[number]['key']>('nile');
  const routeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const route = ROUTE_EXAMPLES.find((item) => item.key === selected)!;

  function onExampleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = ROUTE_EXAMPLES.findIndex((item) => item.key === selected);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % ROUTE_EXAMPLES.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + ROUTE_EXAMPLES.length) % ROUTE_EXAMPLES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = ROUTE_EXAMPLES.length - 1;
    if (next === null) return;
    event.preventDefault();
    setSelected(ROUTE_EXAMPLES[next]!.key);
    routeRefs.current[next]?.focus();
  }

  return (
    <MarketingShell>
      <section className="mk-page-hero" aria-labelledby="warm-paths-heading">
        <div className="mk__inner mk-page-hero__layout">
          <div>
            <h1 id="warm-paths-heading">A warm introduction starts with the route, not the request.</h1>
            <p>
              Vitae looks through the relationships you recorded and keeps every person, tie, and
              affiliation visible. You can judge whether an introduction is appropriate before you
              ask someone to make it.
            </p>
            <div className="mk-page-hero__actions">
              <CloudAction className="mk-action mk-action--primary mk-action--lg" />
              <Link className="mk-text-link" to="/guides/ask-for-an-introduction">Read the introduction guide <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div className="mk-page-hero__aside">
            <p>What a warm path keeps visible</p>
            <ul>
              <li><Glyph name="person" size={17} /> People, not anonymous nodes</li>
              <li><Glyph name="link" size={17} /> Connection type and context at every hop</li>
              <li><Glyph name="ask" size={17} /> A human decision before any outreach</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="route-demo-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="route-demo-heading">Read the path as a relationship record.</h2>
            <p>
              This illustrative route uses fictional demo records. In the product, every route is
              limited to links that exist in your own record and can be opened for inspection.
            </p>
          </div>
          <div className="mk-path-demo">
            <div
              className="mk-path-demo__controls"
              role="tablist"
              aria-label="Illustrative warm paths"
              onKeyDown={onExampleKeyDown}
            >
              {ROUTE_EXAMPLES.map((example, index) => (
                <button
                  key={example.key}
                  ref={(node) => { routeRefs.current[index] = node; }}
                  type="button"
                  role="tab"
                  id={`route-tab-${example.key}`}
                  aria-selected={example.key === selected}
                  aria-controls={`route-example-${example.key}`}
                  tabIndex={example.key === selected ? 0 : -1}
                  className={example.key === selected ? 'mk-path-demo__control mk-path-demo__control--active' : 'mk-path-demo__control'}
                  onClick={() => setSelected(example.key)}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <div
              id={`route-example-${route.key}`}
              className="mk-path-demo__route"
              role="tabpanel"
              aria-labelledby={`route-tab-${route.key}`}
              aria-live="polite"
              tabIndex={0}
            >
              <p className="mk-path-demo__destination">Target · {route.destination}</p>
              <ol>
                {route.hops.map((hop, index) => (
                  <li key={`${hop.name}-${hop.meta}`}>
                    <span className="mk-path-demo__node">{hop.name}</span>
                    <span className="mk-path-demo__hop">{hop.meta}</span>
                    {index < route.hops.length - 1 && <span className="mk-path-demo__line" aria-hidden="true" />}
                  </li>
                ))}
              </ol>
              <p className="mk-path-demo__note">{route.note}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="judgment-heading">
        <div className="mk__inner mk-feature-spread">
          <div className="mk-feature-spread__copy">
            <h2 id="judgment-heading">The useful result is not a score. It is better judgment.</h2>
            <p>
              A relationship view collects cadence, interactions, topics, favors, connection facts,
              and the score factors in one dossier. You can review the signal without treating it as an oracle.
            </p>
            <ol className="mk-ledger">
              <li><span>01</span><div><strong>Start from the target</strong><p>Search an organization or a person, then state the conversation you need.</p></div></li>
              <li><span>02</span><div><strong>Inspect every hop</strong><p>See who connects to whom and what context supports the relationship.</p></div></li>
              <li><span>03</span><div><strong>Choose the right ask</strong><p>Decide whether to reconnect, ask for context, make an introduction request, or do nothing yet.</p></div></li>
            </ol>
          </div>
          <ProductFrame
            src="/landing/person.png"
            alt="Vitae person record with relationship strength, cadence, interactions, topics, and favor ledger"
            label="Relationship ledger · factors remain inspectable"
          />
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="limits-heading">
        <div className="mk__inner mk-boundary">
          <div>
            <h2 id="limits-heading">A route is evidence, not entitlement.</h2>
            <p>
              Vitae deliberately does not turn a graph path into an auto-sent request, a social score,
              or a claim that someone owes you access. It gives you the context to make the respectful decision.
            </p>
          </div>
          <ul aria-label="Warm path boundaries">
            <li><strong>Only recorded ties appear</strong><span>Vitae does not invent social connections or scrape an outside network.</span></li>
            <li><strong>Relationships stay legible</strong><span>Each hop carries the person, relationship type, and available context.</span></li>
            <li><strong>The ask remains yours</strong><span>You decide whether a route is timely, appropriate, and worth acting on.</span></li>
          </ul>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="warm-closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="warm-closing-heading">Keep the relationship context before you need the introduction.</h2>
            <p>Start with the people and organizations that already matter to your career.</p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" />
            <Link className="mk-action mk-action--lg" to="/guides/ask-for-an-introduction">Read the introduction guide</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
