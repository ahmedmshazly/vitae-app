/**
 * A tag input backed by live suggestions (FR-CAP-003). As you type it queries
 * `GET /suggest/values?kind=…` and offers existing values; free text is always
 * addable. For kinds that map to a node type (skill → skill, city → location)
 * it also offers "＋ Create <type> …" so a typed value becomes a first-class
 * entity you can refine later, never forcing a context switch.
 */
import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '@vitae/ui';
import { ENTITY_BACKED_KINDS, type SuggestKind } from '@vitae/core';
import { api } from '../../lib/api.js';

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
}

export function SuggestTagInput({ value, onChange, kind, placeholder = 'Add…', mono, id }: SuggestTagInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SuggestValue[]>([]);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(draft, 140);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void api
      .get<{ values: SuggestValue[] }>(`/suggest/values?kind=${kind}&q=${encodeURIComponent(debounced.trim())}`)
      .then((res) => {
        if (!alive) return;
        setHits(res.values.filter((h) => !value.includes(h.value)).slice(0, 8));
        setActive(0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
     
  }, [debounced, kind]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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

  async function createStub() {
    if (!stubType || creating) return;
    setCreating(true);
    try {
      await api.post('/nodes', { type: stubType, title: draft.trim(), props: {}, confidence: 0.7 });
      add(draft);
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  function pickActive() {
    if (active < hits.length) {
      add(hits[active]!.value);
    } else if (canStub) {
      void createStub();
    } else if (draft.trim()) {
      add(draft);
    }
  }

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
          aria-expanded={open && optionCount > 0}
          aria-autocomplete="list"
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
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
            // Commit typed text on blur (unless a suggestion click is handling it).
            if (draft.trim() && !canStub) window.setTimeout(() => add(draft), 120);
          }}
        />
      </div>
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
              role="option"
              aria-selected={active === hits.length}
              className={`entity-picker__opt entity-picker__opt--create${active === hits.length ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(hits.length)}
              onClick={() => void createStub()}
              disabled={creating}
            >
              <span className="entity-picker__title">
                Create {stubType!.replace('_', ' ')} “{draft.trim()}”, refine later
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
