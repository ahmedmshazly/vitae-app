/**
 * First-run welcome, shown once per browser (localStorage flag) after the
 * first sign-in. Three keyboard moves, then out of the way.
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
    title: 'Capture anything',
    body: 'One line files people, events, topics and the story as connected records.',
  },
  {
    keys: ['n'],
    title: 'Create any record',
    body: 'Structured forms for all 28 types, with inline connections.',
  },
  {
    keys: ['⌘', 'P'],
    title: 'Jump anywhere',
    body: 'Fuzzy-search every record and open it from the keyboard.',
  },
];

export function FirstRun({ onDone }: { onDone: () => void }) {
  return (
    <Modal open onOpenChange={(o) => !o && onDone()} title="Welcome to Vitae" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">Your life, as a living network. Three keyboard moves:</p>

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {MOVES.map((m) => (
            <li key={m.title} className="flex items-start gap-3 rounded-sm border border-hairline p-3">
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
            Start exploring
          </Button>
          <Link to="/tour" onClick={onDone} className="no-underline">
            <Button variant="ghost">Take the tour</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
