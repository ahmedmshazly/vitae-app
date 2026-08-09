/**
 * Async entity picker (FR-CAP-003): debounced fuzzy title search with keyboard
 * nav and inline "Create '<typed text>'" stub rows, so linking never forces a
 * context switch. Self-contained dropdown (no portal) so it nests cleanly
 * inside dialogs.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EntityGlyph, useDebounced } from '@vitae/ui';
import type { NodeType } from '@vitae/core';
import { api } from '../lib/api.js';
import { typeLabel } from '../lib/entity-href.js';

export interface PickedEntity {
  id: string;
  type: string;
  title: string;
}

interface SwitchHit {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

export interface EntityPickerProps {
  /** Node types offered; results are filtered to these. */
  types: NodeType[];
  onPick: (entity: PickedEntity) => void;
  placeholder?: string;
  /** Ids to hide from results (already linked). */
  excludeIds?: string[];
  autoFocus?: boolean;
}

function humanTypeList(types: NodeType[]): string {
  const labels = types.slice(0, 4).map(typeLabel);
  if (types.length > 4) return `${labels.join(', ')}…`;
  if (labels.length <= 1) return labels[0] ?? 'records';
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

export function EntityPicker({ types, onPick, placeholder, excludeIds = [], autoFocus }: EntityPickerProps) {
  const [value, setValue] = useState('');
  const [hits, setHits] = useState<SwitchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [typeFilter, setTypeFilter] = useState<NodeType | null>(null);
  const debounced = useDebounced(value, 120);
  const rootRef = useRef<HTMLDivElement>(null);
  const ids = useId();

  const effectiveTypes = useMemo(
    () => (typeFilter ? ([typeFilter] as NodeType[]) : types),
    [typeFilter, types],
  );
  const typesKey = types.join(',');
  const excludeKey = excludeIds.join(',');

  useEffect(() => {
    setTypeFilter(null);
    setValue('');
    setHits([]);
  }, [typesKey]);

  useEffect(() => {
    if (!debounced.trim()) {
      setHits([]);
      return;
    }
    let alive = true;
    const qs = new URLSearchParams({ q: debounced });
    if (effectiveTypes.length > 0) qs.set('types', effectiveTypes.join(','));
    void api
      .get<{ results: SwitchHit[] }>(`/search/switch?${qs.toString()}`)
      .then((res) => {
        if (!alive) return;
        setHits(
          res.results
            .filter((h) => (effectiveTypes as string[]).includes(h.type))
            .filter((h) => !excludeIds.includes(h.id))
            .slice(0, 8),
        );
        setActive(0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
     
  }, [debounced, typesKey, excludeKey, typeFilter]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Create stubs: active chip, or every type when ≤4, else first 4 with a hint.
  const createOptions: NodeType[] = value.trim()
    ? typeFilter
      ? [typeFilter]
      : effectiveTypes.length <= 4
        ? [...effectiveTypes]
        : effectiveTypes.slice(0, 4)
    : [];
  const optionCount = hits.length + createOptions.length;
  const defaultPlaceholder = `Search ${humanTypeList(types)}…`;

  async function createStub(type: NodeType) {
    if (creating) return;
    setCreating(true);
    try {
      const res = await api.post<{ node: { id: string; type: string; title: string } }>('/nodes', {
        type,
        title: value.trim(),
        props: {},
        confidence: 0.7,
      });
      choose({ id: res.node.id, type: res.node.type, title: res.node.title });
    } finally {
      setCreating(false);
    }
  }

  function choose(entity: PickedEntity) {
    onPick(entity);
    setValue('');
    setHits([]);
    setOpen(false);
  }

  function pickActive() {
    if (active < hits.length) {
      const h = hits[active]!;
      choose({ id: h.id, type: h.type, title: h.title });
    } else {
      const type = createOptions[active - hits.length];
      if (type) void createStub(type);
    }
  }

  const listboxId = `${ids}-listbox`;
  const optionId = (i: number) => `${ids}-opt-${i}`;

  return (
    <div ref={rootRef} className="entity-picker">
      {types.length > 1 && (
        <div className="chips" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="vt-chip"
            style={
              typeFilter == null
                ? { borderColor: 'var(--ae-accent)', color: 'var(--ae-accent-soft)', background: 'var(--ae-accent-bg-soft)' }
                : undefined
            }
            onClick={() => setTypeFilter(null)}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              className="vt-chip"
              style={
                typeFilter === t
                  ? { borderColor: 'var(--ae-accent)', color: 'var(--ae-accent-soft)', background: 'var(--ae-accent-bg-soft)' }
                  : undefined
              }
              onClick={() => setTypeFilter(t)}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>
      )}
      <input
        className="vt-inp"
        role="combobox"
        aria-expanded={open && optionCount > 0}
        aria-controls={listboxId}
        aria-activedescendant={open && optionCount > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label={placeholder ?? defaultPlaceholder}
        placeholder={placeholder ?? defaultPlaceholder}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(optionCount - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pickActive();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && optionCount > 0 && (
        <div className="entity-picker__list" role="listbox" id={listboxId} aria-label="Matching records">
          {hits.map((h, i) => (
            <button
              key={h.id}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`entity-picker__opt${i === active ? ' entity-picker__opt--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose({ id: h.id, type: h.type, title: h.title })}
            >
              <EntityGlyph type={h.type} size="sm" />
              <span className="entity-picker__title">{h.title}</span>
              {h.subtitle && <span className="entity-picker__sub">{h.subtitle}</span>}
              <span className="u-faint u-mono entity-picker__type">{h.type}</span>
            </button>
          ))}
          {createOptions.map((type, j) => {
            const i = hits.length + j;
            return (
              <button
                key={`create-${type}`}
                id={optionId(i)}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`entity-picker__opt entity-picker__opt--create${i === active ? ' entity-picker__opt--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => void createStub(type)}
                disabled={creating}
              >
                <EntityGlyph type={type} size="sm" />
                <span className="entity-picker__title">
                  Create {typeLabel(type)} “{value.trim()}”, refine later
                </span>
              </button>
            );
          })}
        </div>
      )}
      {open && value.trim() && optionCount === 0 && (
        <div className="entity-picker__list" role="listbox" id={listboxId}>
          <div className="u-muted" style={{ padding: '8px 12px', fontSize: 'var(--ae-text-sm)' }}>
            No matches, pick a type chip above to create a new record.
          </div>
        </div>
      )}
    </div>
  );
}
