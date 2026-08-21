/**
 * First-run welcome, shown once per browser (localStorage flag) after the
 * first sign-in. Three durable moves, then the in-product setup ledger takes
 * over so onboarding can be resumed from Today instead of trapping the user
 * in a long wizard.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Kbd, Modal } from '@vitae/ui';

export const FIRST_RUN_KEY = 'vitae.v1.welcomed';

export function useFirstRun(): [boolean, () => void] {
  const [open, setOpen] = useState(() => localStorage.getItem(FIRST_RUN_KEY) !== '1');
  return [
    open,
    () => {
      localStorage.setItem(FIRST_RUN_KEY, '1');
      setOpen(false);
    },
  ];
}

const MOVES: Array<{ keys: string[]; title: string; body: string }> = [
  {
    keys: ['⌘', 'K'],
    title: 'Start with the next fact',
    body: 'One line becomes structured records and explicit connections after you review the preview.',
  },
  {
    keys: ['n'],
    title: 'Create any record',
    body: 'Structured forms cover all 34 record types, with provenance and inline connections.',
  },
  {
    keys: ['⌘', 'P'],
    title: 'Find or act',
    body: 'Search every record, open a workspace, or run an action without leaving the keyboard.',
  },
];

export function FirstRun({ onDone }: { onDone: () => void }) {
  return (
    <Modal open onOpenChange={(o) => !o && onDone()} title="Welcome to Vitae" size="sm">
      <div className="flex flex-col gap-4">
        <div className="first-run__intro">
          <span>Private · deterministic · yours</span>
          <p>
            Your life and career become useful one verified connection at a time. These three moves
            are enough to begin.
          </p>
        </div>

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {MOVES.map((m) => (
            <li key={m.title} className="first-run__move">
              <span className="flex min-w-13 flex-none justify-center gap-1 pt-0.5">
                {m.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink-strong">{m.title}</span>
                <span className="block text-sm text-muted">{m.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onDone}>
            Open Today
          </Button>
          <Link to="/tour" onClick={onDone} className="no-underline">
            <Button variant="ghost">Take the tour</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
