/**
 * Overlay primitives on Radix (dialog semantics, focus trap, Esc, aria for
 * free). Animation is CSS-only via data-state attributes at --ae-dur/--ae-ease
 * so this package carries no animation runtime.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Button } from './components.js';
import { Glyph, type GlyphName } from './glyphs.js';
import { cn } from './lib/cn.js';

// ── Modal ────────────────────────────────────────────────────────────────────
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
  /** Extra content beside the title (chips, provenance). */
  titleAccessory?: ReactNode;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  titleAccessory,
}: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="vt-overlay" />
        <RadixDialog.Content
          className={cn('vt-modal', size !== 'md' && `vt-modal--${size}`)}
          onOpenAutoFocus={(e) => {
            // Focus the first form control rather than the close button.
            const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
              'input, textarea, select, [role="combobox"]',
            );
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <div className="vt-modal__head">
            <RadixDialog.Title className="vt-modal__title">{title}</RadixDialog.Title>
            {titleAccessory}
            <RadixDialog.Close asChild>
              <button type="button" className="vt-modal__x" aria-label="Close">
                <Glyph name="close" size={14} />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="vt-modal__desc">{description}</RadixDialog.Description>
          ) : (
            // Radix warns without a description; provide an empty one.
            <RadixDialog.Description className="u-visually-hidden">{title}</RadixDialog.Description>
          )}
          <div className="vt-modal__body">{children}</div>
          {footer && <div className="vt-modal__foot">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ── CommandOverlay ───────────────────────────────────────────────────────────
/**
 * The centred command-palette surface (⌘K capture, ⌘P switcher, composer,
 * interaction logger).
 *
 * FR-022: these were hand-rolled `<div className="overlay-backdrop">` stacks.
 * no dialog role, no accessible name, no focus containment, and focus was not
 * restored to the trigger on close. Screen-reader users got an unannounced
 * change of context, and keyboard users could tab straight out of the palette
 * into the page behind it. This keeps the exact same visual surface and hands
 * the semantics to Radix.
 *
 * `labelledBy` lets a palette use its own visible input/heading as the
 * accessible name; otherwise `title` is rendered visually hidden.
 */
export interface CommandOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the dialog (announced on open). */
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra class on the panel (e.g. 'overlay--wide'). */
  className?: string;
}
export function CommandOverlay({ open, onOpenChange, title, description, children, className }: CommandOverlayProps) {
  // Radix restores focus from the Content's unmount effect. Every caller
  // conditionally renders the whole palette (`{open && <QuickAdd/>}`) so the
  // Root is torn down in the same commit that closes it, and that effect never
  // gets to run, focus landed on <body> and keyboard users lost their place,
  // despite this component's docblock promising otherwise. Remembering the
  // opener here survives the unmount.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  useEffect(
    () => () => {
      const el = opener.current;
      if (el?.isConnected) el.focus();
    },
    [],
  );

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* Same backdrop token as every other dialog. The legacy one was
            rgba(4,4,3,0.6), which under-dimmed enough that the page behind
            competed with the palette for attention. */}
        <RadixDialog.Overlay className="vt-overlay" />
        <RadixDialog.Content
          className={cn('vt-palette', className)}
          onOpenAutoFocus={(e) => {
            // Focus the palette's own input, not the first button in the list.
            const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('input, textarea');
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <RadixDialog.Title className="u-visually-hidden">{title}</RadixDialog.Title>
          <RadixDialog.Description className="u-visually-hidden">{description ?? title}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ── Sheet (right-side panel) ─────────────────────────────────────────────────
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}
export function Sheet({ open, onOpenChange, title, children, footer, wide }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="vt-overlay" />
        <RadixDialog.Content className={cn('vt-sheet', wide && 'vt-sheet--wide')}>
          <div className="vt-modal__head">
            <RadixDialog.Title className="vt-modal__title">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button type="button" className="vt-modal__x" aria-label="Close">
                <Glyph name="close" size={14} />
              </button>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description className="u-visually-hidden">{title}</RadixDialog.Description>
          <div className="vt-sheet__body">{children}</div>
          {footer && <div className="vt-modal__foot">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ── ConfirmDialog ────────────────────────────────────────────────────────────
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  busy?: boolean;
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  busy,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            className={destructive ? 'vt-btn--danger-fill' : undefined}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="vt-modal__confirm-body">{body}</div>}
    </Modal>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={300}>{children}</RadixTooltip.Provider>;
}
export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="vt-tooltip" side={side} sideOffset={6}>
          {content}
          <RadixTooltip.Arrow className="vt-tooltip__arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

// ── Menu (dropdown with grouped items, keyboard nav from Radix) ─────────────
export interface MenuItem {
  key: string;
  label: string;
  glyph?: GlyphName;
  mono?: boolean;
}
export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}
export interface MenuProps {
  trigger: ReactNode;
  groups: MenuGroup[];
  onSelect: (key: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  /** Lay groups out side-by-side (wide catalogs like the 28-type picker). */
  columns?: boolean;
}
export function Menu({ trigger, groups, onSelect, open, onOpenChange, align = 'end', columns }: MenuProps) {
  return (
    <RadixDropdown.Root open={open} onOpenChange={onOpenChange}>
      <RadixDropdown.Trigger asChild>{trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className={columns ? 'vt-menu vt-menu--columns' : 'vt-menu'}
          align={align}
          sideOffset={6}
        >
          {groups.map((g, gi) => (
            <div key={g.label ?? gi} className="vt-menu__group">
              {g.label && <RadixDropdown.Label className="vt-menu__label">{g.label}</RadixDropdown.Label>}
              {g.items.map((item) => (
                <RadixDropdown.Item
                  key={item.key}
                  className={item.mono ? 'vt-menu__item u-mono' : 'vt-menu__item'}
                  onSelect={() => onSelect(item.key)}
                >
                  {item.glyph && <Glyph name={item.glyph} size={14} />}
                  {item.label}
                </RadixDropdown.Item>
              ))}
            </div>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────
export interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  wide?: boolean;
}
export function Popover({ open, onOpenChange, trigger, children, side = 'bottom', align = 'start', wide }: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className={cn('vt-popover', wide && 'vt-popover--wide')} side={side} align={align} sideOffset={6}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

// ── HelpTip ──────────────────────────────────────────────────────────────────
/**
 * A small "(?)" affordance carrying a tooltip, the consistent way to explain a
 * label, score, or field inline. Wraps the Radix Tooltip so hover/focus/Esc and
 * aria come for free. Needs a TooltipProvider ancestor (mounted app-wide).
 */
export interface HelpTipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Accessible label for the trigger (defaults to "More information"). */
  label?: string;
}
export function HelpTip({ content, side = 'top', label = 'More information' }: HelpTipProps) {
  return (
    <Tooltip content={content} side={side}>
      <button type="button" className="vt-helptip" aria-label={label}>
        <span aria-hidden>?</span>
      </button>
    </Tooltip>
  );
}

// ── InfoPopover ──────────────────────────────────────────────────────────────
/**
 * A "How this works" panel for page headers: a heading + body, plus an optional
 * keyboard-shortcut list. Click-triggered (unlike HelpTip) so longer guidance
 * stays readable. Built on the Popover primitive.
 */
export interface InfoPopoverShortcut {
  keys: string;
  label: string;
}
export interface InfoPopoverProps {
  title: string;
  children: ReactNode;
  shortcuts?: InfoPopoverShortcut[];
  /** Trigger label; defaults to a "How this works" pill. */
  triggerLabel?: string;
}
export function InfoPopover({ title, children, shortcuts, triggerLabel = 'How this works' }: InfoPopoverProps) {
  return (
    <Popover
      wide
      trigger={
        <button type="button" className="vt-info-trigger">
          <span aria-hidden>?</span>
          {triggerLabel}
        </button>
      }
    >
      <div className="vt-info">
        <div className="vt-info__title">{title}</div>
        <div className="vt-info__body">{children}</div>
        {shortcuts && shortcuts.length > 0 && (
          <div className="vt-info__shortcuts">
            {shortcuts.map((s) => (
              <div key={s.keys} className="vt-info__shortcut">
                <kbd className="vt-kbd">{s.keys}</kbd>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}

// ── PageHeader ───────────────────────────────────────────────────────────────
/**
 * The standard route header: title + one-line subtitle, an optional
 * "How this works" InfoPopover, and a right-aligned primary-action slot. Gives
 * every screen a consistent way to explain itself and expose its main action.
 */
export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Pass an <InfoPopover/> (or any node) for contextual help. */
  help?: ReactNode;
  /** Primary action(s), right-aligned (e.g. a "New résumé" button). */
  actions?: ReactNode;
}
export function PageHeader({ title, subtitle, help, actions }: PageHeaderProps) {
  return (
    <header className="vt-pagehead">
      <div className="vt-pagehead__main">
        <div className="vt-pagehead__titlerow">
          <h1 className="vt-pagehead__title">{title}</h1>
          {help}
        </div>
        {subtitle && <p className="vt-pagehead__sub">{subtitle}</p>}
      </div>
      {actions && <div className="vt-pagehead__actions">{actions}</div>}
    </header>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────
/**
 * A titled region inside a page. Regions are separated by a heading and space,
 * not by card chrome, a screen of bordered boxes all at the same weight has no
 * hierarchy, which is what Today looked like before Screen 2.
 *
 * Labelled, so each one is a landmark a screen reader can jump between instead
 * of one undifferentiated run of rows.
 */
export interface SectionProps {
  title: string;
  /** Rendered in mono beside the title, a count, a total. */
  meta?: ReactNode;
  /** Right-aligned controls for this region only. */
  actions?: ReactNode;
  children: ReactNode;
}
export function Section({ title, meta, actions, children }: SectionProps) {
  const id = useId();
  return (
    <section className="vt-section" aria-labelledby={id}>
      <div className="vt-section__head">
        <h2 id={id} className="vt-section__title u-display">
          {title}
          {meta != null && <span className="vt-section__meta u-mono">{meta}</span>}
        </h2>
        {actions && <div className="vt-section__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// ── RegisterRule ─────────────────────────────────────────────────────────────
/**
 * The register rule (brand-book ch.06), the hairline under a page header,
 * carrying ticks that encode something *true* about the page: revisions of a
 * record, days of the current week, decade boundaries on the timeline. It is
 * structural, never decorative.
 *
 * A screen with nothing true to encode passes no `ticks` and gets a plain
 * rule. Faking ticks is worse than having none, so there is deliberately no
 * "how many ticks would look nice" prop.
 */
export interface RegisterTick {
  /** 0-1 position along the rule. */
  at: number;
  /** Names this tick for assistive tech; the active one is announced. */
  label: string;
}
export interface RegisterRuleProps {
  ticks?: RegisterTick[];
  /** Index into `ticks` that is "here". Only this tick takes the accent. */
  activeIndex?: number;
  /** What the ticks mean, e.g. "Days of this week". Required when ticks exist. */
  label?: string;
}
export function RegisterRule({ ticks, activeIndex, label }: RegisterRuleProps) {
  if (!ticks?.length) return <div className="vt-register" aria-hidden />;
  const active = activeIndex != null ? ticks[activeIndex] : undefined;
  return (
    <div className="vt-register" role="img" aria-label={label && active ? `${label}: ${active.label}` : label}>
      {ticks.map((t, i) => (
        <i
          // Keyed by position, not label: ticks never reorder, and labels are
          // not guaranteed unique (two interactions of the same kind on the
          // same day can share a label), which is a duplicate-key warning
          // and, worse, lets React reuse the wrong node.
          key={i}
          className={cn('vt-register__tick', i === activeIndex && 'vt-register__tick--on')}
          style={{ left: `${t.at * 100}%` }}
        />
      ))}
    </div>
  );
}
