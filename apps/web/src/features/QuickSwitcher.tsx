import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CommandOverlay, EntityGlyph, Glyph, Kbd, Mono, Skeleton } from '@vitae/ui';
import { api } from '../lib/api.js';
import { matchCommand, type CommandAction } from '../app/commands.js';

interface SwitchHit {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

const LISTBOX_ID = 'quickswitcher-listbox';
const optionId = (i: number) => `quickswitcher-option-${i}`;

/**
 * ⌘P command palette (SRS FR-SRCH-004). Two lanes in one list: **actions**
 * (do something: "New résumé", "Sync GitHub") and **jumps** (trigram-tolerant
 * record title search). Actions surface the app's capabilities by name so
 * nothing important hides behind nav archaeology.
 *
 * FR-022/FR-023: a real dialog (CommandOverlay) with the full ARIA combobox
 * contract, the input owns the listbox via aria-controls and announces the
 * highlighted row via aria-activedescendant, so a screen-reader user hears which
 * option is active while arrowing through it. The *sighted* half of that was
 * missing: the active row was painted --ae-surface-raised on a panel that was
 * also --ae-surface-raised, so arrowing produced no visible change at all.
 */
export function QuickSwitcher({
  onClose,
  onPick,
  actions = [],
}: {
  onClose: () => void;
  onPick: (id: string, type: string) => void;
  actions?: CommandAction[];
}) {
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = value.trim();
  const shownActions = useMemo(
    () => (q ? actions.filter((a) => matchCommand(a, q)) : actions),
    [actions, q],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 80);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['switch', debounced],
    queryFn: () => api.get<{ results: SwitchHit[] }>(`/search/switch?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });
  const hits = debounced ? (search.data?.results ?? []) : [];

  // One flat selection index across actions then record hits. Only a new query
  // sends the selection back to the top, keying this on the option count too
  // meant a late-arriving action re-homed the row the user had just arrowed to.
  const optionCount = shownActions.length + hits.length;
  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    setActive((a) => (optionCount === 0 ? 0 : Math.min(a, optionCount - 1)));
  }, [optionCount]);

  // Keep the highlighted option in view when arrowing past the fold.
  // Optional-call: jsdom (and some embeds) omit scrollIntoView on elements.
  useEffect(() => {
    listRef.current?.querySelector(`#${optionId(active)}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const runActive = () => {
    if (active < shownActions.length) {
      const a = shownActions[active];
      if (a) {
        onClose();
        a.run();
      }
    } else {
      const h = hits[active - shownActions.length];
      if (h) onPick(h.id, h.type);
    }
  };

  // Searching is only worth announcing once the actions lane has nothing left
  // to show, otherwise the list is already full and a skeleton just flickers.
  const searching = search.isFetching && hits.length === 0;
  const noMatch = Boolean(debounced) && !search.isFetching && optionCount === 0;

  return (
    <CommandOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title="Command palette"
      description="Run a command or jump to a record."
    >
      <input
        className="vt-palette__input"
        placeholder="Search commands and records"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        role="combobox"
        aria-expanded={optionCount > 0}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={optionCount > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label="Command or record search"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, optionCount - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            runActive();
          }
          // Escape is handled by the dialog (closes and restores focus).
        }}
      />

      {search.isError && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 text-sm text-danger">
          <Glyph name="close" size={14} />
          <span>
            <strong className="font-semibold">Search failed.</strong> Commands still work, keep typing to retry.
          </span>
        </div>
      )}

      {searching && (
        <div className="flex flex-col gap-2 px-4 py-3" role="status" aria-label="Searching">
          <Skeleton height={14} width="45%" />
          <Skeleton height={14} width="30%" />
        </div>
      )}

      {noMatch && (
        <p className="px-4 py-4 text-sm text-muted">
          No command or record matches <span className="font-mono text-ink-soft">{debounced}</span>. Try fewer
          characters, or capture it with ⌘K.
        </p>
      )}

      {optionCount > 0 && (
        <div className="vt-palette__list" id={LISTBOX_ID} role="listbox" aria-label="Results" ref={listRef}>
          {shownActions.length > 0 && (
            <div className="vt-palette__group" role="presentation">
              Actions
            </div>
          )}
          {shownActions.map((a, i) => (
            <PaletteRow key={a.id} index={i} active={active} onActivate={setActive} onPick={() => { onClose(); a.run(); }}>
              <Glyph name={a.glyph ?? 'dot'} size={16} />
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              {a.hint && <Kbd>{a.hint}</Kbd>}
            </PaletteRow>
          ))}
          {hits.length > 0 && (
            <div className="vt-palette__group" role="presentation">
              Jump to
            </div>
          )}
          {hits.map((h, i) => {
            const idx = shownActions.length + i;
            return (
              <PaletteRow
                key={h.id}
                index={idx}
                active={active}
                onActivate={setActive}
                onPick={() => onPick(h.id, h.type)}
              >
                <EntityGlyph type={h.type} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{h.title}</span>
                  {/* Two records can share a title; without the subtitle the
                      list offers a choice it gives no way to make. */}
                  {h.subtitle && <span className="block truncate text-sm text-muted">{h.subtitle}</span>}
                </span>
                {/* --ae-faint is 4.48:1 on --ae-accent-bg, which the active
                    row uses, accent-bg (#262626) is the lightest surface in
                    the app and the token table only rates faint against the
                    canvas and the overlay. Muted clears it at 5.7:1. */}
                <Mono className="text-xs text-muted">{h.type}</Mono>
              </PaletteRow>
            );
          })}
        </div>
      )}
    </CommandOverlay>
  );
}

function PaletteRow({
  index,
  active,
  onActivate,
  onPick,
  children,
}: {
  index: number;
  active: number;
  onActivate: (i: number) => void;
  onPick: () => void;
  children: ReactNode;
}) {
  const on = index === active;
  return (
    <button
      id={optionId(index)}
      role="option"
      aria-selected={on}
      type="button"
      className={`vt-palette__row${on ? ' vt-palette__row--on' : ''}`}
      onClick={onPick}
      onMouseEnter={() => onActivate(index)}
    >
      {children}
    </button>
  );
}
