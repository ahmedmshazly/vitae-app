/**
 * A tag input backed by live suggestions (FR-CAP-003). As you type it queries
 * `GET /suggest/values?kind=…` and offers existing values; free text is always
 * addable. For kinds that map to a node type (skill → skill, city → location)
 * it also offers "＋ Create <type> …" so a typed value becomes a first-class
 * entity you can refine later, never forcing a context switch.
 *
 * Three states it used to swallow, every one of them a state the user caused
 * or was waiting on:
 *
 * - the suggest fetch ran in a raw effect ending `.catch(() => undefined)`, so
 *   a dead endpoint and a graph holding no match looked identical: the list
 *   simply never opened and the user typed the near-duplicate this control
 *   exists to prevent. It is a query now, with pending and failure in words.
 * - `createStub()` was a `try/finally` with no `catch`, fired as
 *   `void createStub()`. A rejected POST /nodes added no tag, minted no
 *   record and said nothing, so the only feedback was clicking again. Both
 *   outcomes are reported under the field, where the action was taken. Success
 *   gets a line of its own because a tag appearing does not tell you a record
 *   now exists in your graph, and the field is used by every form in the app,
 *   so it reports its own states rather than requiring a toast provider.
 * - blur committed the typed draft only when `!canStub`, which is false for
 *   every entity-backed kind. Typing "Rust" into Skills and clicking Save lost
 *   "Rust" with no warning, while the same gesture in a non-stubbable field
 *   kept it. Blur always commits now, matching the `TagInput` primitive;
 *   minting a record is an extra affordance, never the only way to keep what
 *   was typed.
 *
 * The listbox is a real one: ids on the options, `aria-controls` and
 * `aria-activedescendant` on the input, and a name on the list, so arrowing
 * announces the option Enter would commit instead of moving a CSS class in
 * silence.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatusTrace, useDebounced } from '@vitae/ui';
import { ENTITY_BACKED_KINDS, type SuggestKind } from '@vitae/core';
import { api } from '../../lib/api.js';
import { keepLastResults } from '../../components/QueryBoundary.js';

interface SuggestValue {
  value: string;
  count: number;
}

export interface SuggestTagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  kind: SuggestKind;
  placeholder?: string;
  mono?: boolean;
  id?: string;
  /**
   * Names the control when no `<label for>` reaches it. The placeholder is
   * emptied as soon as one tag exists, so a field named only by its
   * placeholder becomes an unnamed combobox the moment it holds anything.
   */
  'aria-label'?: string;
}

export function SuggestTagInput({
  value,
  onChange,
  kind,
  placeholder = 'Add…',
  mono,
  id,
  'aria-label': ariaLabel,
}: SuggestTagInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const debounced = useDebounced(draft, 140);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);
  const ids = useId();

  const q = debounced.trim();
  const suggest = useQuery({
    queryKey: ['suggest', kind, q],
    queryFn: () => api.get<{ values: SuggestValue[] }>(`/suggest/values?kind=${kind}&q=${encodeURIComponent(q)}`),
    ...keepLastResults,
  });

  // Filtering here rather than in the query: a tag removed a second ago should
  // come back to the list at once, without discarding the cached suggestion.
  const hits = (suggest.data?.values ?? []).filter((h) => !value.includes(h.value)).slice(0, 8);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // A pending blur commit must not outlive the field. Closing the dialog it
  // sits in would otherwise write a tag onto a form nobody is looking at.
  useEffect(
    () => () => {
      if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft('');
  };

  const stubType = ENTITY_BACKED_KINDS[kind];
  // Offer stub-create when a backing node type exists, text is typed, and it
  // isn't already an exact existing suggestion.
  const canStub =
    stubType && draft.trim() && !hits.some((h) => h.value.toLowerCase() === draft.trim().toLowerCase());
  const optionCount = hits.length + (canStub ? 1 : 0);

  // Only a new query sends the highlight home; keying it on the option count
  // as well would re-home the row somebody just arrowed to when a late result
  // arrives.
  useEffect(() => setActive(0), [q, kind]);
  useEffect(() => {
    setActive((a) => (optionCount === 0 ? 0 : Math.min(a, optionCount - 1)));
  }, [optionCount]);

  async function createStub() {
    if (!stubType || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    const title = draft.trim();
    try {
      await api.post('/nodes', { type: stubType, title, props: {}, confidence: 0.7 });
      add(title);
      setCreated(`${stubType.replace('_', ' ')} “${title}”`);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : `The ${stubType.replace('_', ' ')} could not be created.`,
      );
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  function pickActive() {
    if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    if (active < hits.length) {
      add(hits[active]!.value);
    } else if (canStub) {
      void createStub();
    } else if (draft.trim()) {
      add(draft);
    }
  }

  const listboxId = `${ids}-listbox`;
  const optionId = (i: number) => `${ids}-opt-${i}`;
  const listOpen = open && optionCount > 0;
  const searching = suggest.isFetching && hits.length === 0;

  return (
    <div ref={rootRef} className="suggest-tags">
      <div className={`vt-tags${mono ? ' u-mono' : ''}`} onClick={() => inputRef.current?.focus()}>
        {value.map((tag) => (
          <span key={tag} className="vt-tags__tag">
            {tag}
            <button
              type="button"
              className="vt-tags__x"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          className="vt-tags__input"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={listOpen}
          aria-controls={listOpen ? listboxId : undefined}
          aria-activedescendant={listOpen ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-busy={searching || undefined}
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            // The last create outcome describes the previous draft, not this one.
            setCreated(null);
            setCreateError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(optionCount - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              pickActive();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => {
            // Always commit, the way the TagInput primitive does. The delay
            // lets a click on an option land first; the option handlers cancel
            // this timer so the two cannot both fire.
            if (!draft.trim()) return;
            const text = draft;
            blurTimer.current = window.setTimeout(() => {
              blurTimer.current = null;
              add(text);
            }, 120);
          }}
        />
      </div>

      {/* Below the field, never inside the listbox: a listbox whose children
          are not options is a listbox screen readers cannot count. */}
      {open && searching && (
        <StatusTrace className="mt-2" tone="live" label="Searching values" announce={false} />
      )}
      {open && suggest.isError && (
        <StatusTrace
          className="mt-2"
          tone="danger"
          label="Suggestions unavailable"
          detail={(suggest.error as Error | null)?.message ?? 'Type the value; it is saved either way.'}
        />
      )}
      {createError && (
        <StatusTrace className="mt-2" tone="danger" label="Nothing was created" detail={createError} />
      )}
      {created && <StatusTrace className="mt-2" tone="success" label="Created" detail={created} />}

      {listOpen && (
        <div className="entity-picker__list" role="listbox" id={listboxId} aria-label="Matching values">
          {hits.map((h, i) => (
            <button
              key={h.value}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`entity-picker__opt${i === active ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
                add(h.value);
                inputRef.current?.focus();
              }}
            >
              <span className="entity-picker__title">{h.value}</span>
              {h.count > 1 && <span className="u-faint u-mono entity-picker__type">×{h.count}</span>}
            </button>
          ))}
          {canStub && (
            <button
              type="button"
              id={optionId(hits.length)}
              role="option"
              aria-selected={active === hits.length}
              // aria-disabled rather than disabled: an option pulled out of
              // the tree mid-list renumbers everything under it while the user
              // is arrowing through, and a disabled option is unreadable.
              aria-disabled={creating || undefined}
              className={`entity-picker__opt entity-picker__opt--create${active === hits.length ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(hits.length)}
              onClick={() => {
                if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
                void createStub();
              }}
            >
              <span className="entity-picker__title">
                {creating
                  ? `Creating ${stubType!.replace('_', ' ')} “${draft.trim()}”…`
                  : `Create ${stubType!.replace('_', ' ')} “${draft.trim()}”, refine later`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
