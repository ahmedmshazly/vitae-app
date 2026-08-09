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
 */
import { useEffect, useRef, useState } from 'react';
import { useDebounced, Input } from '@vitae/ui';
import { entityTypeForProp, suggestQuery, type SuggestSource } from '@vitae/core';
import { api } from '../../lib/api.js';

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
  const [hits, setHits] = useState<SuggestValue[]>([]);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(value, 140);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sourceKey = suggestQuery(source, '');

  useEffect(() => {
    let alive = true;
    void api
      .get<{ values: SuggestValue[] }>(`/suggest/values?${suggestQuery(source, debounced.trim())}`)
      .then((res) => {
        if (!alive) return;
        // An exact match is not a suggestion, it is what is already typed.
        setHits(
          res.values.filter((h) => h.value.toLowerCase() !== debounced.trim().toLowerCase()).slice(0, 8),
        );
        setActive(0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [debounced, sourceKey]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const stubType = entityTypeForProp(propKey);
  const typed = value.trim();
  const canStub =
    stubType && typed.length > 0 && !hits.some((h) => h.value.toLowerCase() === typed.toLowerCase());
  const optionCount = hits.length + (canStub ? 1 : 0);

  async function createStub() {
    if (!stubType || creating) return;
    setCreating(true);
    try {
      // Confidence < 1: a name typed in passing is a placeholder for a record
      // someone will fill in, and it should read that way in the graph.
      await api.post('/nodes', { type: stubType, title: typed, props: {}, confidence: 0.7 });
      setOpen(false);
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

  return (
    <div ref={rootRef} className="suggest-tags">
      <Input
        ref={inputRef}
        id={id}
        mono={mono}
        role="combobox"
        aria-expanded={open && optionCount > 0}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, optionCount - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && optionCount > 0) {
            // Only intercept Enter while the list is showing something, so the
            // key still submits the form the rest of the time.
            e.preventDefault();
            pickActive();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && optionCount > 0 && (
        <div className="entity-picker__list" role="listbox">
          {hits.map((h, i) => (
            <button
              key={h.value}
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
              role="option"
              aria-selected={active === hits.length}
              className={`entity-picker__opt entity-picker__opt--create${active === hits.length ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(hits.length)}
              onClick={() => void createStub()}
              disabled={creating}
            >
              <span className="entity-picker__title">
                Create {stubType!.replace('_', ' ')} “{typed}”, refine later
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
