/**
 * The guided tour: five stops through the product, keyboard-navigable
 * (←/→), with real screenshots in app frames and a quiet progress bar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@vitae/ui';
import { MkFoot, MkNav } from './Chrome.js';

export const TOUR_STOPS = [
  {
    key: '01 · CAPTURE',
    title: 'Capture anything in one line',
    img: '/landing/capture.png',
    alt: 'The ⌘K capture bar parsing a one-line entry into connected records',
    body: 'Press ⌘K anywhere and type. "p Lina Farouk @@DevFest #ml > met at the speaker dinner" files the person, links the event, tags the topic, and keeps the story: one keystroke, four connected records. Leading keys cover people, orgs, tasks, ideas, journals, events, interactions, media, links, skills, goals, and habits.',
  },
  {
    key: '02 · TODAY',
    title: 'A day with momentum',
    img: '/landing/today.png',
    alt: 'The Today agenda with momentum score, reconnect lane, pipeline and habits',
    body: 'Today opens with a momentum score: a transparent 0-100 read from habits done, relationships tended, and reminders cleared, with a hint naming your next action. Below it: the people going quiet, your application pipeline, and habits with day streaks.',
  },
  {
    key: '03 · PEOPLE',
    title: 'Relationships with instrumentation',
    img: '/landing/person.png',
    alt: 'A person profile showing relationship strength, cadence, topics and the favor ledger',
    body: 'Every connection carries closeness, a reconnect cadence, topics, and a favor ledger. Strength is computed and decomposable: you can see why someone ranks where they do, and edit the relationship itself rather than only notes about it.',
  },
  {
    key: '04 · GRAPH',
    title: 'The shape of your life',
    img: '/landing/graph.png',
    alt: 'The force-directed life map over the whole network of records',
    body: 'Everything you capture joins one force-directed life map. Drag, zoom, hover to light a neighborhood, click for a peek panel, expand from any record. The same network powers the timeline and map views.',
  },
  {
    key: '05 · DEPTH',
    title: 'Forms when you want depth',
    img: '/landing/form.png',
    alt: 'A structured record form with sections, validation and inline connections',
    body: 'All 28 record types have designed forms: sectioned, validated, with inline connection editors. Use the grammar to capture in the moment; use the forms to enrich later.',
  },
] as const;

const PANEL_ID = 'tour-panel';

export function Tour() {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  const stop = TOUR_STOPS[i]!;

  const go = useCallback((next: number) => {
    setI(Math.max(0, Math.min(TOUR_STOPS.length - 1, next)));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, i]);

  return (
    <div className="mk">
      <MkNav />
      <section className="mk-tour" aria-labelledby="tour-heading">
        <div className="mk__inner">
          <div className="mk-section__kicker">The tour</div>
          <h1 id="tour-heading" className="mk-section__title">
            Five stops, two minutes.
          </h1>
          <p className="mk-section__lede">
            Use <strong>←</strong> and <strong>→</strong> or pick a stop. Everything you see is the
            real product on demo data.
          </p>

          <div className="mk-tour__layout">
            <div
              className="mk-tour__rail"
              role="tablist"
              aria-label="Tour stops"
              aria-orientation="vertical"
            >
              {TOUR_STOPS.map((s, idx) => (
                <button
                  key={s.key}
                  id={`tour-tab-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={idx === i}
                  aria-controls={PANEL_ID}
                  tabIndex={idx === i ? 0 : -1}
                  className={`mk-tour__stop${idx === i ? ' mk-tour__stop--on' : ''}`}
                  onClick={() => go(idx)}
                >
                  <span className="mk-tour__stopkey">{s.key}</span>
                  {s.title}
                </button>
              ))}
            </div>

            <div>
              <div id={PANEL_ID} role="tabpanel" aria-labelledby={`tour-tab-${i}`}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={stop.key}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <figure className="mk-frame" style={{ margin: 0 }}>
                      <div className="mk-frame__bar" aria-hidden>
                        <span className="mk-frame__dot" />
                        <span className="mk-frame__dot" />
                        <span className="mk-frame__dot" />
                        <span className="mk-frame__url">vitae · {stop.key.toLowerCase()}</span>
                      </div>
                      <img src={stop.img} alt={stop.alt} />
                    </figure>
                    <div className="mk-tour__caption">
                      <div>
                        <div className="mk-tour__captiontitle">{stop.title}</div>
                        <p className="mk-tour__captionbody">{stop.body}</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mk-tour__nav">
                <Button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous stop">
                  ← Previous
                </Button>
                {i < TOUR_STOPS.length - 1 ? (
                  <Button variant="primary" onClick={() => go(i + 1)} aria-label="Next stop">
                    Next stop →
                  </Button>
                ) : (
                  <Link to="/signin">
                    <Button variant="primary">Get started →</Button>
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
                  style={{ width: `${((i + 1) / TOUR_STOPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      <MkFoot />
    </div>
  );
}
