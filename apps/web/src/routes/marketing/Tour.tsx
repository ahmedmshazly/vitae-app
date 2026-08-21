/** A five-stop, keyboard-operable walkthrough using real product captures. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NODE_TYPES } from '@vitae/core';
import { Button } from '@vitae/ui';
import { MkFoot, MkNav, ProductFrame } from './Chrome.js';

const QUIET_EASE = [0.32, 0.72, 0, 1] as const;

export const TOUR_STOPS = [
  {
    key: '01 · CAPTURE',
    title: 'Capture anything in one line',
    img: '/landing/capture.png',
    alt: 'The command capture bar parsing a person, organization, tag, and note',
    body: 'Press ⌘K anywhere and type. “p Lina Farouk @@DevFest #ml > met at the speaker dinner” previews a person record, an organization connection, a tag, and a note before save. Leading keys cover people, organizations, tasks, ideas, journals, events, interactions, media, links, skills, goals, and habits.',
  },
  {
    key: '02 · TODAY',
    title: 'A day with momentum',
    img: '/landing/today.png',
    alt: 'The Today agenda with momentum score, reconnect lane, pipeline and habits',
    body: 'Today opens with a momentum score: a transparent 0–100 reading from habits completed, relationships tended, and reminders cleared, with a hint naming the next action. The same view gathers people going quiet, the application pipeline, and daily habits.',
  },
  {
    key: '03 · PEOPLE',
    title: 'Relationships with instrumentation',
    img: '/landing/person.png',
    alt: 'A person profile showing relationship strength, cadence, interactions, and favor ledger',
    body: 'Every relationship can carry closeness, reconnect cadence, topics, and a favor ledger. Strength is computed and decomposable: inspect why someone ranks where they do, then edit the relationship itself rather than only notes about it.',
  },
  {
    key: '04 · GRAPH',
    title: 'The shape of your life',
    img: '/landing/graph.png',
    alt: 'The force-directed life map over the connected network of records',
    body: 'Everything you capture joins one force-directed life map. Drag, zoom, inspect a neighborhood, click for a peek panel, and expand from any record. Timeline and map views read from the same network.',
  },
  {
    key: '05 · DEPTH',
    title: 'Forms when you want depth',
    img: '/landing/form.png',
    alt: 'A structured record form with sections, validation, and contextual fields',
    body: `All ${NODE_TYPES.length} record types have structured forms with sections, validation, and inline connection editors. Use the grammar to capture in the moment; use forms to add depth later.`,
  },
] as const;

export function adjacentTourImages(index: number): string[] {
  return [index - 1, index + 1]
    .filter((candidate) => candidate >= 0 && candidate < TOUR_STOPS.length)
    .map((candidate) => TOUR_STOPS[candidate]!.img);
}

export function Tour() {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stop = TOUR_STOPS[i]!;

  const go = useCallback((next: number) => {
    setI(Math.max(0, Math.min(TOUR_STOPS.length - 1, next)));
  }, []);

  useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const src of adjacentTourImages(i)) {
      const preload = new Image();
      preload.src = src;
    }
  }, [i]);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (i + 1) % TOUR_STOPS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (i - 1 + TOUR_STOPS.length) % TOUR_STOPS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = TOUR_STOPS.length - 1;
    }

    if (next === null) return;
    event.preventDefault();
    go(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mk">
      <MkNav />
      <main>
        <section className="mk-tour" aria-labelledby="tour-heading">
          <div className="mk__inner">
            <header className="mk-tour__intro">
              <h1 id="tour-heading" className="mk-section__title">
                Five stops, two minutes.
              </h1>
              <p className="mk-section__lede">
                Walk the full capture-to-output loop. Every frame below is the running interface on
                fictional demo records.
              </p>
              <p className="mk-tour__keyhint">
                In the stop list, use <KbdLabel>←</KbdLabel> <KbdLabel>→</KbdLabel>{' '}
                <KbdLabel>↑</KbdLabel> <KbdLabel>↓</KbdLabel>, <KbdLabel>Home</KbdLabel>, or{' '}
                <KbdLabel>End</KbdLabel>.
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
                {TOUR_STOPS.map((item, idx) => (
                  <button
                    key={item.key}
                    ref={(node) => {
                      tabRefs.current[idx] = node;
                    }}
                    id={`tour-tab-${idx}`}
                    type="button"
                    role="tab"
                    aria-selected={idx === i}
                    aria-controls={`tour-panel-${idx}`}
                    tabIndex={idx === i ? 0 : -1}
                    className={`mk-tour__stop${idx === i ? ' mk-tour__stop--on' : ''}`}
                    onClick={() => go(idx)}
                  >
                    <span className="mk-tour__stopkey">{item.key}</span>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>

              <div className="mk-tour__stage">
                <div
                  id={`tour-panel-${i}`}
                  role="tabpanel"
                  aria-labelledby={`tour-tab-${i}`}
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
                          : { opacity: 0, transition: { duration: 0.09, ease: 'linear' } }
                      }
                      transition={{ duration: reduced ? 0 : 0.13, ease: QUIET_EASE }}
                    >
                      <ProductFrame
                        src={stop.img}
                        alt={stop.alt}
                        label={`${stop.key} · ${stop.title}`}
                        eager
                      />
                      <div className="mk-tour__caption">
                        <p className="mk-tour__position" aria-live="polite">
                          Stop {i + 1} of {TOUR_STOPS.length}
                        </p>
                        <div>
                          <h2 className="mk-tour__captiontitle">{stop.title}</h2>
                          <p className="mk-tour__captionbody">{stop.body}</p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="mk-tour__controls">
                  <div className="mk-tour__nav">
                    <Button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous stop">
                      ← Previous
                    </Button>
                    {i < TOUR_STOPS.length - 1 ? (
                      <Button variant="primary" onClick={() => go(i + 1)} aria-label="Next stop">
                        Next stop →
                      </Button>
                    ) : (
                      <Link className="mk-action mk-action--primary" to="/signin">
                        Get started →
                      </Link>
                    )}
                  </div>
                  <div
                    className="mk-tour__progress"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={TOUR_STOPS.length}
                    aria-valuenow={i + 1}
                    aria-label={`Stop ${i + 1} of ${TOUR_STOPS.length}`}
                  >
                    <div
                      className="mk-tour__progressfill"
                      style={{ transform: `scaleX(${(i + 1) / TOUR_STOPS.length})` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MkFoot />
    </div>
  );
}

function KbdLabel({ children }: { children: string }) {
  return <kbd className="vt-kbd">{children}</kbd>;
}
