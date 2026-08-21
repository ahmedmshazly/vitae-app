/**
 * Getting-started checklist: concrete, deep-linked setup steps driven by real
 * state from the dashboard aggregate. Auto-hides once complete; dismissible.
 *
 * It sits above Today's agenda as a quieter bordered panel with one progress
 * rule, not a second hero.
 */
import { Link } from 'react-router-dom';
import { Glyph, Mono } from '@vitae/ui';

export interface SetupState {
  self: boolean;
  github: boolean;
  people: boolean;
  interactions: boolean;
  atoms: boolean;
  resume: boolean;
  done: number;
  total: number;
}

const DISMISS_KEY = 'vitae.v1.gettingStartedDismissed';

const STEPS: Array<{ key: keyof SetupState; label: string; hint: string; to: string }> = [
  {
    key: 'self',
    label: 'Set up your profile',
    hint: 'Your “self” record anchors everything.',
    to: '/settings/profile',
  },
  {
    key: 'people',
    label: 'Add someone you know',
    hint: 'People power relationship context and reconnect nudges.',
    to: '/network/people',
  },
  {
    key: 'interactions',
    label: 'Log an interaction',
    hint: 'Log a chat, coffee, or call to update cadence.',
    to: '/network/people',
  },
  {
    key: 'github',
    label: 'Connect GitHub',
    hint: 'Sync repositories as evidence; languages become skills.',
    to: '/data/sources/github',
  },
  {
    key: 'atoms',
    label: 'Add résumé evidence',
    hint: 'Reusable achievement statements for the résumé engine.',
    to: '/career/resume/evidence',
  },
  {
    key: 'resume',
    label: 'Build a résumé',
    hint: 'Turn a job description into a tailored one-pager.',
    to: '/career/resume/tailor',
  },
];

export function useGettingStartedDismissed(): [boolean, () => void] {
  const dismissed =
    typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1';
  return [dismissed, () => localStorage.setItem(DISMISS_KEY, '1')];
}

export function GettingStarted({ setup, onDismiss }: { setup: SetupState; onDismiss: () => void }) {
  const pct = Math.round((setup.done / setup.total) * 100);
  return (
    <section className="mb-8 rounded border border-hairline bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="u-display text-md text-ink-strong">
          Getting started{' '}
          <Mono className="text-xs text-faint">
            {setup.done}/{setup.total}
          </Mono>
        </h2>
        <button
          type="button"
          className="border-0 bg-transparent text-xs text-faint hover:text-muted"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>

      <div
        className="mb-4 h-1 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${setup.done} of ${setup.total} steps done`}
      >
        <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>

      <ul className="grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
        {STEPS.map((s) => {
          const done = Boolean(setup[s.key]);
          return (
            <li key={s.key}>
              <Link
                to={s.to}
                className="flex min-h-9 items-center gap-3 rounded-sm px-3 py-2 text-ink-soft no-underline hover:bg-raised"
              >
                {/* Done is a glyph and a line-through, not a colour on its own. */}
                <span
                  className={[
                    'flex size-5 flex-none items-center justify-center rounded-full border',
                    done ? 'border-success text-success' : 'border-strong text-faint',
                  ].join(' ')}
                  aria-hidden
                >
                  {done ? (
                    <Glyph name="check" size={13} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={done ? 'block text-muted line-through' : 'block text-ink-strong'}
                  >
                    {s.label}
                  </span>
                  {!done && <span className="block text-xs text-muted">{s.hint}</span>}
                </span>
                <span className="sr-only">{done ? 'done' : 'not done'}</span>
                {!done && <Glyph name="chevron-down" size={14} className="-rotate-90 text-faint" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
