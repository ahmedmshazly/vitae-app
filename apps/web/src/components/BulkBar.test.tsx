/**
 * Two of these tests are the whole reason the component exists: the bar is not
 * inside a page header, so selecting a row cannot reflow the page, and the
 * select-all control is a real checkbox rather than a button wearing a
 * checkbox's class.
 *
 * AnimatePresence is a passthrough here, as in Toast.test.tsx: it holds an
 * exiting child mounted on rAF timing that does not resolve deterministically
 * under jsdom, and Framer's animation engine is not what these tests are for.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ReactNode } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MotionReact from 'motion/react';
import { Button, PageHeader } from '@vitae/ui';
import { runAxe } from '../test/a11y.js';
import { renderWithApp } from '../test/render.js';
import { BulkBar, bulkBarIsDetached } from './BulkBar.js';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

function bar() {
  return screen.getByRole('group', { name: 'Bulk actions' });
}

/** The chrome under test. Vitest stubs a CSS import, so the rules the
 * component relies on have to be put into the document by hand before the
 * cascade can be asked anything. */
// Built with join rather than `new URL(literal, import.meta.url)`, which Vite
// rewrites into an asset URL that readFileSync cannot open.
const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = readFileSync(join(HERE, '../styles/bulk-bar.css'), 'utf8');
const TOKENS = readFileSync(join(HERE, '../../../../packages/ui/src/styles/tokens.css'), 'utf8');

function loadChrome() {
  const style = document.createElement('style');
  style.textContent = CHROME;
  document.head.append(style);
  return () => style.remove();
}

/** The declarations of one rule, as written. jsdom does not substitute custom
 * properties, so a layering assertion has to read the token by name and look
 * its value up in tokens.css. */
function ruleBody(selector: string): string {
  return CHROME.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function tokenValue(name: string): number {
  const found = TOKENS.match(new RegExp(`${name}:\\s*(-?\\d+)`));
  if (!found) throw new Error(`tokens.css does not define ${name}`);
  return Number(found[1]);
}

describe('BulkBar', () => {
  it('renders no bar when nothing is selected', () => {
    renderWithApp(<BulkBar count={0} onClear={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('keeps the live region mounted at zero so the first selection is announced', () => {
    const { rerender } = renderWithApp(<BulkBar count={0} onClear={vi.fn()} />);

    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    expect(live).toHaveAttribute('aria-live', 'polite');

    rerender(<BulkBar count={2} onClear={vi.fn()} />);

    // Same node, new text. A region that mounts with its message is a region
    // that announces nothing.
    expect(screen.getByRole('status')).toBe(live);
    expect(live).toHaveTextContent('2 records selected');
  });

  it('says how many are selected, in the caller noun', () => {
    renderWithApp(<BulkBar count={3} noun="person" nouns="people" onClear={vi.fn()} />);

    expect(bar()).toHaveTextContent('3 people selected');
  });

  it('uses the singular for one', () => {
    renderWithApp(<BulkBar count={1} noun="person" nouns="people" onClear={vi.fn()} />);

    expect(bar()).toHaveTextContent('1 person selected');
  });

  it('announces the same sentence it shows, singular included', () => {
    // The live region is a sibling of the bar, not a child of it, so asserting
    // on the bar says nothing about the one string a screen reader user gets.
    const { rerender } = renderWithApp(
      <BulkBar count={1} noun="person" nouns="people" onClear={vi.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 person selected');

    rerender(<BulkBar count={3} noun="person" nouns="people" onClear={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('3 people selected');
  });

  it('offers Clear and calls it', async () => {
    const onClear = vi.fn();
    renderWithApp(<BulkBar count={2} onClear={onClear} />);

    await userEvent.click(within(bar()).getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('clears on Escape from inside the bar', () => {
    const onClear = vi.fn();
    renderWithApp(<BulkBar count={2} onClear={onClear} />);

    fireEvent.keyDown(within(bar()).getByRole('button', { name: 'Clear' }), { key: 'Escape' });

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders the caller actions inside the bar', async () => {
    const onDelete = vi.fn();
    renderWithApp(
      <BulkBar count={2} onClear={vi.fn()}>
        <Button variant="danger" size="sm" glyph="trash" onClick={onDelete}>
          Delete
        </Button>
      </BulkBar>,
    );

    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('reaches every control with Tab alone', async () => {
    renderWithApp(
      <BulkBar count={2} allSelected={false} onToggleAll={vi.fn()} onClear={vi.fn()}>
        <Button size="sm" onClick={vi.fn()}>
          Delete
        </Button>
      </BulkBar>,
    );

    const inside = within(bar());
    await userEvent.tab();
    expect(inside.getByRole('checkbox', { name: 'Select all' })).toHaveFocus();
    await userEvent.tab();
    expect(inside.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.tab();
    expect(inside.getByRole('button', { name: 'Clear' })).toHaveFocus();
  });

  /* The select-all control. -------------------------------------------------- */

  it('uses a real checkbox for select all, never a pressed button', () => {
    renderWithApp(
      <BulkBar count={2} allSelected={false} onToggleAll={vi.fn()} onClear={vi.fn()} />,
    );

    expect(within(bar()).getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { pressed: false })).not.toBeInTheDocument();
  });

  it('reports select all as checked when everything is selected', () => {
    renderWithApp(<BulkBar count={4} allSelected onToggleAll={vi.fn()} onClear={vi.fn()} />);

    expect(within(bar()).getByRole('checkbox', { name: 'Select all' })).toBeChecked();
  });

  it('toggles select all on click', async () => {
    const onToggleAll = vi.fn();
    renderWithApp(
      <BulkBar count={2} allSelected={false} onToggleAll={onToggleAll} onClear={vi.fn()} />,
    );

    await userEvent.click(within(bar()).getByRole('checkbox', { name: 'Select all' }));

    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it('leaves the checkbox out when the surface has no select all', () => {
    renderWithApp(<BulkBar count={2} onClear={vi.fn()} />);

    expect(within(bar()).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  /* Where it lives. ---------------------------------------------------------- */

  it('is not rendered inside a page header', () => {
    renderWithApp(
      <div>
        <PageHeader title="People" subtitle="Everyone you know" />
        <BulkBar count={2} onClear={vi.fn()} />
      </div>,
    );

    const header = screen.getByRole('banner');
    expect(header.contains(bar())).toBe(false);
    expect(bulkBarIsDetached(bar())).toBe(true);
  });

  describe('chrome', () => {
    let unload: () => void;

    beforeEach(() => {
      unload = loadChrome();
    });

    afterEach(() => unload());

    it('sits in a fixed layer, out of the page flow', () => {
      const { container } = renderWithApp(<BulkBar count={2} onClear={vi.fn()} />);

      const layer = container.querySelector('[data-bulkbar-layer]');
      expect(layer).not.toBeNull();
      // Fixed and pointer-transparent: the bar can appear without the list
      // under it moving, and the empty layer cannot swallow a click on a row.
      // Read off the cascade, so the assertion holds the stylesheet the app
      // ships rather than a style object the brand checker never reads.
      const layerStyle = getComputedStyle(layer as Element);
      expect(layerStyle.position).toBe('fixed');
      expect(layerStyle.pointerEvents).toBe('none');
      expect(getComputedStyle(bar()).pointerEvents).toBe('auto');
    });

    it('paints above the page and below the toast that confirms the action', () => {
      const declared = ruleBody('.bulkbar-layer').match(/z-index:\s*var\((--[\w-]+)\)/);
      // A fixed element with no z-index paints in DOM order, so anything later
      // in the page covers it.
      expect(declared, 'the layer declares no z-index').not.toBeNull();

      const layer = tokenValue(declared?.[1] ?? '');
      expect(layer).toBeGreaterThan(0);
      expect(layer).toBeLessThan(tokenValue('--ae-z-toast'));
    });

    it('keeps its chrome in the stylesheet, where the brand checker reads it', () => {
      const { container } = renderWithApp(<BulkBar count={2} onClear={vi.fn()} />);

      const layer = container.querySelector('[data-bulkbar-layer]');
      expect(layer).toHaveClass('bulkbar-layer');
      expect(bar()).toHaveClass('bulkbar');
      // Framer writes the entrance frame inline; the surface itself must not
      // be there, because scripts/check-brand-bans.mjs runs the colour, shadow,
      // easing and duration rules over .css only.
      expect(bar().getAttribute('style') ?? '').not.toContain('box-shadow');
      expect(bar().getAttribute('style') ?? '').not.toContain('background');
    });
  });

  /* Motion and axe. ---------------------------------------------------------- */

  it('enters by fading and rising, and never slides across the screen', () => {
    renderWithApp(<BulkBar count={2} onClear={vi.fn()} />);

    // The inline style Framer writes for the variant's `initial` frame, which
    // is `useEnter()` and therefore the four-pixel rise the motion contract
    // allows. Anything on the x axis would be a slide.
    const style = bar().getAttribute('style') ?? '';
    expect(style).toContain('opacity: 0');
    expect(style).toContain('translateY(4px)');
    expect(style).not.toContain('translateX');
    expect(style).not.toContain('scale');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithApp(
      <BulkBar count={2} allSelected={false} onToggleAll={vi.fn()} onClear={vi.fn()}>
        <Button variant="danger" size="sm" glyph="trash" onClick={vi.fn()}>
          Delete
        </Button>
      </BulkBar>,
    );

    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('bulkBarIsDetached rejects a bar that was put back in the header', () => {
    renderWithApp(
      <PageHeader title="People" actions={<BulkBar count={2} onClear={vi.fn()} />} />,
    );

    expect(bulkBarIsDetached(bar())).toBe(false);
  });
});
