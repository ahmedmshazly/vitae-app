/**
 * useUnsavedChanges: one guard a form wires in one place, so a filled dialog,
 * sheet or card stops throwing the work away on Escape, on a backdrop click,
 * on Cancel, on an in-app link, on browser Back or Forward, or on a browser
 * unload.
 *
 * Every exit path in this app used to be separate code: Radix reports Escape
 * and the backdrop through the same `onOpenChange(false)`, Cancel is a button,
 * a nav-rail Link is an anchor, Back is a `popstate`, and a reload is
 * `beforeunload`. Guarding them one at a time is how four of the six get
 * missed. This hook funnels all of them into a single question and answers it
 * with the design system's Modal, so the prompt looks like the rest of the
 * product instead of like `window.confirm`.
 *
 * Wiring, all of it:
 *
 * ```tsx
 * const guard = useUnsavedChanges(dirty, { onClose: () => setOpen(false) });
 *
 * <Sheet open={open} onOpenChange={guard.onOpenChange} title="Edit atom"
 *        footer={<Button onClick={guard.requestClose}>Cancel</Button>}>
 *   ...
 * </Sheet>
 * {guard.prompt}
 * ```
 *
 * Render `guard.prompt` as a sibling of the dialog it guards, never inside it:
 * a caller that unmounts the whole dialog when it closes would take the prompt
 * with it, and the question would flash and vanish.
 *
 * After a save succeeds the caller calls `guard.forceClose()`, which closes
 * without asking. The dirty flag is the caller's, and it usually has not
 * flipped back to false yet at the moment the mutation resolves.
 *
 * This file is `.tsx` rather than `.ts` because the hook ships the dialog it
 * needs. That is the point: the prompt cannot be forgotten if it arrives with
 * the guard.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Glyph, Inline, Modal } from '@vitae/ui';

/** The one place the prompt's words live, so tests and screens agree. */
export const UNSAVED_TITLE = 'Discard changes?';
export const UNSAVED_BODY =
  'You have changes that are not saved. Discard drops them. Keep editing returns you to the form.';
export const UNSAVED_DISCARD = 'Discard';
export const UNSAVED_KEEP = 'Keep editing';

export interface UnsavedChangesOptions {
  /**
   * What closing actually does: the caller's `setOpen(false)`, `onDone()`, or
   * whatever ends the edit. Runs immediately when clean, and after Discard
   * when dirty.
   */
  onClose?: () => void;
  /** Override the prompt title. Defaults to "Discard changes?". */
  title?: string;
  /** Override the prompt body. */
  body?: ReactNode;
  /** Override the confirm label. Defaults to "Discard". */
  discardLabel?: string;
  /** Override the cancel label. Defaults to "Keep editing". */
  keepLabel?: string;
  /**
   * Intercept in-app navigation while dirty: link clicks, and browser Back or
   * Forward. Default true. Turn it off for a form that deliberately lives on a
   * page the user is meant to navigate away from, never to silence a prompt
   * that is telling the truth.
   */
  guardNavigation?: boolean;
  /**
   * Ask the browser to confirm a real unload (reload, tab close, typed URL)
   * while dirty. Default true.
   */
  guardUnload?: boolean;
}

export interface UnsavedChangesGuard {
  /** The flag the caller passed, echoed so a footer can read one object. */
  dirty: boolean;
  /** True while the prompt is on screen. */
  prompting: boolean;
  /**
   * Radix `onOpenChange`. Covers Escape and the backdrop click, because Radix
   * reports both through this one callback. Opening is never guarded, and
   * every dialog in this app is controlled, so the caller owns that half.
   */
  onOpenChange: (open: boolean) => void;
  /** The Cancel button's handler. Same question, same prompt. */
  requestClose: () => void;
  /**
   * Run `action` once the user has agreed to lose the work, or straight away
   * when there is none. For exits that are not the dialog closing: a
   * programmatic `navigate`, a tab switch, a record swap underneath the form.
   */
  attempt: (action: () => void) => void;
  /** Close with no question asked. For use after a save succeeds. */
  forceClose: () => void;
  /** The ConfirmDialog. Render it beside the dialog being guarded. */
  prompt: ReactNode;
}

/** A pending exit, boxed so `useState` stores it instead of calling it. */
type Pending = { run: () => void };

export function useUnsavedChanges(dirty: boolean, options: UnsavedChangesOptions = {}): UnsavedChangesGuard {
  const {
    onClose,
    title = UNSAVED_TITLE,
    body,
    discardLabel = UNSAVED_DISCARD,
    keepLabel = UNSAVED_KEEP,
    guardNavigation = true,
    guardUnload = true,
  } = options;

  const [pending, setPending] = useState<Pending | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Set while the guard is itself running a history move it already asked
  // about, so the popstate that move causes is not read as a fresh exit.
  const bypassPop = useRef(false);

  function attempt(action: () => void) {
    if (!dirty) {
      action();
      return;
    }
    setPending({ run: action });
  }

  function requestClose() {
    attempt(() => onClose?.());
  }

  function onOpenChange(open: boolean) {
    // Radix reports Escape and the backdrop click here too, which is the whole
    // reason one handler is enough. Opening is never guarded.
    if (open) return;
    requestClose();
  }

  function forceClose() {
    setPending(null);
    onClose?.();
  }

  // A real unload: reload, tab close, a typed URL. The browser will not accept
  // custom words here and shows its own sentence, so the only job is arming
  // and disarming. The listener exists only while the form is dirty, and the
  // cleanup runs on every dirty change as well as on unmount, so nothing is
  // left attached to window after the form is saved or gone.
  useEffect(() => {
    if (!dirty || !guardUnload) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Chrome and Safari still want the legacy channel set.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, guardUnload]);

  // In-app navigation. This app mounts a plain BrowserRouter, not a data
  // router, so react-router's useBlocker is unavailable; a capture-phase click
  // listener catches every Link in the shell instead. Link only navigates when
  // the click was not already prevented, so preventing it here is enough to
  // hold the user on the page while the prompt is answered.
  useEffect(() => {
    if (!dirty || !guardNavigation) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(anchor.getAttribute('href') ?? '', window.location.href);
      } catch {
        return;
      }
      // Another origin leaves the app entirely, which is an unload, and
      // beforeunload already covers it.
      if (url.origin !== window.location.origin) return;

      const to = `${url.pathname}${url.search}${url.hash}`;
      // A link back to the record already on screen loses nothing, so asking
      // the user to confirm a discard would be asking about a departure that
      // is not happening. Compared against the router's location rather than
      // window.location, because under a memory router (and any future data
      // router) those are not the same thing.
      if (to === `${location.pathname}${location.search}${location.hash}`) return;

      event.preventDefault();
      setPending({ run: () => navigate(to) });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, guardNavigation, navigate, location.pathname, location.search, location.hash]);

  // Browser Back and Forward, which is how a page-level form is usually left.
  // A same-document history move fires neither a click nor beforeunload, so
  // without this the commonest exit is the one the guard misses.
  //
  // By the time popstate runs, the history index has already moved and
  // react-router has queued a render of the entry the user landed on. Pushing
  // this form's URL straight back on lands in the same batch, so the form is
  // never actually left, and the entry they were trying to reach is now
  // exactly one step back, which is what Discard runs.
  useEffect(() => {
    if (!dirty || !guardNavigation) return;
    const here = `${location.pathname}${location.search}${location.hash}`;
    function onPopState() {
      // Discard's own navigate(-1) fires popstate as well. Without this the
      // guard would catch the exit it just authorised and ask again, forever.
      if (bypassPop.current) {
        bypassPop.current = false;
        return;
      }
      navigate(here);
      setPending({
        run: () => {
          bypassPop.current = true;
          navigate(-1);
        },
      });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty, guardNavigation, navigate, location.pathname, location.search, location.hash]);

  // This is ConfirmDialog's markup, assembled here on the same Modal primitive
  // for exactly one reason: ConfirmDialog autoFocuses its confirm button, and
  // the confirm here is the destructive answer. Escape-then-Enter, or a stray
  // Enter while the question is up, would then destroy the work this prompt
  // exists to protect. The safe answer owns the focus instead. The day
  // ConfirmDialog exposes which button opens focused, this goes back to using
  // it.
  const prompt = (
    <Modal
      open={pending !== null}
      onOpenChange={(open) => {
        // Escaping the prompt itself is "Keep editing": the safe answer.
        if (!open) setPending(null);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button autoFocus onClick={() => setPending(null)}>
            {keepLabel}
          </Button>
          <Button
            variant="danger"
            className="vt-btn--danger-fill"
            onClick={() => {
              const run = pending?.run;
              setPending(null);
              run?.();
            }}
          >
            {discardLabel}
          </Button>
        </>
      }
    >
      <div className="vt-modal__confirm-body">
        {body ?? (
          // Non-negotiable 6: the danger state carries a glyph and a word, not
          // the red fill on the Discard button alone.
          <Inline gap={2} align="start">
            <Glyph name="alert" size={14} />
            <span>{UNSAVED_BODY}</span>
          </Inline>
        )}
      </div>
    </Modal>
  );

  return { dirty, prompting: pending !== null, onOpenChange, requestClose, attempt, forceClose, prompt };
}
