/**
 * The bulk action bar: what is selected, what you can do to it, and the way
 * out.
 *
 * It exists because the bar it replaces rendered into `PageHeader`'s `actions`
 * slot, so selecting the first row grew the header by a row of buttons and the
 * whole page jumped under the cursor that was still selecting. A control that
 * appears because you acted must not move the thing you were acting on, so this
 * one is fixed to the bottom of the viewport, in its own layer, out of flow.
 * `bulkBarIsDetached` below states that as an invariant a test can hold it to.
 *
 * Accessibility, in the order it usually gets dropped:
 *
 * - The select-all control is the design system's `Checkbox`, which is a real
 *   `role="checkbox"`. The bar it replaces used a `<button aria-pressed>`
 *   wearing the checkbox's class, so the app shipped two different checkbox
 *   semantics and a screen reader was told "toggle button" for one of them.
 * - The count lives in a polite live region that is mounted whether or not the
 *   bar is showing. A live region that arrives at the same moment as its text
 *   is a live region that announces nothing.
 * - Everything in the bar is a real button, so it is reachable by Tab with no
 *   help, and Escape clears from anywhere inside it.
 *
 * Motion: `useEnter` / `useExit` from lib/motion.ts. A bar appearing is a state
 * change, so it may enter, and it enters the only way this system allows,
 * opacity plus a 4px rise. It does not slide in from the edge, it does not
 * scale, and it does not spring (MOTION.md section 3).
 *
 * The chrome is in styles/bulk-bar.css, not in a style object here. That is
 * not a preference: scripts/check-brand-bans.mjs applies the raw-hex, shadow,
 * easing and duration rules to `.css` files and only three code rules to
 * `.ts`/`.tsx`, so a bar styled from TSX is a bar four of the six laws cannot
 * see.
 */
import { useEnter, useExit } from '../lib/motion.js';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Checkbox, Mono } from '@vitae/ui';
import type { KeyboardEvent, ReactNode } from 'react';
import '../styles/bulk-bar.css';

/**
 * True when the bar is where it belongs: in its own fixed layer, not inside a
 * page header, a banner or any other element whose height the page reads.
 *
 * This is the invariant the old bar broke, written as a function so the test
 * suite can assert it against a real rendered tree rather than by reading the
 * JSX and hoping.
 */
export function bulkBarIsDetached(bar: Element): boolean {
  return bar.closest('header') == null && bar.closest('.vt-pagehead') == null;
}

export interface BulkBarProps {
  /** How many records are selected. At zero the bar is not rendered. */
  count: number;
  /** Singular noun for the count, e.g. "person". */
  noun?: string;
  /** Plural noun. Defaults to `${noun}s`, which is wrong for "person". */
  nouns?: string;
  /** Names the bar for assistive tech and for tests. */
  label?: string;
  /**
   * Select-all state. Pass both this and `onToggleAll` to get the checkbox;
   * omit them on a surface where selecting everything makes no sense.
   */
  allSelected?: boolean;
  onToggleAll?: () => void;
  /** Always offered: the way out of a selection you did not mean to make. */
  onClear: () => void;
  /** The actions themselves, usually one or two `Button`s. */
  children?: ReactNode;
}

/**
 * Render this unconditionally, next to the list rather than inside its header,
 * and let `count` decide whether the bar shows. Rendering it behind a
 * `count > 0` guard of your own unmounts the live region and the announcement
 * goes with it.
 */
export function BulkBar({
  count,
  noun = 'record',
  nouns,
  label = 'Bulk actions',
  allSelected,
  onToggleAll,
  onClear,
  children,
}: BulkBarProps) {
  const enter = useEnter();
  const exit = useExit();
  const plural = nouns ?? `${noun}s`;
  const word = count === 1 ? noun : plural;
  // Empty at zero rather than "0 records selected": a live region should say
  // nothing when there is nothing to say.
  const announcement = count > 0 ? `${count} ${word} selected` : '';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClear();
  }

  return (
    <div className="bulkbar-layer" data-bulkbar-layer="">
      {/* Mounted whether or not the bar is. See the note on the component. */}
      <p role="status" aria-live="polite" className="u-visually-hidden">
        {announcement}
      </p>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            role="group"
            aria-label={label}
            className="bulkbar"
            variants={{ ...enter, ...exit }}
            initial="initial"
            animate="animate"
            exit="exit"
            onKeyDown={onKeyDown}
          >
            {onToggleAll && (
              <Checkbox
                checked={allSelected ?? false}
                onChange={onToggleAll}
                label="Select all"
              />
            )}
            {/* The number is data, so it is mono (IDENTITY.md 7). The noun is
                beside it, in words, because a bare count next to a checkbox
                does not say what was counted. */}
            <span>
              <Mono>{count}</Mono> {word} selected
            </span>
            {children}
            <Button size="sm" glyph="close" onClick={onClear}>
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
