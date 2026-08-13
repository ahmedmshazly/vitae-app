/**
 * Combobox: one autocomplete, with the ARIA contract written once.
 *
 * The app grew four autocompletes at four levels of correctness. The command
 * palette had the whole contract (`aria-controls`, `aria-activedescendant`,
 * `role=listbox`/`option`, `scrollIntoView({ block: 'nearest' })`); the entity
 * picker had the contract but no portal, so its list clipped inside a Sheet;
 * the two suggest inputs announced `aria-expanded` and nothing else, so a
 * screen-reader user was told a list had appeared and never told what was in
 * it. All three hand-rolled a `document` mousedown listener, which is not a
 * dismissal *stack*: Escape inside a dialog closed the dialog and the list at
 * once, and an outside click could close the wrong layer.
 *
 * This is presentational. It takes items, a value, a query and callbacks. It
 * does not fetch, does not debounce, and does not decide what a match is: a
 * primitive that owns a network call cannot be reused by the next screen that
 * needs the same keyboard behaviour over a different endpoint. That also means
 * a failed search is the caller's to report, which is why `error` exists:
 * swallowing a dead endpoint into an empty list tells the user their record
 * does not exist, which is a lie.
 *
 * Portalling is Radix Popover rather than a hand-rolled portal, so the layer
 * joins the same dismissal stack as Modal, Sheet, Menu and Tooltip: Escape
 * closes the innermost layer only, and the dialog behind it stays open.
 *
 * Nothing is current until the user makes it current. Opening the list marks
 * no option, arrowing or hovering marks one, and only then does Tab commit.
 * A highlight the user never moved to is a value the caller would receive from
 * a field the user only passed through, which is the same silent commit the
 * blur timers in the replaced implementations produced.
 *
 * Animation is CSS in styles/combobox.css, keyed off the Radix `data-state`
 * attribute, so this package still carries no animation runtime.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { Glyph } from './glyphs.js';
import { cn } from './lib/cn.js';

/**
 * `create` renders the "Create '<typed text>'" affordance three of the four
 * replaced implementations offered. It is a distinct kind rather than a
 * caller-styled item so it can never be confused with a real match.
 */
export type ComboboxItemKind = 'item' | 'create';

export interface ComboboxItem {
  /** Stable identity, unique within `items`. Handed back to `onSelect`. */
  value: string;
  /** The visible primary line. */
  label: string;
  /** Second line: the disambiguator two records with one title need. */
  description?: string;
  /** Right-aligned metadata (a type, a count). Rendered mono. */
  meta?: ReactNode;
  /** Leading glyph. A `create` item gets a plus when this is omitted. */
  glyph?: ReactNode;
  kind?: ComboboxItemKind;
  /** Skipped by the arrow keys and unselectable, e.g. a create already in flight. */
  disabled?: boolean;
  /**
   * The word beside the disabled glyph, so the state is never tone alone
   * (IDENTITY 6). Say why when you know: "Creating…", "Already linked".
   */
  disabledReason?: string;
}

export interface ComboboxProps {
  /**
   * Accessible name for the input and its list. Required: an unnamed control
   * is announced as "edit blank". Match the visible label when there is one.
   */
  label: string;
  items: ComboboxItem[];
  /** The current text. Owned by the caller, this component never edits it. */
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: ComboboxItem) => void;
  /** The chosen item's value, marked with a check and the word "Selected". */
  value?: string | null;
  /** Controlled popup state. Omit to let the component own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A search is in flight. Announced, and never mistaken for "no results". */
  loading?: boolean;
  /** The search failed. Rendered as an alert, not as an empty list. */
  error?: ReactNode;
  /** Shown when a typed query matched nothing. Pass `null` to show nothing. */
  emptyMessage?: ReactNode;
  loadingMessage?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  mono?: boolean;
  autoFocus?: boolean;
  /** Open the list when the input takes focus. Default true. */
  openOnFocus?: boolean;
  /** Stay open after a pick, for inputs that collect several values. */
  keepOpenOnSelect?: boolean;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  /**
   * Runs before the built-in key handling. Call `preventDefault()` to take a
   * key over entirely (a tag input claiming Backspace, say).
   */
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function Combobox({
  label,
  items,
  query,
  onQueryChange,
  onSelect,
  value,
  open: openProp,
  onOpenChange,
  loading,
  error,
  emptyMessage = 'No matches.',
  loadingMessage = 'Searching…',
  placeholder,
  id,
  disabled,
  invalid,
  mono,
  autoFocus,
  openOnFocus = true,
  keepOpenOnSelect,
  side = 'bottom',
  align = 'start',
  className,
  inputRef,
  onInputKeyDown,
}: ComboboxProps) {
  const [selfOpen, setSelfOpen] = useState(false);
  // The current option is remembered by value, never by slot. A caller that
  // refetches, filters or reorders hands us a new array; an index would then
  // point at whatever moved into that slot, and a Tab would commit it.
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Last place the pointer was seen, and whether the keyboard is driving. Read
  // together they tell a real mouse move apart from the mousemove a browser
  // fires when the list scrolls under a pointer that never moved. See
  // `handleOptionMouseMove`.
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const arrowing = useRef(false);

  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listboxId = `${uid}-listbox`;
  const optionId = (index: number) => `${uid}-opt-${index}`;

  // -1 means nothing is current, which is the state the list opens in. A value
  // that has left the list, or that the caller has since disabled, is not
  // current either: it must never be announced and Tab must never commit it.
  const activeIndex =
    active === null ? -1 : items.findIndex((item) => item.value === active && !item.disabled);
  // Forget it too, so a list that shrinks and regrows cannot resurrect it.
  // Adjusting state during render is the sanctioned alternative to an effect
  // here: it converges on the next line, before paint, with no second commit.
  if (active !== null && activeIndex < 0) setActive(null);

  const typed = query.trim().length > 0;
  const showEmpty = emptyMessage != null && !loading && error == null && items.length === 0 && typed;
  const hasContent = items.length > 0 || error != null || Boolean(loading) || showEmpty;
  const isOpen = openProp ?? selfOpen;
  /** The popup is only "expanded" when it has something to show. */
  const expanded = isOpen && hasContent && !disabled;

  function setOpen(next: boolean) {
    if (openProp === undefined) setSelfOpen(next);
    onOpenChange?.(next);
  }

  function firstEnabled(): number {
    return items.findIndex((item) => !item.disabled);
  }
  function lastEnabled(): number {
    for (let i = items.length - 1; i >= 0; i -= 1) if (!items[i]?.disabled) return i;
    return -1;
  }
  /** Next selectable index in `dir`. Clamps at the ends; Home/End cover them. */
  function step(from: number, dir: 1 | -1): number {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
      if (!items[i]?.disabled) return i;
    }
    return from;
  }
  /** Make index `i` current. Out of range, or gone, means nothing is current. */
  function activate(index: number) {
    setActive(items[index]?.value ?? null);
  }

  function select(item: ComboboxItem | undefined) {
    if (!item || item.disabled) return;
    onSelect(item);
    if (!keepOpenOnSelect) setOpen(false);
  }

  // Keep the active option in view when arrowing past the fold. Optional-call:
  // jsdom omits scrollIntoView on elements.
  useEffect(() => {
    if (!expanded || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, expanded]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onInputKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      arrowing.current = true;
      const down = event.key === 'ArrowDown';
      // Opening, or moving off nothing, lands on the first or last option
      // rather than stepping from a slot no option occupies.
      if (!expanded || activeIndex < 0) {
        if (!expanded) setOpen(true);
        activate(down ? firstEnabled() : lastEnabled());
        return;
      }
      activate(step(activeIndex, down ? 1 : -1));
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      // Closed, these belong to the text caret.
      if (!expanded) return;
      event.preventDefault();
      arrowing.current = true;
      const target = event.key === 'Home' ? firstEnabled() : lastEnabled();
      if (target >= 0) activate(target);
      return;
    }

    if (event.key === 'Enter') {
      const item = expanded ? items[activeIndex] : undefined;
      // Nothing is current: leave Enter alone so the surrounding form submits.
      // `activeIndex` never points at a disabled option, so there is no second
      // guard here that would swallow the key on the user's behalf.
      if (!item) return;
      event.preventDefault();
      select(item);
      return;
    }

    // Escape is deliberately absent, and this handler could not implement it
    // if it wanted to. Radix's dismissable layer listens on the document in
    // the CAPTURE phase and calls preventDefault itself, so by the time this
    // bubble-phase handler runs the innermost layer has already closed and
    // `event.defaultPrevented` is true: the guard above has returned. Escape
    // reaches this line only when there is no layer, i.e. the list is shut,
    // and claiming the key there would take it from the dialog behind us.
    // That stack is the whole reason the four hand-rolled pickers could not
    // nest.

    if (event.key === 'Tab' && expanded) {
      // WAI-ARIA: Tab commits the current option, then focus moves on. No
      // preventDefault, the move is the point. Two things are not a commit:
      // an option the user never moved to (`activeIndex` is -1 until they do),
      // and Shift+Tab, which is leaving the field backwards, past everything
      // the list offered.
      if (!event.shiftKey && activeIndex >= 0) select(items[activeIndex]);
      setOpen(false);
    }
  }

  /**
   * Hover follows the pointer, never the other way round. Arrowing the list
   * scrolls it, and a browser fires `mousemove` at unchanged coordinates when
   * content moves under a still pointer; the palette takes that as a hover and
   * throws away the row the user just arrowed to. A move that did not move is
   * not a move.
   */
  function handleOptionMouseMove(event: MouseEvent<HTMLDivElement>, index: number) {
    const previous = pointerAt.current;
    const moved = previous === null || previous.x !== event.clientX || previous.y !== event.clientY;
    pointerAt.current = { x: event.clientX, y: event.clientY };
    if (arrowing.current && !moved) return;
    // A row that cannot be chosen cannot become the current one, or the list
    // would announce a choice and then refuse it. Leaving early rather than
    // calling activate() is the whole point: activate() would set `active` to
    // the disabled value, activeIndex would resolve it to -1, and the
    // render-phase reset above would then clear the row the keyboard was
    // holding. Hovering an unavailable row must cost the user nothing.
    if (items[index]?.disabled) return;
    arrowing.current = false;
    activate(index);
  }

  return (
    <div ref={rootRef} className={cn('vt-cbx', className)}>
      <RadixPopover.Root open={expanded} onOpenChange={setOpen}>
        <RadixPopover.Anchor className="vt-cbx__anchor">
          <input
            ref={inputRef}
            id={inputId}
            className={cn('vt-inp', 'vt-cbx__input', mono && 'u-mono', invalid && 'vt-inp--invalid')}
            role="combobox"
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={expanded ? listboxId : undefined}
            aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            aria-busy={loading || undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(event) => {
              onQueryChange(event.target.value);
              // A new query is a new list. Carrying the highlight over would
              // leave a row current that the user picked out of other results.
              setActive(null);
              arrowing.current = false;
              setOpen(true);
            }}
            onFocus={() => {
              if (openOnFocus) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </RadixPopover.Anchor>

        <RadixPopover.Portal>
          <RadixPopover.Content
            // The panel is scaffolding: the listbox inside it is the popup the
            // input controls, and a role=listbox holding an alert would be a
            // listbox with children that are not options.
            role="presentation"
            // Radix's FocusScope puts tabIndex={-1} on whatever it wraps, and
            // a presentational node that is still a focus target is the axe
            // presentation-role-conflict: removed as unselectable, present as
            // focusable. Focus never leaves the input here (both auto-focus
            // handlers are prevented and the scope does not trap), so nothing
            // needs it. Passing undefined wins the Slot merge, which is why
            // the rendered attributes are asserted in the test.
            tabIndex={undefined}
            className="vt-cbx__panel"
            side={side}
            align={align}
            sideOffset={4}
            // Focus stays in the input for the whole interaction; that is what
            // makes aria-activedescendant the thing being announced.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              // Typing in the input is not an interaction outside the list.
              if (rootRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
          >
            {error != null && (
              <div className="vt-cbx__msg vt-cbx__msg--error" role="alert">
                <Glyph name="alert" size={14} />
                <span>
                  <strong className="vt-cbx__msg-word">Search failed.</strong> {error}
                </span>
              </div>
            )}
            {loading && (
              <div className="vt-cbx__msg" role="status">
                <Glyph name="search" size={14} />
                <span>{loadingMessage}</span>
              </div>
            )}

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={label}
              className="vt-cbx__list"
            >
              {items.map((item, index) => {
                const on = index === activeIndex;
                const chosen = value != null && item.value === value;
                return (
                  <div
                    key={item.value}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={on}
                    aria-disabled={item.disabled || undefined}
                    className={cn(
                      'vt-cbx__opt',
                      on && 'vt-cbx__opt--on',
                      item.kind === 'create' && 'vt-cbx__opt--create',
                      item.disabled && 'vt-cbx__opt--disabled',
                    )}
                    onMouseMove={(event) => handleOptionMouseMove(event, index)}
                    // Keep focus in the input: a mousedown that moves focus
                    // breaks aria-activedescendant and blurs the field the
                    // user is still typing in.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(item)}
                  >
                    {item.glyph ?? (item.kind === 'create' ? <Glyph name="plus" size={14} /> : null)}
                    <span className="vt-cbx__opt-text">
                      <span className="vt-cbx__opt-label">{item.label}</span>
                      {item.description && (
                        <span className="vt-cbx__opt-desc">{item.description}</span>
                      )}
                    </span>
                    {item.meta != null && <span className="vt-cbx__opt-meta u-mono">{item.meta}</span>}
                    {/* Glyph and word, never the tone alone. */}
                    {item.disabled && (
                      <span className="vt-cbx__opt-flag">
                        <Glyph name="close" size={12} />
                        {item.disabledReason ?? 'Unavailable'}
                      </span>
                    )}
                    {chosen && <Glyph name="check" size={14} aria-hidden={false} title="Selected" />}
                  </div>
                );
              })}
            </div>

            {showEmpty && (
              <div className="vt-cbx__msg">
                <Glyph name="search" size={14} />
                <span>{emptyMessage}</span>
              </div>
            )}
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
    </div>
  );
}
