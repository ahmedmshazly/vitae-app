/** A keyboard-operable tour of the capture-to-career loop. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@vitae/ui';
import { MarketingShell, ProductFrame } from './Chrome.js';
import { CloudAction } from './CloudAction.js';
// The curve and the enter duration come from the motion system rather than
// being retyped here: this file used to hold its own copy of the control
// points, which then had to be found and changed by hand when the identity's
// easing did.
import { DUR, DUR_FAST, EASE } from '../../lib/motion.js';

type FrameStop = {
  key: string;
  title: string;
  body: string;
  kind: 'frame';
  img: string;
  alt: string;
  label: string;
};

type LedgerStop = {
  key: string;
  title: string;
  body: string;
  kind: 'ledger';
  rows: readonly { label: string; detail: string }[];
  note: string;
};

export const TOUR_STOPS: readonly (FrameStop | LedgerStop)[] = [
  {
    key: '01 · CAPTURE',
    title: 'Capture the detail before it goes vague',
    body: 'Quick capture parses a short line into an inspectable plan before anything is saved. Structured forms remain available when the moment calls for depth.',
    kind: 'frame',
    img: '/landing/capture.png',
    alt: 'Vitae command capture parsing a person, organization, tag, and note before save',
    label: 'Capture · parsed before save',
  },
  {
    key: '02 · RECORD',
    title: 'Give the record enough context to be useful later',
    body: 'People, work, roles, sources, dates, and connections have structured fields. The quick path and detailed path write to the same career record.',
    kind: 'frame',
    img: '/landing/form.png',
    alt: 'Vitae structured record form with sections, validation, and contextual fields',
    label: 'Structured form · progressive depth',
  },
  {
    key: '03 · CONNECT',
    title: 'See the record through its relationships',
    body: 'Graph, timeline, map, person, organization, and career views are lenses over the same typed network. The graph is not a second copy of your history.',
    kind: 'frame',
    img: '/landing/graph.png',
    alt: 'Vitae graph view connecting people, work, skills, and events',
    label: 'Graph · an inspectable network view',
  },
  {
    key: '04 · DECIDE',
    title: 'Read a warm route before you make an ask',
    body: 'Relationship intelligence works from recorded ties and keeps each person, connection type, and affiliation legible. The path is context for your judgment, not an automatic recommendation.',
    kind: 'ledger',
    rows: [
      { label: 'Target', detail: 'Nile Robotics · Perception' },
      { label: 'Path', detail: 'Jordan Kim → Lina Farouk → Karim Nabil → Nile Robotics' },
      {
        label: 'Context',
        detail:
          'Relationship type, cadence, relevant topics, and affiliation remain available to inspect.',
      },
    ],
    note: 'Illustrative route · fictional demo records',
  },
  {
    key: '05 · EVIDENCE',
    title: 'Bring forward the work you can defend',
    body: 'Achievement atoms stay connected to the work, role, skills, sources, and outcome behind them. A target role can surface relevant evidence without rewriting your history.',
    kind: 'ledger',
    rows: [
      { label: 'Work', detail: 'Role, project, artifact, or interaction anchors the claim.' },
      {
        label: 'Evidence',
        detail: 'Contribution, outcome, source, and related records stay beside it.',
      },
      {
        label: 'Target',
        detail: 'The role signal informs a visible selection you can review and change.',
      },
    ],
    note: 'Career evidence workflow · no generated career claims',
  },
  {
    key: '06 · MOVE',
    title: 'Return to the next useful action',
    body: 'Today gathers reconnect work, the application pipeline, habits, and reminders so the career record stays useful between major opportunities.',
    kind: 'frame',
    img: '/landing/today.png',
    alt: 'Vitae Today view with momentum score, reconnect lane, application pipeline, and habits',
    label: 'Today · the daily operating view',
  },
  {
    key: '07 · KEEP',
    title: 'Keep the output and the exit path',
    body: 'A tailored output remains linked to its target and evidence. When you need a copy outside Vitae, full export produces JSONL collections, a Markdown vault, and checksums.',
    kind: 'ledger',
    rows: [
      {
        label: 'Output',
        detail: 'A reviewed target and ATS-safe PDF stay connected to the career record.',
      },
      { label: 'Archive', detail: 'JSONL collections preserve record identity and relationships.' },
      {
        label: 'Readable copy',
        detail: 'A Markdown vault and checksum manifest make the export usable outside Vitae.',
      },
    ],
    note: 'Export is a product capability, not an upgrade tier',
  },
] as const;

export function adjacentTourImages(index: number): string[] {
  return [index - 1, index + 1]
    .filter((candidate) => candidate >= 0 && candidate < TOUR_STOPS.length)
    .flatMap((candidate) => {
      const stop = TOUR_STOPS[candidate]!;
      return stop.kind === 'frame' ? [stop.img] : [];
    });
}

function LedgerStage({ stop }: { stop: LedgerStop }) {
  return (
    <section className="mk-tour-ledger" aria-label={`${stop.title} detail`}>
      <p>{stop.note}</p>
      <dl>
        {stop.rows.map((row, index) => (
          <div key={row.label}>
            <dt>
              {String(index + 1).padStart(2, '0')} · {row.label}
            </dt>
            <dd>{row.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Tour() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stop = TOUR_STOPS[index]!;

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(TOUR_STOPS.length - 1, next)));
  }, []);

  useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const src of adjacentTourImages(index)) {
      const preload = new Image();
      preload.src = src;
    }
  }, [index]);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % TOUR_STOPS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + TOUR_STOPS.length) % TOUR_STOPS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TOUR_STOPS.length - 1;
    if (next === null) return;
    event.preventDefault();
    go(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <MarketingShell mainClassName="mk-tour-page">
      <section className="mk-tour" aria-labelledby="tour-heading">
        <div className="mk__inner">
          <header className="mk-tour__intro">
            <h1 id="tour-heading">Seven stops from a fresh detail to a career move.</h1>
            <p>
              Every product frame below is the running interface on fictional demo data. Workflow
              ledgers describe the actual product behavior without pretending to be a screenshot.
            </p>
            <p className="mk-tour__keyhint">
              In the stop list, use <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>,{' '}
              <kbd>Home</kbd>, or <kbd>End</kbd>.
            </p>
          </header>

          <div className="mk-tour__layout">
            <div
              className="mk-tour__rail"
              role="tablist"
              aria-label="Tour stops"
              aria-orientation="vertical"
              onKeyDown={onTabKeyDown}
            >
              {TOUR_STOPS.map((item, itemIndex) => (
                <button
                  key={item.key}
                  ref={(node) => {
                    tabRefs.current[itemIndex] = node;
                  }}
                  id={`tour-tab-${itemIndex}`}
                  type="button"
                  role="tab"
                  aria-selected={itemIndex === index}
                  aria-controls={`tour-panel-${itemIndex}`}
                  tabIndex={itemIndex === index ? 0 : -1}
                  className={`mk-tour__stop${itemIndex === index ? ' mk-tour__stop--on' : ''}`}
                  onClick={() => go(itemIndex)}
                >
                  <span className="mk-tour__stopkey">{item.key}</span>
                  <span>{item.title}</span>
                </button>
              ))}
            </div>

            <div className="mk-tour__stage">
              <div
                id={`tour-panel-${index}`}
                role="tabpanel"
                aria-labelledby={`tour-tab-${index}`}
                tabIndex={0}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={stop.key}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      reduced
                        ? undefined
                        : { opacity: 0, transition: { duration: DUR_FAST, ease: 'linear' } }
                    }
                    transition={{ duration: reduced ? 0 : DUR, ease: EASE }}
                  >
                    {stop.kind === 'frame' ? (
                      <ProductFrame src={stop.img} alt={stop.alt} label={stop.label} eager />
                    ) : (
                      <LedgerStage stop={stop} />
                    )}
                    <div className="mk-tour__caption">
                      <p className="mk-tour__position" aria-live="polite">
                        Stop {index + 1} of {TOUR_STOPS.length}
                      </p>
                      <div>
                        <h2>{stop.title}</h2>
                        <p>{stop.body}</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mk-tour__controls">
                <div className="mk-tour__nav">
                  <Button onClick={() => go(index - 1)} disabled={index === 0}>
                    ← Previous
                  </Button>
                  {index < TOUR_STOPS.length - 1 ? (
                    <Button variant="primary" onClick={() => go(index + 1)}>
                      Next stop →
                    </Button>
                  ) : (
                    <CloudAction className="mk-action mk-action--primary" />
                  )}
                </div>
                <div
                  className="mk-tour__progress"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={TOUR_STOPS.length}
                  aria-valuenow={index + 1}
                  aria-label={`Stop ${index + 1} of ${TOUR_STOPS.length}`}
                >
                  <div
                    className="mk-tour__progressfill"
                    style={{ transform: `scaleX(${(index + 1) / TOUR_STOPS.length})` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
