/**
 * Layout composites: the shapes every screen already draws by hand.
 *
 * A class-vocabulary audit found the app's five most-used composites (`.row`,
 * `.card`, `.stack`, `.hstack`, `.spread`) living entirely in
 * apps/web/src/styles/app.css, which is how six different list-row
 * implementations came to exist and how `--ae-row-h` ended up a token with no
 * consumer. These are those composites, with the accessibility bugs the
 * hand-rolled versions carried fixed once here rather than twenty times there.
 *
 * Styles live in styles/layout.css. Animation is CSS only, driven by
 * `aria-expanded`, `aria-selected` and the `hidden` attribute, so this package
 * still carries no animation runtime (see the header of overlay.tsx).
 *
 * Every component spreads its rest props onto its root and merges `className`
 * through `cn`. A primitive that silently drops `role`, `aria-label` or
 * `data-testid` is a bug, not a simplification; see the note on Mono in
 * components.tsx.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Glyph, type GlyphName } from './glyphs.js';
import { cn } from './lib/cn.js';

// ── Shared scale types ───────────────────────────────────────────────────────
/**
 * The spacing steps that exist. The scale deliberately skips 7: there is no
 * `--ae-space-7`, so the type will not let a caller ask for one.
 */
export type LayoutGap = 1 | 2 | 3 | 4 | 5 | 6 | 8;
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** `vt-stack--gap-3`, `vt-inline--align-baseline`, and so on. */
function mod(base: string, name: string, value: string | number | undefined): string | undefined {
  return value == null ? undefined : `${base}--${name}-${value}`;
}

// ── Row ──────────────────────────────────────────────────────────────────────
/** What `main` is handed: apply both to whatever element you return. */
export interface RowMainRenderProps {
  className: string;
  children: ReactNode;
}

export interface RowProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** `li` when the row sits in a real list; the caller owns the `ul`. */
  as?: 'div' | 'li';
  /** Hover tone. Tone, never travel: hover is not a state change (ch.08). */
  interactive?: boolean;
  /**
   * Marks the row as the chosen one, in words as well as in ground tone.
   *
   * A selected row used to be a class, a `data-selected` attribute, a
   * background and a 2px bar, none of which any assistive technology can
   * read: a data attribute has no accessibility semantics at all, so the
   * state existed for sighted users only (IDENTITY.md non-negotiable 6).
   *
   * What gets emitted depends on the role the caller gave the row:
   *
   * - a role from a selectable collection (`option`, `row`, `gridcell`,
   *   `treeitem`, `tab`, `columnheader`, `rowheader`) gets `aria-selected`,
   *   set on every row in the collection so "not selected" is stated too;
   * - anything else gets `aria-current="true"`, which is the honest meaning
   *   of a master/detail list: this is the row whose detail is showing.
   *
   * Either way the row also grows a check glyph and the word for its state,
   * so the selection survives being read without colour.
   */
  selected?: boolean;
  /** Checkbox, entity glyph, charge ring. Stays outside the click target. */
  leading?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned value: a date, a count, a cadence. */
  meta?: ReactNode;
  /** Controls. Rendered outside `main`, which is the whole point of it. */
  actions?: ReactNode;
  /** Free slot between the main region and the meta: chips, a strength bar. */
  children?: ReactNode;
  /**
   * Makes the title/subtitle region, and only that region, the click target.
   *
   * The rows this replaces wrapped the *entire* row in one link, so the link's
   * accessible name was its glyph, title, subtitle, every chip, the strength
   * bar and the date read out as one string, and any button inside it was a
   * control nested in a link. Scoping the target to the main region gives the
   * link the name a person would give it, and keeps `actions` operable.
   *
   * The design system must not depend on the router, so the element is the
   * caller's:
   *
   * ```tsx
   * <Row main={(p) => <Link to={href} {...p} />} title={person.title} />
   * ```
   */
  main?: (props: RowMainRenderProps) => ReactNode;
}

/**
 * The roles for which `aria-selected` is an allowed attribute. On anything
 * else it is invalid ARIA and axe fails the page for it, which is why the
 * fallback below is `aria-current` rather than `aria-selected` everywhere.
 */
const ROW_SELECTABLE_ROLES = new Set([
  'option',
  'row',
  'gridcell',
  'treeitem',
  'tab',
  'columnheader',
  'rowheader',
]);

export const Row = forwardRef<HTMLElement, RowProps>(function Row(
  {
    as = 'div',
    interactive,
    selected,
    leading,
    title,
    subtitle,
    meta,
    actions,
    children,
    main,
    className,
    ...rest
  },
  ref,
) {
  const label = (
    <>
      {title != null && <span className="vt-row__title">{title}</span>}
      {subtitle != null && <span className="vt-row__sub">{subtitle}</span>}
    </>
  );
  // Rendered only when there is something to put in it: an empty `flex: 1`
  // region would silently shove a children-only row's content to the right.
  const hasMain = main != null || title != null || subtitle != null;
  const mainRegion = !hasMain ? null : main ? (
    main({ className: 'vt-row__main', children: label })
  ) : (
    <div className="vt-row__main">{label}</div>
  );

  const explicitRole = typeof rest.role === 'string' ? rest.role : undefined;
  const inCollection = explicitRole != null && ROW_SELECTABLE_ROLES.has(explicitRole);

  const rootProps: HTMLAttributes<HTMLElement> & { 'data-selected'?: 'true' } = {
    className: cn(
      'vt-row',
      interactive && 'vt-row--interactive',
      selected && 'vt-row--selected',
      className,
    ),
    ...rest,
  };
  // A caller who states the ARIA themselves keeps it; otherwise the row says
  // what its own `selected` prop means for the role it is playing.
  if (inCollection) {
    if (rootProps['aria-selected'] == null) rootProps['aria-selected'] = selected ?? false;
  } else if (selected && rootProps['aria-current'] == null) {
    rootProps['aria-current'] = true;
  }
  // A styling and query hook, nothing more. This attribute is invisible to
  // assistive tech, so it is never what conveys the state; the ARIA above and
  // the flag below are.
  if (selected) rootProps['data-selected'] = 'true';

  const body = (
    <>
      {leading != null && <span className="vt-row__leading">{leading}</span>}
      {/* The glyph is the sighted mark, so the state is never carried by the
          accent ground alone. There is deliberately no visually hidden word
          beside it: every role in ROW_SELECTABLE_ROLES computes its name from
          its content, so a hidden "Selected" is concatenated into the name
          with no separator and a row reads as "SelectedLina Farouk". The
          aria-selected / aria-current above is what states the row's state to
          assistive tech, and it states it as a state rather than as part of
          the name. */}
      {selected && (
        <span className="vt-row__flag">
          <Glyph name="check" size={13} />
        </span>
      )}
      {mainRegion}
      {children}
      {meta != null && <span className="vt-row__meta">{meta}</span>}
      {actions != null && <span className="vt-row__actions">{actions}</span>}
    </>
  );

  return as === 'li' ? (
    <li ref={ref as Ref<HTMLLIElement>} {...rootProps}>
      {body}
    </li>
  ) : (
    <div ref={ref as Ref<HTMLDivElement>} {...rootProps}>
      {body}
    </div>
  );
});

// ── Card ─────────────────────────────────────────────────────────────────────
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Presentational only, and deliberately so: it buys the hover border and
   * nothing else. Card renders a `div` with no role, no `tabIndex` and no key
   * handling, and this flag adds none of them.
   *
   * So it is never what makes a card clickable. Hanging an `onClick` on the
   * card and setting `interactive` gives you a mouse-only control that no
   * keyboard and no screen reader can operate. Put a real `<button>` or `<a>`
   * inside the card (usually around the title), and set `interactive` so the
   * whole card reports that the control inside it is under the cursor.
   *
   * The gate exists because the app's `.card:hover` had none, so a static
   * panel lit up under the cursor and reported nothing: hover feedback on a
   * thing that does not respond is a promise the card cannot keep.
   */
  interactive?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, title, actions, children, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('vt-card', interactive && 'vt-card--interactive', className)}
      {...rest}
    >
      {(title != null || actions != null) && (
        <div className="vt-card__head">
          {/* Not a heading element. A card sits inside a Section that already
              carries the h2, and promoting every card title to an h3 would
              fabricate a document outline the page does not actually have. */}
          {title != null && <div className="vt-card__title">{title}</div>}
          {actions != null && <div className="vt-card__actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
});

// ── Stack / Inline / Spread / ChipGroup ──────────────────────────────────────
export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: LayoutGap;
  align?: LayoutAlign;
}

/** Vertical flow. This is `.stack`. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { gap = 3, align, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('vt-stack', mod('vt-stack', 'gap', gap), mod('vt-stack', 'align', align), className)}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  gap?: LayoutGap;
  align?: LayoutAlign;
  wrap?: boolean;
}

/** Horizontal flow. This is `.hstack`. */
export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  { gap = 2, align, wrap, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'vt-inline',
        mod('vt-inline', 'gap', gap),
        mod('vt-inline', 'align', align),
        wrap && 'vt-inline--wrap',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface SpreadProps extends HTMLAttributes<HTMLDivElement> {
  gap?: LayoutGap;
  align?: LayoutAlign;
}

/** Two ends of a line, space between. This is `.spread`. */
export const Spread = forwardRef<HTMLDivElement, SpreadProps>(function Spread(
  { gap = 2, align, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'vt-spread',
        mod('vt-spread', 'gap', gap),
        mod('vt-spread', 'align', align),
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface ChipGroupProps extends HTMLAttributes<HTMLDivElement> {
  gap?: LayoutGap;
}

/** A wrapping run of chips. This is `.chips`. */
export const ChipGroup = forwardRef<HTMLDivElement, ChipGroupProps>(function ChipGroup(
  { gap = 2, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('vt-chipgroup', mod('vt-chipgroup', 'gap', gap), className)}
      {...rest}
    >
      {children}
    </div>
  );
});

// ── Banner ───────────────────────────────────────────────────────────────────
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * One shape per tone, so the four banners are told apart by outline and not
 * only by hue (IDENTITY.md non-negotiable 6: never colour-alone).
 */
// Four tones, four shapes. Danger is deliberately not `close`: the Dismiss
// control in the same row draws that X, and two identical marks one gap apart
// leave colour as the only thing telling the state from the button, which is
// the exact failure IDENTITY.md non-negotiable 6 exists to prevent.
const BANNER_GLYPH: Record<BannerTone, GlyphName> = {
  info: 'ask',
  success: 'check',
  warning: 'bell',
  danger: 'alert',
};

/**
 * And one word per tone, for anyone who gets the banner as text. It is
 * visually hidden because the title beside it already says the same thing in
 * sighted terms, but without it the tone is carried by pixels alone.
 */
const BANNER_WORD: Record<BannerTone, string> = {
  info: 'Note',
  success: 'Success',
  warning: 'Warning',
  danger: 'Error',
};

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  /** The way out of the state the banner reports: a button, a link. */
  action?: ReactNode;
  onDismiss?: () => void;
}

export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { tone = 'info', title, children, action, onDismiss, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('vt-banner', `vt-banner--${tone}`, className)}
      // A failure interrupts; the other three wait to be read.
      role={tone === 'danger' ? 'alert' : 'status'}
      {...rest}
    >
      <span className="vt-banner__glyph">
        <Glyph name={BANNER_GLYPH[tone]} size={16} />
      </span>
      <div className="vt-banner__body">
        <span className="u-visually-hidden">{BANNER_WORD[tone]}</span>
        {title != null && <div className="vt-banner__title">{title}</div>}
        {children != null && <div className="vt-banner__text">{children}</div>}
      </div>
      {action != null && <div className="vt-banner__action">{action}</div>}
      {onDismiss && (
        <button type="button" className="vt-banner__x" aria-label="Dismiss" onClick={onDismiss}>
          <Glyph name="close" size={13} />
        </button>
      )}
    </div>
  );
});

// ── Disclosure ───────────────────────────────────────────────────────────────
export interface DisclosureProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** What is inside, in words. This is the button's accessible name. */
  label: ReactNode;
  /**
   * A count or total beside the label, in mono. Rendered as a sibling of the
   * trigger rather than inside it: a `12` inside the button concatenated onto
   * the label with no separator and the accessible name came out as
   * "Provenance12", which is not the name this component promises.
   */
  meta?: ReactNode;
  /** Uncontrolled starting state. */
  defaultOpen?: boolean;
  /** Pass to control it; then `onOpenChange` is the only way it moves. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export const Disclosure = forwardRef<HTMLDivElement, DisclosureProps>(function Disclosure(
  { label, meta, defaultOpen = false, open, onOpenChange, children, className, ...rest },
  ref,
) {
  const uid = useId();
  const panelId = `vt-disclosure-panel-${uid}`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggle() {
    const next = !isOpen;
    if (open == null) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div ref={ref} className={cn('vt-disclosure', className)} {...rest}>
      <div className="vt-disclosure__head">
        <button
          type="button"
          className="vt-disclosure__trigger"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="vt-disclosure__chev">
            <Glyph name="chevron-down" size={14} />
          </span>
          <span className="vt-disclosure__label">{label}</span>
        </button>
        {meta != null && <span className="vt-disclosure__meta u-mono">{meta}</span>}
      </div>
      {/* The panel is always in the DOM, hidden rather than unmounted, so
          `aria-controls` never points at an element that is not there. */}
      <div id={panelId} className="vt-disclosure__panel" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
});

// ── Tabs ─────────────────────────────────────────────────────────────────────
/** Anything the browser will stop on when Tab is pressed. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

export interface TabItem {
  value: string;
  label: ReactNode;
  glyph?: GlyphName;
  /** Rendered in mono beside the label. */
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Names the strip, e.g. "Person sections". */
  label?: string;
  /** The selected tab's content. Omit to render the strip on its own. */
  children?: ReactNode;
}

/**
 * A tab strip with the roles and the keyboard the pattern requires: one tab
 * stop for the whole strip (roving tabindex), arrows to move between tabs,
 * Home/End to reach the ends. The six hand-rolled strips in the app were runs
 * of plain buttons, so a keyboard user tabbed through every one of them and a
 * screen reader was never told which was current.
 *
 * Selection follows focus, which is the right choice when the panel is already
 * rendered and switching costs nothing.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { tabs, value, onChange, label, children, className, ...rest },
  ref,
) {
  const uid = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = `vt-tabs-panel-${uid}`;
  const tabId = (v: string) => `vt-tabs-tab-${uid}-${v}`;
  const hasPanel = children != null;
  const current = tabs.findIndex((t) => t.value === value);
  // Where the strip's single tab stop lives. Deriving it from selection alone
  // put every tab at -1 whenever `value` matched no tab, which took the whole
  // strip out of the tab order: Tab skipped past it, so the keyboard handler
  // below could never fire and the unmatched case it handles was unreachable.
  // With no match the first tab holds the stop, so the strip is always enterable.
  const focusIndex = current >= 0 ? current : 0;

  // The APG puts tabindex="0" on a tabpanel only when the panel holds no
  // focusable element of its own. A panel that is always focusable adds a
  // redundant stop in front of its own content, so its first control is
  // reached one Tab later than it should be. Measured after paint because
  // whether the children are focusable is a fact about the DOM, not the props.
  const [panelIsTabStop, setPanelIsTabStop] = useState(false);
  useEffect(() => {
    const el = panelRef.current;
    setPanelIsTabStop(el != null && el.querySelector(FOCUSABLE_SELECTOR) == null);
  });

  function move(to: number) {
    const next = tabs[to];
    if (!next) return;
    onChange(next.value);
    tabRefs.current[to]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (tabs.length === 0) return;
    const from = focusIndex;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move((from + 1) % tabs.length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move((from - 1 + tabs.length) % tabs.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(tabs.length - 1);
    }
  }

  return (
    <div ref={ref} className={cn('vt-tabs', className)} {...rest}>
      <div role="tablist" aria-label={label} className="vt-tabs__list" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const isCurrent = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.value)}
              aria-selected={isCurrent}
              aria-controls={hasPanel ? panelId : undefined}
              // Roving: the strip is one tab stop, not one per tab.
              tabIndex={i === focusIndex ? 0 : -1}
              className="vt-tabs__tab"
              onClick={() => onChange(tab.value)}
            >
              {tab.glyph && <Glyph name={tab.glyph} size={14} />}
              {tab.label}
              {tab.count != null && <span className="vt-tabs__count u-mono">{tab.count}</span>}
            </button>
          );
        })}
      </div>
      {hasPanel && (
        <div
          id={panelId}
          ref={panelRef}
          role="tabpanel"
          // Named by its tab when there is one. With no matching tab that
          // IDREF would dangle and the panel would lose its name entirely, so
          // the strip's own name stands in.
          aria-labelledby={current >= 0 ? tabId(value) : undefined}
          aria-label={current >= 0 ? undefined : label}
          // A tab stop only when the panel holds nothing focusable of its own,
          // which is what the APG actually says. See the note above.
          tabIndex={panelIsTabStop ? 0 : undefined}
          className="vt-tabs__panel"
        >
          {children}
        </div>
      )}
    </div>
  );
});
