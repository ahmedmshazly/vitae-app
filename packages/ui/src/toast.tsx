/**
 * Toast: the one transient feedback channel, on Radix.
 *
 * Radix owns the parts that are hard to hand-roll and were wrong before: a
 * viewport mounted for the life of the app (so its live region exists before
 * any message lands in it, which is what screen readers need), pause on
 * pointer *and* on focus, swipe to dismiss, and a documented hotkey (F8) that
 * moves focus into the stack from anywhere on the page.
 *
 * The hotkey is a shortcut, not the only route: Radix puts the viewport at the
 * end of the natural tab order, so Tab from the page reaches the Undo button
 * too. Both paths are covered in toast.test.tsx; neither may be removed.
 *
 * The queue is ours: `toast()` appends, so three deletes in a row produce
 * three toasts with three live Undo callbacks instead of one that ate the
 * other two. It is capped, and the viewport scrolls, so a burst cannot grow
 * off the top of the window taking its Undo buttons with it.
 *
 * Animation is CSS only, driven by the [data-state] attributes Radix sets, at
 * --ae-dur / --ae-ease, so this package still carries no animation runtime.
 * See the header of overlay.tsx.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { Glyph, type GlyphName } from './glyphs.js';
import { cn } from './lib/cn.js';

export type ToastVariant = 'status' | 'success' | 'error';
export type ToastSwipeDirection = 'up' | 'down' | 'left' | 'right';
export type ToastAnnouncementMode = 'radix' | 'item';

export interface ToastActionSpec {
  /** Button text. Keep it a verb: "Undo", "Retry", "Open". */
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  variant?: ToastVariant;
  action?: ToastActionSpec;
  /** Override the variant default, in milliseconds. */
  duration?: number;
}

export interface ToastApi {
  toast: (message: string, options?: ToastOptions) => void;
}

/**
 * Colour never carries a state on its own (IDENTITY.md non-negotiable 6), so
 * each semantic variant also ships a glyph and a word. `status` is the neutral
 * default and claims neither.
 *
 * `live` maps to Radix's announcement priority: an error interrupts, anything
 * else waits its turn.
 */
const VARIANT: Record<
  ToastVariant,
  { glyph?: GlyphName; word?: string; live: 'foreground' | 'background' }
> = {
  status: { live: 'background' },
  success: { glyph: 'check', word: 'Done', live: 'background' },
  // Not the close glyph: the Dismiss control in the same row already draws
  // that X, and two identical marks one gap apart leave colour as the only
  // thing telling the error mark from a button. `alert` is the danger mark.
  error: { glyph: 'alert', word: 'Error', live: 'foreground' },
};

/**
 * How long a toast stays up, in milliseconds. An error takes longer to read
 * than a confirmation, and a toast you have to travel to and click takes
 * longer still.
 */
const MS: Record<ToastVariant, number> = { status: 5000, success: 5000, error: 8000 };
const MS_WITH_ACTION = 12000;

/**
 * Radix's default, set explicitly so the announcement can quote it: the
 * viewport's accessible name and the alt text read from the same pair, and a
 * test fails if the two ever drift.
 */
const HOTKEY = ['F8'];
const HOTKEY_LABEL = 'F8';

/**
 * How many toasts stay on screen. The viewport is pinned to the bottom of the
 * window and grows upward, so an uncapped burst pushes the oldest items (and
 * their Undo buttons) past the top edge where nothing can reach them. Past
 * this the oldest is dropped, which is also the point at which a reader has
 * lost the thread anyway.
 */
const MAX_ITEMS = 4;

/**
 * A closed toast stays in state briefly so its exit animation can run: Radix
 * keeps the node mounted while the CSS animation plays, which it cannot do if
 * React has already dropped the item. One frame longer than --ae-dur-slow.
 */
const EXIT_GRACE_MS = 260;

/** What a screen reader hears in place of the action button. */
function actionAltText(action: ToastActionSpec): string {
  return `${action.label}: press ${HOTKEY_LABEL} to move focus to notifications`;
}

/** End every fragment on a stop, so the next one does not run into it. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?:;]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The announced string, composed here rather than left to Radix.
 *
 * Radix builds its live region by walking the item's DOM, collecting the text
 * of each part and concatenating the pieces with nothing in between, which
 * ran the variant word straight into the message: "Notification ErrorNope",
 * "Notification Role deletedUndo: press F8". Sighted users get the whitespace
 * from the layout; the live region got none of it.
 */
function announcement(message: string, variant: ToastVariant, action?: ToastActionSpec): string {
  const parts = [VARIANT[variant].word, message, action && actionAltText(action)];
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(sentence)
    .join(' ');
}

interface QueueItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastActionSpec;
  duration: number;
  open: boolean;
}

const ToastApiContext = createContext<ToastApi | null>(null);

/** Fire a toast. Must be called under a <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastApiContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

// ── Toast (presentational item) ──────────────────────────────────────────────
export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  action?: ToastActionSpec;
  /** Milliseconds before auto dismiss. Radix pauses this on hover and focus. */
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which axis the swipe offset follows; set by the provider. */
  swipeAxis?: 'x' | 'y';
  /** Compatibility hook for an application migrating an existing selector. */
  className?: string;
  /** Provider-controlled compatibility mode; prefer the default Radix announcer. */
  announcementMode?: ToastAnnouncementMode;
}
export function Toast({
  message,
  variant = 'status',
  action,
  duration,
  open,
  onOpenChange,
  swipeAxis = 'x',
  className,
  announcementMode = 'radix',
}: ToastProps) {
  const meta = VARIANT[variant];
  return (
    <RadixToast.Root
      className={cn('vt-toast', variant !== 'status' && `vt-toast--${variant}`, className)}
      data-variant={variant}
      data-swipe-axis={swipeAxis}
      type={meta.live}
      duration={duration}
      open={open}
      onOpenChange={onOpenChange}
    >
      {/* One wrapper carries the whole announcement, so Radix reads the
          sentence we wrote instead of gluing the parts together itself. The
          two attributes are Radix's own contract, the same pair its
          <Action altText> uses: an excluded subtree contributes its alt text
          and nothing else. Visually it is only the flex row. */}
      <div
        className="vt-toast__row"
        role={
          announcementMode === 'item'
            ? meta.live === 'foreground'
              ? 'alert'
              : 'status'
            : undefined
        }
        aria-live={
          announcementMode === 'item'
            ? meta.live === 'foreground'
              ? 'assertive'
              : 'polite'
            : undefined
        }
        aria-atomic={announcementMode === 'item' || undefined}
        data-radix-toast-announce-exclude=""
        data-radix-toast-announce-alt={announcement(message, variant, action)}
      >
        {meta.glyph && (
          <span className="vt-toast__glyph" aria-hidden>
            <Glyph name={meta.glyph} size={14} />
          </span>
        )}
        <div className="vt-toast__body">
          {meta.word && <RadixToast.Title className="vt-toast__word">{meta.word}</RadixToast.Title>}
          <RadixToast.Description className="vt-toast__msg">{message}</RadixToast.Description>
        </div>
        {action && (
          <RadixToast.Action
            className="vt-toast__action"
            altText={actionAltText(action)}
            onClick={action.onAction}
          >
            {action.label}
          </RadixToast.Action>
        )}
        <RadixToast.Close className="vt-toast__x" aria-label="Dismiss">
          <Glyph name="close" size={12} />
        </RadixToast.Close>
      </div>
    </RadixToast.Root>
  );
}

// ── ToastProvider ────────────────────────────────────────────────────────────
export interface ToastProviderProps {
  children: ReactNode;
  /** Direction a pointer swipe dismisses in. Defaults to the viewport corner. */
  swipeDirection?: ToastSwipeDirection;
  /** Applied to every toast while a host app migrates legacy selectors. */
  itemClassName?: string;
  /**
   * `radix` uses Radix's delayed, portalled announcer. `item` keeps legacy
   * role=status/alert selectors on the visible item while preserving the
   * queue, focus pause, hotkey, and swipe behavior.
   */
  announcementMode?: ToastAnnouncementMode;
}
export function ToastProvider({
  children,
  swipeDirection = 'right',
  itemClassName,
  announcementMode = 'radix',
}: ToastProviderProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const seq = useRef(0);
  const removals = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // In item mode the visible toast is the live region. Keep Radix's own
  // announcer out of the document so the same sentence is not spoken twice.
  const detachedAnnouncer = useMemo(
    () =>
      announcementMode === 'item' && typeof document !== 'undefined'
        ? document.createDocumentFragment()
        : undefined,
    [announcementMode],
  );

  const close = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, open: false } : i)));
    if (removals.current.has(id)) return;
    removals.current.set(
      id,
      setTimeout(() => {
        removals.current.delete(id);
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, EXIT_GRACE_MS),
    );
  }, []);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    const variant = options?.variant ?? 'status';
    const action = options?.action;
    seq.current += 1;
    const id = `vt-toast-${seq.current}`;
    // Functional update, so two calls in the same tick both land instead of
    // the second overwriting the first.
    setItems((prev) => {
      const next = [
        ...prev,
        {
          id,
          message,
          variant,
          action,
          duration: options?.duration ?? (action ? MS_WITH_ACTION : MS[variant]),
          open: true,
        },
      ];
      // Oldest out first, and dropped outright rather than closed: an item
      // this far up the stack has been on screen longest and its exit is the
      // one nobody is watching.
      return next.length > MAX_ITEMS ? next.slice(next.length - MAX_ITEMS) : next;
    });
  }, []);

  // Unmounting mid exit leaves one removal timer per closing toast pointing at
  // a setState that has nowhere to land. Drop them with the provider.
  useEffect(() => {
    const pending = removals.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);
  const swipeAxis = swipeDirection === 'up' || swipeDirection === 'down' ? 'y' : 'x';

  return (
    <ToastApiContext.Provider value={api}>
      <RadixToast.Provider
        swipeDirection={swipeDirection}
        label="Notification"
        announcerContainer={detachedAnnouncer}
      >
        {children}
        {items.map((item) => (
          <Toast
            key={item.id}
            message={item.message}
            variant={item.variant}
            action={item.action}
            duration={item.duration}
            className={itemClassName}
            announcementMode={announcementMode}
            open={item.open}
            onOpenChange={(next) => {
              if (!next) close(item.id);
            }}
            swipeAxis={swipeAxis}
          />
        ))}
        {/* Mounted once, always, empty or not: a live region that appears at
            the same moment as its first message is routinely missed. */}
        <RadixToast.Viewport
          className="vt-toast-viewport"
          hotkey={HOTKEY}
          aria-live={announcementMode === 'item' ? 'polite' : undefined}
          aria-relevant={announcementMode === 'item' ? 'additions text' : undefined}
        />
      </RadixToast.Provider>
    </ToastApiContext.Provider>
  );
}
