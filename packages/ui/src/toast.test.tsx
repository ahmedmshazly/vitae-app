import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ToastProvider,
  useToast,
  type ToastAnnouncementMode,
  type ToastSwipeDirection,
} from './toast.js';

// Comments are stripped once, here, so no assertion below can be satisfied by
// prose sitting above a rule that is gone. Same shape as layout.test.tsx.
const TOAST_CSS = readFileSync(join(process.cwd(), 'src/styles/toast.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function cssRules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

const FAILURE = 'Save failed. Check the connection, then try again.';

function Fixture({ onUndo = () => {} }: { onUndo?: () => void }) {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast('Draft saved', { variant: 'success' })}>Save</button>
      <button onClick={() => toast(FAILURE, { variant: 'error' })}>Break</button>
      <button
        onClick={() => toast('Role deleted', { action: { label: 'Undo', onAction: onUndo } })}
      >
        Delete
      </button>
      <button
        onClick={() => {
          toast('Role deleted', { action: { label: 'Undo', onAction: onUndo } });
          toast('Project deleted');
        }}
      >
        Delete two
      </button>
      <button onClick={() => toast('Copied', { duration: 1000 })}>Copy</button>
      <button
        onClick={() => {
          for (let n = 1; n <= 6; n += 1) toast(`Record ${n} saved`);
        }}
      >
        Burst
      </button>
    </div>
  );
}

function mount(props?: {
  onUndo?: () => void;
  swipeDirection?: ToastSwipeDirection;
  itemClassName?: string;
  announcementMode?: ToastAnnouncementMode;
}) {
  const { swipeDirection, itemClassName, announcementMode, ...fixture } = props ?? {};
  return render(
    <ToastProvider
      swipeDirection={swipeDirection}
      itemClassName={itemClassName}
      announcementMode={announcementMode}
    >
      <Fixture {...fixture} />
    </ToastProvider>,
  );
}

/** The <li> that owns a given message. */
function toastFor(text: string | RegExp): HTMLElement {
  const item = screen.getByText(text).closest('li');
  if (!item) throw new Error(`no toast wraps ${String(text)}`);
  return item;
}

/**
 * What a screen reader is handed: Radix portals one live region per toast and
 * retires it a second later.
 */
async function announcementFor(live: 'polite' | 'assertive'): Promise<string> {
  return waitFor(() => {
    const region = document.querySelector(`[role="status"][aria-live="${live}"]`);
    if (!region?.textContent?.trim()) throw new Error(`no ${live} announcement yet`);
    return region.textContent;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('mounts the viewport before anything is fired, so the live region already exists', () => {
    mount();
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('can preserve a host selector while its call sites migrate', async () => {
    const user = userEvent.setup();
    mount({ itemClassName: 'legacy-toast' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(toastFor('Draft saved')).toHaveClass('vt-toast', 'legacy-toast');
  });

  it('can keep a legacy status role on the actionable visible item', async () => {
    const user = userEvent.setup();
    mount({ announcementMode: 'item' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Role deleted');
    expect(within(status).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('quotes the same hotkey in an action announcement as in the viewport name', async () => {
    const user = userEvent.setup();
    mount();
    const named = screen.getByRole('region', { name: /notifications/i }).getAttribute('aria-label');
    const hotkey = /\((?<key>[^)]+)\)/.exec(named ?? '')?.groups?.key;
    expect(hotkey).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await announcementFor('polite')).toContain(`press ${hotkey} `);
  });

  it('queues two toasts fired in the same tick instead of the second eating the first', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Delete two' }));

    expect(await screen.findByText('Role deleted')).toBeInTheDocument();
    expect(screen.getByText('Project deleted')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // The first toast keeps its own action, which is the callback that was
    // being dropped when one slot held one message.
    expect(
      within(toastFor('Role deleted')).getByRole('button', { name: 'Undo' }),
    ).toBeInTheDocument();
  });

  it('caps the stack at four so a burst cannot grow off the top of the window', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Burst' }));

    await screen.findByText('Record 6 saved');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    // Oldest out first: the last four fired are the four still standing.
    expect(screen.queryByText('Record 1 saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Record 2 saved')).not.toBeInTheDocument();
    expect(screen.getByText('Record 3 saved')).toBeInTheDocument();
  });
});

describe('Toast variants', () => {
  it('sets an error apart from a success by a word and a glyph, not by colour alone', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Break' }));
    await screen.findByText(FAILURE);

    const ok = toastFor('Draft saved');
    const bad = toastFor(FAILURE);

    expect(within(ok).getByText('Done')).toBeInTheDocument();
    expect(within(bad).getByText('Error')).toBeInTheDocument();
    expect(ok.textContent).not.toContain('Error');
    expect(ok).toHaveAttribute('data-variant', 'success');
    expect(bad).toHaveAttribute('data-variant', 'error');
    expect(ok.querySelector('.vt-toast__glyph svg')).not.toBeNull();
    expect(bad.querySelector('.vt-toast__glyph svg')).not.toBeNull();
  });

  it('draws every state mark differently from the dismiss control beside it', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Break' }));
    await screen.findByText(FAILURE);

    // Every variant that ships a mark, not just the error one. Checking a
    // single variant let the same collision be reintroduced on any of the
    // others with the suite still green.
    for (const message of ['Draft saved', FAILURE]) {
      const item = toastFor(message);
      const mark = item.querySelector('.vt-toast__glyph svg')?.innerHTML;
      const dismiss = item.querySelector('.vt-toast__x svg')?.innerHTML;
      expect(mark, `${message} has no state mark`).toBeTruthy();
      expect(dismiss, `${message} has no dismiss control`).toBeTruthy();
      // Same geometry twice in one row would leave colour as the only thing
      // telling a state mark from a button.
      expect(mark, `${message} draws its mark as the dismiss X`).not.toEqual(dismiss);
    }
  });

  it('announces an error assertively and a success politely', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Break' }));
    await screen.findByText(FAILURE);

    await waitFor(() => {
      expect(document.querySelector('[aria-live="assertive"]')).not.toBeNull();
    });
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('Toast announcements', () => {
  it('separates the variant word from the message', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await announcementFor('polite')).toBe('Notification Done. Draft saved.');
  });

  it('does not double the stop on a message that already ends in one', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Break' }));

    expect(await announcementFor('assertive')).toBe(`Notification Error. ${FAILURE}`);
  });

  it('reads the action after the message, as its own sentence', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await announcementFor('polite')).toBe(
      'Notification Role deleted. Undo: press F8 to move focus to notifications.',
    );
  });
});

describe('Toast duration', () => {
  // Fired with fireEvent, not userEvent: that one waits on real timers
  // between events, which never tick while the clock is frozen.
  it('lets an explicit duration win over the variant default', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      vi.advanceTimersByTime(1400);
    });

    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    expect(screen.getByText('Draft saved')).toBeInTheDocument();
  });

  it('keeps a toast carrying an action up long after a plain one has gone', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete two' }));

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Project deleted')).not.toBeInTheDocument();
    expect(screen.getByText('Role deleted')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByText('Role deleted')).not.toBeInTheDocument();
  });

  it('keeps an error up past the point a success has already gone', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Break' }));
    expect(screen.getByText('Draft saved')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.queryByText('Draft saved')).not.toBeInTheDocument();
    expect(screen.getByText(FAILURE)).toBeInTheDocument();

    // And it does go: the error window is longer, not open ended.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(FAILURE)).not.toBeInTheDocument();
  });
});

describe('Toast swipe', () => {
  it('carries the axis of the swipe direction it was given', async () => {
    const user = userEvent.setup();
    mount({ swipeDirection: 'up' });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const item = toastFor('Draft saved');
    // The axis drives which translate the stylesheet applies to a drag.
    expect(item).toHaveAttribute('data-swipe-axis', 'y');
    expect(item).toHaveAttribute('data-swipe-direction', 'up');
  });

  it('swipes horizontally by default', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const item = toastFor('Draft saved');
    expect(item).toHaveAttribute('data-swipe-axis', 'x');
    expect(item).toHaveAttribute('data-swipe-direction', 'right');
  });

  it.each([
    ['up', 'y', 'translateY'],
    ['right', 'x', 'translateX'],
  ] as const)(
    'moves a %s swipe along the axis the stylesheet keys on',
    async (direction, axis, translate) => {
      const user = userEvent.setup();
      mount({ swipeDirection: direction });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(toastFor('Draft saved')).toHaveAttribute('data-swipe-axis', axis);

      // The value the component writes has to be the value the stylesheet
      // reads, or the drag rules are dead selectors.
      for (const phase of ['move', 'end']) {
        const rule = cssRules(TOAST_CSS).find(
          (r) => r.selector === `.vt-toast[data-swipe-axis='${axis}'][data-swipe='${phase}']`,
        );
        expect(rule, `no ${axis} ${phase} rule in toast.css`).toBeDefined();
        expect(rule!.body).toContain(translate);
      }
    },
  );
});

describe('toast.css', () => {
  it('bounds the viewport and scrolls it, so the stack cannot leave the window', () => {
    const viewport = cssRules(TOAST_CSS).find((r) => r.selector === '.vt-toast-viewport');
    expect(viewport, 'the viewport rule is gone from toast.css').toBeDefined();
    // Pinned to the bottom edge and growing upward: without a bound and a
    // scroller, a burst puts the oldest items past the top of the window.
    expect(viewport!.body).toMatch(/max-height:\s*calc\(100vh/);
    expect(viewport!.body).toMatch(/overflow-y:\s*auto/);
  });

  it('lays the row out one element in from the item that carries the announcement', () => {
    const row = cssRules(TOAST_CSS).find((r) => r.selector === '.vt-toast__row');
    expect(row, 'the row rule is gone, so the toast has lost its layout').toBeDefined();
    expect(row!.body).toMatch(/display:\s*flex/);
    expect(row!.body).toMatch(/gap:\s*var\(--ae-space-3\)/);
  });
});

describe('Toast teardown', () => {
  it('holds a dismissed toast in the queue for the exit window', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    const pending = vi.getTimerCount();
    expect(pending).toBeGreaterThan(0);

    // Still held two thirds of the way through the exit.
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(vi.getTimerCount()).toBe(pending);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(vi.getTimerCount()).toBe(pending - 1);
  });

  it('clears the pending removal timers when the provider unmounts', async () => {
    vi.useFakeTimers();
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Break' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    // A removal timer that outlives its provider is a leak pointing at a
    // setState with nowhere to land.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Toast actions', () => {
  it('does not evict an in-flight action when new notifications arrive', async () => {
    let resolve!: () => void;
    mount({ onUndo: () => new Promise<void>((done) => { resolve = done; }) });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Burst' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Role deleted')).toBeInTheDocument();
    expect(screen.getByText('Record 6 saved')).toBeInTheDocument();
    await act(async () => resolve());
    expect(screen.queryByText('Role deleted')).not.toBeInTheDocument();
  });

  it('keeps a pending action visible and prevents duplicate activation or dismissal', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const onUndo = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    mount({ onUndo });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const action = screen.getByRole('button', { name: 'Working…' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(action);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(toastFor('Role deleted')).toHaveAttribute('data-state', 'open');
    expect(onUndo).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.queryByText('Role deleted')).not.toBeInTheDocument();
  });

  it('retains the failed action for retry, including synchronous failures', async () => {
    const onUndo = vi.fn().mockImplementationOnce(() => { throw new Error('offline'); }).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    mount({ onUndo, announcementMode: 'item' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't complete that action. Try again.");
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'false');
    await user.click(undo);
    await waitFor(() => expect(screen.queryByText('Role deleted')).not.toBeInTheDocument());
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it('can unmount while an action is pending without adding feedback to a dead tree', async () => {
    let reject!: (error: Error) => void;
    const onUndo = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const { unmount } = mount({ onUndo });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    unmount();
    await act(async () => reject(new Error('offline')));
    expect(screen.queryByText('Role deleted')).not.toBeInTheDocument();
  });

  it('runs the action callback and closes the toast', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();
    mount({ onUndo });
    await user.click(screen.getByRole('button', { name: 'Delete two' }));
    await screen.findByText('Role deleted');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Role deleted')).not.toBeInTheDocument();
    });
    // Only the toast that was acted on goes.
    expect(screen.getByText('Project deleted')).toBeInTheDocument();
  });

  it('is reachable by Tab, with no hotkey needed', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });

    for (let step = 0; step < 10 && document.activeElement !== undo; step += 1) {
      await user.tab();
    }

    expect(document.activeElement).toBe(undo);
  });

  it('dismisses on the close control', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Draft saved');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByText('Draft saved')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
  });
});

describe('useToast', () => {
  it('says where it must be called from when there is no provider', () => {
    function Orphan() {
      useToast();
      return null;
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    quiet.mockRestore();
  });
});
