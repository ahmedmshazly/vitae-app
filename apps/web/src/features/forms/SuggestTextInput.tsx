/**
 * A single-value text input backed by live suggestions (FR-CAP-003).
 *
 * The scalar sibling of SuggestTagInput. Every text field in the app uses it, so
 * typing a value the graph already holds shows you that spelling instead of
 * quietly adding a near-duplicate: "Fintech" next to "FinTech".
 *
 * Two rules it must never break:
 *   - **Free text always wins.** The dropdown is an aid, not a gate; whatever is
 *     typed is the value, whether or not it matches a suggestion.
 *   - **Create only where a value really names a record.** `company` maps to an
 *     organization, so a new one can be minted and refined later; `industry` is
 *     a string on the organization and mints nothing.
 *
 * Both of its silent states are gone. The suggest fetch was a raw effect
 * ending `.catch(() => undefined)`, so a dead endpoint left the field looking
 * like a plain text input with nothing to offer, which is the near-duplicate
 * this component exists to prevent; it is a query now and says which of the two
 * happened. `createStub()` had no `catch` and was fired as `void createStub()`,
 * so a failed create and a successful one looked exactly alike: nothing moved
 * either way. Both are reported under the field, which is also why neither goes
 * out on a toast: every form in the app renders this control, and a leaf field
 * widget should not require the app's toast provider to be mounted above it.
 *
 * The second rule was also not being kept. The create option's guard asked
 * whether the typed value was among the hits, but the hits had already had the
 * exact match filtered out of them, so the guard was always true: typing the
 * name of an organization the graph already holds offered to mint a second one.
 *
 * The listbox is a real one too: option ids, `aria-controls`,
 * `aria-activedescendant`, `aria-busy` and a name on the list, so arrowing
 * announces what Enter would commit rather than moving a CSS class in silence.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounced, Input, StatusTrace } from '@vitae/ui';
import { entityTypeForProp, suggestQuery, type SuggestSource } from '@vitae/core';
import { api } from '../../lib/api.js';
import { keepLastResults } from '../../components/QueryBoundary.js';

interface SuggestValue {
  value: string;
  count: number;
}

export interface SuggestTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Where completions come from, a curated pool or this field's own values. */
  source: SuggestSource;
  /** Prop key, used to decide whether a typed value can become a record. */
  propKey: string;
  placeholder?: string;
  mono?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function SuggestTextInput({
  value,
  onChange,
  source,
  propKey,
  placeholder,
  mono,
  id,
  'aria-label': ariaLabel,
}: SuggestTextInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ type: string; title: string } | null>(null);
  const debounced = useDebounced(value, 140);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const sourceKey = suggestQuery(source, '');
  const q = debounced.trim();

  const suggest = useQuery({
    queryKey: ['suggest-text', sourceKey, q],
    queryFn: () => api.get<{ values: SuggestValue[] }>(`/suggest/values?${suggestQuery(source, q)}`),
    ...keepLastResults,
  });

  const values = suggest.data?.values ?? [];

  // An exact match is not a suggestion, it is what is already typed. Filtered
  // here rather than in the query so backspacing a character brings the value
  // straight back without a refetch.
  const hits = values.filter((h) => h.value.toLowerCase() !== q.toLowerCase()).slice(0, 8);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const stubType = entityTypeForProp(propKey);
  const typed = value.trim();
  // Checked against the unfiltered values, not against `hits`, which has
  // already dropped the exact match. Reading the guard off `hits` made it
  // always true, so typing the exact name of an organization the graph
  // already holds offered to mint a second one, which is the near-duplicate
  // this control exists to prevent. A title minted here counts as known too:
  // the created record is too new for the suggest query to have seen it.
  const known =
    values.some((h) => h.value.toLowerCase() === typed.toLowerCase()) ||
    created?.title.toLowerCase() === typed.toLowerCase();
  const canStub = stubType && typed.length > 0 && !known;
  const optionCount = hits.length + (canStub ? 1 : 0);

  useEffect(() => setActive(0), [q, sourceKey]);
  useEffect(() => {
    setActive((a) => (optionCount === 0 ? 0 : Math.min(a, optionCount - 1)));
  }, [optionCount]);

  async function createStub() {
    if (!stubType || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    const title = typed;
    try {
      // Confidence < 1: a name typed in passing is a placeholder for a record
      // someone will fill in, and it should read that way in the graph.
      await api.post('/nodes', { type: stubType, title, props: {}, confidence: 0.7 });
      setOpen(false);
      setCreated({ type: stubType.replace('_', ' '), title });
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
    if (active < hits.length) {
      onChange(hits[active]!.value);
      setOpen(false);
    } else if (canStub) {
      void createStub();
    } else {
      setOpen(false);
    }
  }

  const listboxId = `${ids}-listbox`;
  const optionId = (i: number) => `${ids}-opt-${i}`;
  const listOpen = open && optionCount > 0;
  const searching = suggest.isFetching && hits.length === 0;

  return (
    <div ref={rootRef} className="suggest-tags">
      <Input
        ref={inputRef}
        id={id}
        mono={mono}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listboxId : undefined}
        aria-activedescendant={listOpen ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-busy={searching || undefined}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          // The last create outcome describes the previous value, not this one.
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
          } else if (e.key === 'Enter' && listOpen) {
            // Only intercept Enter while the list is showing something, so the
            // key still submits the form the rest of the time.
            e.preventDefault();
            pickActive();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

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
      {created && (
        <StatusTrace
          className="mt-2"
          tone="success"
          label="Created"
          detail={`${created.type} “${created.title}”`}
        />
      )}

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
                onChange(h.value);
                setOpen(false);
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
              // aria-disabled rather than disabled: an option pulled out of the
              // tree mid-list renumbers everything under it while the user is
              // arrowing through, and a disabled option is unreadable.
              aria-disabled={creating || undefined}
              className={`entity-picker__opt entity-picker__opt--create${active === hits.length ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(hits.length)}
              onClick={() => void createStub()}
            >
              <span className="entity-picker__title">
                {creating
                  ? `Creating ${stubType!.replace('_', ' ')} “${typed}”…`
                  : `Create ${stubType!.replace('_', ' ')} “${typed}”, refine later`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
