/** The public career-move story: capture, connect, decide, move. */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { EDGE_TYPES, NODE_TYPES, SOURCE_TYPES } from '@vitae/core';
import { Glyph } from '@vitae/ui';
import { publicLaunchConfig } from '../../public/site.js';
import { CLOUD_PLAN } from './MarketingContent.js';
import { MarketingShell, ProductFrame } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

export const OPPORTUNITY_STORAGE_KEY = 'vitae:marketing:opportunity-route';

export const OPPORTUNITY_ROUTES = [
  {
    key: 'reach',
    label: 'Reach the right person',
    title: 'Make the next ask with a real route behind it.',
    body: 'Name the organization, inspect the people and ties you recorded, and choose an introduction request that respects the relationship.',
    image: '/landing/person.png',
    imageAlt:
      'Vitae person record showing relationship strength, interaction history, reconnect cadence, and favor ledger',
    imageLabel: 'Relationship ledger · inspect the context before the ask',
    route: '/product/warm-paths',
    routeLabel: 'See how warm paths work',
    evidence: ['Named destination', 'Visible relationship hops', 'A bounded next ask'],
  },
  {
    key: 'evidence',
    label: 'Bring forward the right work',
    title: 'Use the work you can actually stand behind.',
    body: 'Keep achievement evidence connected to the roles, projects, skills, and source context that make a career claim defensible.',
    image: '/landing/form.png',
    imageAlt:
      'Vitae structured person form with sectioned fields and contextual connections',
    imageLabel: 'Structured record · depth when the moment allows',
    route: '/product/career-evidence',
    routeLabel: 'See career evidence',
    evidence: ['Observed contribution', 'Supporting records', 'Target-specific selection'],
  },
  {
    key: 'move',
    label: 'Prepare a deliberate move',
    title: 'Turn career memory into a calm next action.',
    body: 'Bring people, applications, reminders, and career work into one daily view so a promising opportunity does not start from a blank page.',
    image: '/landing/today.png',
    imageAlt:
      'Vitae Today view with reconnect lane, application pipeline, momentum score, and habits',
    imageLabel: 'Today · a daily operating view for the career record',
    route: '/how-it-works',
    routeLabel: 'Walk through the workflow',
    evidence: ['A concrete target', 'A connected record', 'One useful next action'],
  },
] as const;

export type OpportunityRouteKey = (typeof OPPORTUNITY_ROUTES)[number]['key'];

/** Product facts derive from shared vocabulary so public copy cannot drift. */
export const LANDING_FACTS: Array<{ num: string; label: string }> = [
  { num: String(NODE_TYPES.length), label: 'structured record types' },
  { num: String(EDGE_TYPES.length), label: 'explicit connection kinds' },
  { num: String(SOURCE_TYPES.length), label: 'provenance sources' },
  { num: '0', label: 'runtime AI calls' },
];

export function opportunityRouteFor(value: string | null | undefined): OpportunityRouteKey | null {
  return OPPORTUNITY_ROUTES.some((route) => route.key === value)
    ? (value as OpportunityRouteKey)
    : null;
}

function rememberedOpportunityRoute(): OpportunityRouteKey | null {
  if (typeof window === 'undefined') return null;
  try {
    return opportunityRouteFor(window.localStorage.getItem(OPPORTUNITY_STORAGE_KEY));
  } catch {
    return null;
  }
}

function OpportunityRoutePanel() {
  const [activeKey, setActiveKey] = useState<OpportunityRouteKey>(
    () => rememberedOpportunityRoute() ?? 'reach',
  );
  const [restoredChoice] = useState(() => rememberedOpportunityRoute() !== null);
  const routeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = OPPORTUNITY_ROUTES.findIndex((route) => route.key === activeKey);
  const active = OPPORTUNITY_ROUTES[activeIndex]!;

  function chooseRoute(key: OpportunityRouteKey) {
    setActiveKey(key);
    try {
      window.localStorage.setItem(OPPORTUNITY_STORAGE_KEY, key);
    } catch {
      // Selection remains useful when storage is disabled or unavailable.
    }
  }

  function onRouteKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = OPPORTUNITY_ROUTES.findIndex((route) => route.key === activeKey);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % OPPORTUNITY_ROUTES.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + OPPORTUNITY_ROUTES.length) % OPPORTUNITY_ROUTES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = OPPORTUNITY_ROUTES.length - 1;
    if (next === null) return;
    event.preventDefault();
    chooseRoute(OPPORTUNITY_ROUTES[next]!.key);
    routeRefs.current[next]?.focus();
  }

  return (
    <section className="mk-route" aria-labelledby="opportunity-route-heading">
      <div className="mk-route__head">
        <h2 id="opportunity-route-heading">Choose the pressure you are under.</h2>
        <p>
          Vitae starts from the career question in front of you, then traces back to the records
          that can make the answer useful.
        </p>
      </div>
      <div
        className="mk-route__chooser"
        role="tablist"
        aria-label="Career opportunity"
        onKeyDown={onRouteKeyDown}
      >
        {OPPORTUNITY_ROUTES.map((route, index) => (
          <button
            key={route.key}
            ref={(node) => { routeRefs.current[index] = node; }}
            id={`opportunity-tab-${route.key}`}
            className={`mk-route__choice${route.key === activeKey ? ' mk-route__choice--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={route.key === activeKey}
            aria-controls={`opportunity-panel-${route.key}`}
            tabIndex={route.key === activeKey ? 0 : -1}
            onClick={() => chooseRoute(route.key)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {route.label}
          </button>
        ))}
      </div>
      <div
        id={`opportunity-panel-${active.key}`}
        className="mk-route__panel"
        role="tabpanel"
        aria-labelledby={`opportunity-tab-${active.key}`}
        tabIndex={0}
      >
        <div className="mk-route__copy">
          <p className="mk-route__status" role="status">
            {restoredChoice ? `Continuing: ${active.label}` : `Selected: ${active.label}`}
          </p>
          <h3>{active.title}</h3>
          <p>{active.body}</p>
          <ol className="mk-route__evidence" aria-label={`${active.label} evidence trail`}>
            {active.evidence.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item}
              </li>
            ))}
          </ol>
          <Link className="mk-text-link" to={active.route}>
            {active.routeLabel} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ProductFrame
          src={active.image}
          alt={active.imageAlt}
          label={active.imageLabel}
          eager
        />
      </div>
    </section>
  );
}

function RouteTrace() {
  return (
    <ol className="mk-trace" aria-label="Vitae opportunity route">
      <li>
        <span>01</span>
        <strong>Capture</strong>
        <p>Save the person, work, or moment while it is still specific.</p>
      </li>
      <li>
        <span>02</span>
        <strong>Connect</strong>
        <p>Keep the relationship, source, and supporting records adjacent.</p>
      </li>
      <li>
        <span>03</span>
        <strong>Decide</strong>
        <p>Inspect the route or evidence before taking the next step.</p>
      </li>
      <li>
        <span>04</span>
        <strong>Move</strong>
        <p>Make an ask, tailor an output, or set the next action.</p>
      </li>
    </ol>
  );
}

export function Landing() {
  const cloudEnabled = publicLaunchConfig.cloudEnabled;

  return (
    <MarketingShell>
      <section className="mk-hero mk-hero--route" aria-labelledby="landing-heading">
        <div className="mk__inner">
          <div className="mk-hero__layout">
            <div className="mk-hero__copy">
              <h1 id="landing-heading">
                When the right role arrives, your career should already be in order.
              </h1>
              <p className="mk-hero__sub">
                Vitae connects the people, work, and evidence behind your next move, so a warm
                introduction, credible résumé, or important conversation starts with a record you
                can inspect.
              </p>
              <div className="mk-hero__ctas">
                <CloudAction className="mk-action mk-action--primary mk-action--lg" />
                <Link className="mk-action mk-action--lg" to="/how-it-works">
                  See how Vitae works
                </Link>
              </div>
              <p className="mk-hero__quiet-note">
                For a private career record. No ads. No runtime AI guessing.
              </p>
            </div>
            <OpportunityRoutePanel />
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--trace" aria-labelledby="trace-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="trace-heading">A twenty-minute opportunity should not require a career archaeology project.</h2>
            <p>
              Vitae is built for the moment a role, referral, or serious conversation appears. It
              gives that moment a trace back through the work and relationships you already know.
            </p>
          </div>
          <RouteTrace />
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="record-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="record-heading">The career record comes before the career output.</h2>
            <p>
              Capture quickly when context is fresh. Add depth later with structured fields,
              explicit connections, sources, revisions, and a visible reason for every conclusion.
            </p>
          </div>
          <div className="mk-compare">
            <div className="mk-compare__copy">
              <div className="mk-command" aria-label="Example quick capture">
                {/* The line overflows on a narrow viewport, which makes it a
                    scrollable region. Without a tab stop a keyboard user cannot
                    reach the rest of it (axe scrollable-region-focusable,
                    WCAG 2.1 A). */}
                <code tabIndex={0}>p Lina Farouk @@DevFest #ml &gt; met at the speaker dinner</code>
                <span>Capture → inspect → save</span>
              </div>
              <ol className="mk-ledger" aria-label="What the capture preserves">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Record the fact</strong>
                    <p>A person, organization, project, event, or other typed record begins as a clear claim.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Keep the context</strong>
                    <p>Tags, source, note, date, and connections remain visible instead of dissolving into a note pile.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Reuse it when it matters</strong>
                    <p>The same records power relationship intelligence, career evidence, daily planning, and exports.</p>
                  </div>
                </li>
              </ol>
            </div>
            <ProductFrame
              src="/landing/capture.png"
              alt="Vitae command capture parsing a person, organization, tag, and note before save"
              label="Capture · parsed before save"
            />
          </div>
          <dl className="mk-facts" aria-label="Vitae product facts">
            {LANDING_FACTS.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.num}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="outcomes-heading">
        <div className="mk__inner mk-outcomes-layout">
          <div className="mk-section__intro mk-section__intro--sticky">
            <h2 id="outcomes-heading">What becomes easier when the evidence remains connected.</h2>
            <p>
              Vitae does not try to manufacture a professional identity. It helps you retrieve,
              assess, and use the history you can defend.
            </p>
          </div>
          <div className="mk-outcome-ledger">
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true">
                <Glyph name="ask" size={19} />
              </span>
              <div>
                <p>RELATIONSHIP INTELLIGENCE</p>
                <h3>See the human route before you ask.</h3>
                <span>
                  Warm paths expose the recorded people and connection types behind a possible
                  introduction. A path is inspectable context, never an automatic recommendation.
                </span>
                <Link to="/product/warm-paths">Explore warm paths <span aria-hidden="true">→</span></Link>
              </div>
            </article>
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true">
                <Glyph name="resume" size={19} />
              </span>
              <div>
                <p>CAREER EVIDENCE</p>
                <h3>Tailor from claims you can trace.</h3>
                <span>
                  Match a target to reviewed achievement atoms, keep the selection visible, and
                  compile an ATS-safe PDF from your own evidence.
                </span>
                <Link to="/product/career-evidence">Explore career evidence <span aria-hidden="true">→</span></Link>
              </div>
            </article>
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true">
                <Glyph name="export" size={19} />
              </span>
              <div>
                <p>OWNERSHIP</p>
                <h3>Leave with the record, not a dead export.</h3>
                <span>
                  Export identity-preserving JSONL, an Obsidian-compatible Markdown vault, and a
                  checksum manifest whenever you need a copy outside Vitae.
                </span>
                <Link to="/security-and-ownership">See ownership details <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--pricing-bridge" aria-labelledby="pricing-bridge-heading">
        <div className="mk__inner mk-pricing-bridge">
          <div>
            <h2 id="pricing-bridge-heading">One private workspace. The full career system.</h2>
            <p>
              {CLOUD_PLAN.name} is designed for one person who wants the relationship context,
              career evidence, and export path in the same place.
            </p>
          </div>
          <div className="mk-pricing-bridge__plan">
            <p>{cloudEnabled ? CLOUD_PLAN.trial : 'Planned launch price · Cloud is not open yet'}</p>
            <strong>{CLOUD_PLAN.monthly.price}<small>{CLOUD_PLAN.monthly.suffix}</small></strong>
            <Link className="mk-action mk-action--primary" to="/pricing">
              {cloudEnabled ? 'See pricing and trial terms' : 'See planned pricing'}
            </Link>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--faq" aria-labelledby="questions-heading">
        <div className="mk__inner mk-faq-layout">
          <div className="mk-section__intro">
            <h2 id="questions-heading">The questions that should be answered before you trust a career system.</h2>
          </div>
          <div className="mk-faq">
            <details>
              <summary>Does Vitae invent résumé claims or outreach messages?</summary>
              <p>
                No. Vitae uses deterministic parsing, scoring, and compilation. It helps you select
                and inspect your own evidence; it does not send your graph to a runtime AI provider
                or invent career history for you.
              </p>
            </details>
            <details>
              <summary>Can I see why a warm path or score appeared?</summary>
              <p>
                Yes. Relationship and introduction views keep the records, connection types, and
                factors visible. The result is evidence to judge, not an opaque instruction.
              </p>
            </details>
            <details>
              <summary>Can I leave with my records?</summary>
              <p>
                Yes. Full exports include JSONL collections, a Markdown vault, and a checksum
                manifest. Saved views can also leave as CSV.
              </p>
            </details>
            <details>
              <summary>Is Vitae for a team, recruiter, or social network?</summary>
              <p>
                No. Vitae Cloud Individual is for one career-minded person maintaining a private
                professional record. It is deliberately not a team CRM, recruiting system, or social feed.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="closing-heading">Keep the next career conversation from starting at zero.</h2>
            <p>Begin with the person, project, or opportunity already on your mind.</p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" />
            <Link className="mk-action mk-action--lg" to="/guides/first-career-record">
              Read the first-record guide
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
