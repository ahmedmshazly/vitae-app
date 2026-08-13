/**
 * The unsaved-work guard. Every exit path a filled form has: Escape, the
 * backdrop, Cancel, an in-app link, browser Back, a browser unload, and the
 * save that is allowed to skip the question. Plus the links it must keep its
 * hands off, and the options that switch it off.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Input, Sheet } from '@vitae/ui';
import { renderWithApp } from '../test/render.js';
import { UNSAVED_BODY, useUnsavedChanges, type UnsavedChangesOptions } from './unsaved-changes.js';

/** A sheet wired the way a screen wires it: one handler for all three exits. */
function SheetHarness({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
  const guard = useUnsavedChanges(dirty, { onClose });
  return (
    <>
      <Sheet
        open
        onOpenChange={guard.onOpenChange}
        title="Edit atom"
        footer={
          <>
            <Button onClick={guard.requestClose}>Cancel</Button>
            <Button onClick={guard.forceClose}>Save atom</Button>
          </>
        }
      >
        <Input aria-label="Atom text" defaultValue="" />
      </Sheet>
      {guard.prompt}
    </>
  );
}

/** A page-level form with the nav rail beside it. */
function NavHarness({ dirty }: { dirty: boolean }) {
  const guard = useUnsavedChanges(dirty);
  const location = useLocation();
  return (
    <>
      <p>at {location.pathname}</p>
      <Link to="/atoms">Atoms</Link>
      <a href="/letters?draft=1">Letters</a>
      {guard.prompt}
    </>
  );
}

function UnloadHarness({ dirty, options }: { dirty: boolean; options?: UnsavedChangesOptions }) {
  const guard = useUnsavedChanges(dirty, options);
  return <>{guard.prompt}</>;
}

/**
 * A page-level form the user leaves with browser Back. MemoryRouter never
 * touches window.history, so the button reproduces in one step what a real
 * Back does: the router moves to the previous entry, then window fires
 * popstate, both inside the same React batch.
 */
function BackHarness({ dirty }: { dirty: boolean }) {
  const guard = useUnsavedChanges(dirty);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p>at {location.pathname}</p>
      <Button
        onClick={() => {
          navigate(-1);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
      >
        Browser back
      </Button>
      {guard.prompt}
    </>
  );
}

/** The anchors the interceptor has to keep its hands off. */
function PassThroughHarness({ dirty }: { dirty: boolean }) {
  const guard = useUnsavedChanges(dirty);
  const location = useLocation();
  return (
    <>
      <p>at {location.pathname}</p>
      <a href="mailto:maintainers@vitae.example">Email the maintainers</a>
      <a href="/letters" target="_blank" rel="noreferrer">
        Letters in a new tab
      </a>
      <a href="/exports/lina-farouk.pdf" download>
        Download the resume
      </a>
      <a href="/atoms/new?draft=1">This record</a>
      <a href="/letters">Letters</a>
      {guard.prompt}
    </>
  );
}

/** A page-level form that shows what the guard returns and takes its options. */
function OptionsHarness({ dirty, options }: { dirty: boolean; options?: UnsavedChangesOptions }) {
  const [switched, setSwitched] = useState(false);
  const guard = useUnsavedChanges(dirty, options);
  const location = useLocation();
  return (
    <>
      <p>at {location.pathname}</p>
      <p>prompting {String(guard.prompting)}</p>
      <p>dirty {String(guard.dirty)}</p>
      <p>{switched ? 'showing the next record' : 'showing this record'}</p>
      <Link to="/atoms">Atoms</Link>
      <Button onClick={() => guard.attempt(() => setSwitched(true))}>Next record</Button>
      {guard.prompt}
    </>
  );
}

/**
 * Clicks the way a browser does and reports whether the click survived. False
 * means something called preventDefault, which for these anchors is the bug:
 * a mailto, a new tab, a download and a modifier click all need the default.
 */
function clickSurvives(el: Element, init: MouseEventInit = {}): boolean {
  let survived = false;
  // The verdict is read on the target itself: after the guard's capture-phase
  // listener has had the click, and before jsdom tries to follow the link,
  // which it cannot do and reports as an unhandled error. What the guard did
  // is the subject here, jsdom's navigation stub is not.
  function verdict(event: Event) {
    survived = !event.defaultPrevented;
    event.preventDefault();
  }
  el.addEventListener('click', verdict);
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  el.removeEventListener('click', verdict);
  return survived;
}

/** True when something on the page asked the browser to confirm the unload. */
function unloadIsGuarded(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  return window.dispatchEvent(event) === false;
}

describe('useUnsavedChanges, closing a dialog', () => {
  it('closes straight away when the form is clean', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty={false} onClose={onClose} />);
    await screen.findByLabelText('Atom text');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('asks before Escape discards a dirty form, and keeps the work until answered', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty onClose={onClose} />);
    await screen.findByLabelText('Atom text');

    await user.keyboard('{Escape}');

    expect(await screen.findByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText(UNSAVED_BODY)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only after the user picks Discard', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty onClose={onClose} />);
    await screen.findByLabelText('Atom text');

    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves the form open when the user picks Keep editing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty onClose={onClose} />);
    await screen.findByLabelText('Atom text');

    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Atom text')).toBeInTheDocument();
  });

  it('sends the Cancel button through the same prompt', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes with no question after a save, while the form is still dirty', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<SheetHarness dirty onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'Save atom' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });
});

describe('useUnsavedChanges, in-app navigation', () => {
  it('holds an in-app link until the user answers, then follows it on Discard', async () => {
    const user = userEvent.setup();
    renderWithApp(<NavHarness dirty />, { route: '/atoms/new' });

    await user.click(screen.getByRole('link', { name: 'Atoms' }));

    expect(await screen.findByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText('at /atoms/new')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());
  });

  it('stays put when the user picks Keep editing', async () => {
    const user = userEvent.setup();
    renderWithApp(<NavHarness dirty />, { route: '/atoms/new' });

    await user.click(screen.getByRole('link', { name: 'Atoms' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument());
    expect(screen.getByText('at /atoms/new')).toBeInTheDocument();
  });

  it('guards a plain anchor into the app as well as a router link', async () => {
    const user = userEvent.setup();
    renderWithApp(<NavHarness dirty />, { route: '/atoms/new' });

    await user.click(screen.getByRole('link', { name: 'Letters' }));

    expect(await screen.findByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText('at /atoms/new')).toBeInTheDocument();
  });

  it('lets a link through untouched when the form is clean', async () => {
    const user = userEvent.setup();
    renderWithApp(<NavHarness dirty={false} />, { route: '/atoms/new' });

    await user.click(screen.getByRole('link', { name: 'Atoms' }));

    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });
});

describe('useUnsavedChanges, browser unload', () => {
  it('asks the browser to confirm an unload while the form is dirty', () => {
    renderWithApp(<UnloadHarness dirty />);
    expect(unloadIsGuarded()).toBe(true);
  });

  it('adds no unload listener while the form is clean', () => {
    renderWithApp(<UnloadHarness dirty={false} />);
    expect(unloadIsGuarded()).toBe(false);
  });

  it('drops the unload listener the moment the form goes clean', () => {
    const { rerender } = renderWithApp(<UnloadHarness dirty />);
    expect(unloadIsGuarded()).toBe(true);

    rerender(<UnloadHarness dirty={false} />);

    expect(unloadIsGuarded()).toBe(false);
  });

  it('leaks no unload listener when the form unmounts dirty', () => {
    const { unmount } = renderWithApp(<UnloadHarness dirty />);
    expect(unloadIsGuarded()).toBe(true);

    unmount();

    expect(unloadIsGuarded()).toBe(false);
  });
});

describe('useUnsavedChanges, browser Back', () => {
  const twoEntries = { routerProps: { initialEntries: ['/atoms', '/atoms/new'], initialIndex: 1 } };

  it('holds browser Back until the user answers, and keeps the form on screen', async () => {
    const user = userEvent.setup();
    renderWithApp(<BackHarness dirty />, twoEntries);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(await screen.findByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText('at /atoms/new')).toBeInTheDocument();
  });

  it('completes the Back the user asked for once they pick Discard', async () => {
    const user = userEvent.setup();
    renderWithApp(<BackHarness dirty />, twoEntries);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());
  });

  it('stays on the form when the user picks Keep editing', async () => {
    const user = userEvent.setup();
    renderWithApp(<BackHarness dirty />, twoEntries);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument());
    expect(screen.getByText('at /atoms/new')).toBeInTheDocument();
  });

  it('does not ask a second time about the Back it just performed', async () => {
    const user = userEvent.setup();
    renderWithApp(<BackHarness dirty />, twoEntries);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());

    // The history move Discard ran fires its own popstate a moment later. The
    // guard has to recognise the exit it just authorised, or the answer loops.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
    expect(screen.getByText('at /atoms')).toBeInTheDocument();
  });

  it('lets Back through untouched when the form is clean', async () => {
    const user = userEvent.setup();
    renderWithApp(<BackHarness dirty={false} />, twoEntries);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });
});

describe('useUnsavedChanges, links it must not touch', () => {
  const here = { route: '/atoms/new?draft=1' };

  it('cancels the in-app link it does mean to guard, which is what the rest of these compare against', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'Letters' }))).toBe(false);
    expect(screen.getByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument();
  });

  it('leaves a link to another origin alone, so a mailto still opens the mail client', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'Email the maintainers' }))).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a modified click alone, so cmd, ctrl, shift and alt clicks still work', () => {
    renderWithApp(<PassThroughHarness dirty />, here);
    const letters = screen.getByRole('link', { name: 'Letters' });

    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
      expect(clickSurvives(letters, modifier)).toBe(true);
    }

    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a click that is not the primary button alone', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'Letters' }), { button: 1 })).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a link that opens in a new tab alone, because this page is not going anywhere', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'Letters in a new tab' }))).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a download alone', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'Download the resume' }))).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a link back to the record already on screen alone, because it loses nothing', () => {
    renderWithApp(<PassThroughHarness dirty />, here);

    expect(clickSurvives(screen.getByRole('link', { name: 'This record' }))).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('leaves a click something upstream already cancelled alone', () => {
    renderWithApp(<PassThroughHarness dirty />, here);
    // Capture starts at window, so this runs before the guard's own listener,
    // the way a shell-level handler that owns the click would.
    const swallow = (event: Event) => event.preventDefault();
    window.addEventListener('click', swallow, true);
    try {
      clickSurvives(screen.getByRole('link', { name: 'Letters' }));
    } finally {
      window.removeEventListener('click', swallow, true);
    }

    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });
});

describe('useUnsavedChanges, the options and what it returns', () => {
  it('reports dirty and prompting, and runs an attempt once the user picks Discard', async () => {
    const user = userEvent.setup();
    renderWithApp(<OptionsHarness dirty />);

    expect(screen.getByText('dirty true')).toBeInTheDocument();
    expect(screen.getByText('prompting false')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next record' }));

    expect(await screen.findByText('prompting true')).toBeInTheDocument();
    expect(screen.getByText('showing this record')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(await screen.findByText('showing the next record')).toBeInTheDocument();
    expect(screen.getByText('prompting false')).toBeInTheDocument();
  });

  it('opens the prompt with focus on Keep editing, never on Discard', async () => {
    const user = userEvent.setup();
    renderWithApp(<OptionsHarness dirty />);

    await user.click(screen.getByRole('button', { name: 'Next record' }));

    const keep = await screen.findByRole('button', { name: 'Keep editing' });
    await waitFor(() => expect(keep).toHaveFocus());
  });

  it('carries a glyph beside the words, so the danger is not the red button alone', async () => {
    const user = userEvent.setup();
    renderWithApp(<OptionsHarness dirty />);

    await user.click(screen.getByRole('button', { name: 'Next record' }));

    const words = await screen.findByText(UNSAVED_BODY);
    expect(words.parentElement?.querySelector('svg')).toBeInTheDocument();
  });

  it('takes the caller words for the title and both answers', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <OptionsHarness
        dirty
        options={{ title: 'Leave this draft?', discardLabel: 'Throw it away', keepLabel: 'Stay here' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next record' }));

    expect(await screen.findByRole('heading', { name: 'Leave this draft?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Throw it away' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay here' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('takes a caller body in place of the standard sentence', async () => {
    const user = userEvent.setup();
    renderWithApp(<OptionsHarness dirty options={{ body: <span>Two answers are unsaved.</span> }} />);

    await user.click(screen.getByRole('button', { name: 'Next record' }));

    expect(await screen.findByText('Two answers are unsaved.')).toBeInTheDocument();
    expect(screen.queryByText(UNSAVED_BODY)).not.toBeInTheDocument();
  });

  it('honours guardNavigation false by letting a link through while dirty', async () => {
    const user = userEvent.setup();
    renderWithApp(<OptionsHarness dirty options={{ guardNavigation: false }} />, { route: '/atoms/new' });

    await user.click(screen.getByRole('link', { name: 'Atoms' }));

    await waitFor(() => expect(screen.getByText('at /atoms')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('honours guardUnload false by adding no unload listener while dirty', () => {
    renderWithApp(<UnloadHarness dirty options={{ guardUnload: false }} />);
    expect(unloadIsGuarded()).toBe(false);
  });
});
