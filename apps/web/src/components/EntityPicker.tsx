/**
 * Async entity picker (FR-CAP-003): debounced fuzzy title search with keyboard
 * nav and inline "Create '<typed text>'" stub rows, so linking never forces a
 * context switch. Self-contained dropdown (no portal) so it nests cleanly
 * inside dialogs.
 *
 * Three things it used to get wrong, all of them things the design system had
 * already solved somewhere else:
 *
 * - the type chips were `<button className="vt-chip">` with an inline border
 *   colour on the active one, so which type you had narrowed to was said in
 *   colour and nothing else, and not said to a screen reader at all. That is
 *   the exact defect `FilterGroup` exists to prevent, so it uses `FilterGroup`.
 * - the search ran in an effect and ended `.catch(() => undefined)`. A dead
 *   search looked identical to a search with no matches, and there was no way
 *   to tell it was still running. It is a query now, with both states in words.
 * - creating a stub was `void createStub(type)` around a promise with no
 *   catch, so a failed create was an unhandled rejection and the row simply
 *   did nothing. The failure is reported where the action was taken.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EntityGlyph, FilterGroup, Mono, StatusTrace, useDebounced } from '@vitae/ui';
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
  if (types.length > 4) return `${labels.join(', ')}...`;
  if (labels.length <= 1) return labels[0] ?? 'records';
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

/** The pseudo-key for "no type narrowing", kept out of the NodeType space. */
const ALL = '__all__';

export function EntityPicker({ types, onPick, placeholder, excludeIds = [], autoFocus }: EntityPickerProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<NodeType | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<NodeType | null>(null);
  const debounced = useDebounced(value, 120);
  const rootRef = useRef<HTMLDivElement>(null);
  const ids = useId();

  const typesKey = types.join(',');
  // A different set of offered types is a different picker: clear the narrowing
  // and the typed text rather than searching the new types with the old query.
  // Adjusted during render, which is what React recommends for reset-on-prop.
  const [seenTypes, setSeenTypes] = useState(typesKey);
  if (seenTypes !== typesKey) {
    setSeenTypes(typesKey);
    setTypeFilter(null);
    setValue('');
    setCreateError(null);
  }

  const effectiveTypes = useMemo(
    () => (typeFilter ? ([typeFilter] as NodeType[]) : types),
    [typeFilter, types],
  );
  const effectiveKey = effectiveTypes.join(',');
  const q = debounced.trim();

  const search = useQuery({
    queryKey: ['entity-picker', effectiveKey, q],
    queryFn: () => {
      const qs = new URLSearchParams({ q });
      if (effectiveKey) qs.set('types', effectiveKey);
      return api.get<{ results: SwitchHit[] }>(`/search/switch?${qs.toString()}`);
    },
    enabled: q.length > 0,
  });

  // Excluding here rather than in the query key: a record linked a second ago
  // should leave the list at once, without discarding the cached search.
  const hits = !q
    ? []
    : (search.data?.results ?? [])
        .filter((h) => (effectiveTypes as string[]).includes(h.type))
        .filter((h) => !excludeIds.includes(h.id))
        .slice(0, 8);

  // The debounce means a keystroke is not yet a query, and a query in flight is
  // not yet an answer. Both gaps are the search still running, and neither is a
  // result worth acting on.
  const pending = q !== value.trim() || search.isFetching;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Create stubs: active chip, or every type when ≤4, else first 4 with a hint.
  //
  // They wait for the search. While it ran, the results were gone and these
  // rows were the whole list, so a person who typed a name and pressed Enter
  // straight away got a second record rather than the one the lookup was about
  // to return. An answer that has not arrived is not the same as no match.
  const createOptions: NodeType[] = value.trim() && !pending
    ? typeFilter
      ? [typeFilter]
      : effectiveTypes.length <= 4
        ? [...effectiveTypes]
        : effectiveTypes.slice(0, 4)
    : [];
  const optionCount = hits.length + createOptions.length;
  const defaultPlaceholder = `Search ${humanTypeList(types)}...`;

  // Only a new query sends the selection home. Keying this on the option count
  // as well would re-home the row somebody had just arrowed to whenever a
  // late result arrived.
  useEffect(() => setActive(0), [q, effectiveKey]);
  useEffect(() => {
    setActive((a) => (optionCount === 0 ? 0 : Math.min(a, optionCount - 1)));
  }, [optionCount]);

  async function createStub(type: NodeType) {
    if (creating) return;
    setCreating(type);
    setCreateError(null);
    try {
      const res = await api.post<{ node: { id: string; type: string; title: string } }>('/nodes', {
        type,
        title: value.trim(),
        props: {},
        confidence: 0.7,
      });
      choose({ id: res.node.id, type: res.node.type, title: res.node.title });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : `The ${typeLabel(type)} could not be created.`);
    } finally {
      setCreating(null);
    }
  }

  function choose(entity: PickedEntity) {
    onPick(entity);
    setValue('');
    setOpen(false);
    setCreateError(null);
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
  const searching = pending && hits.length === 0;
  const noMatch = Boolean(q) && !pending && !search.isError && hits.length === 0;

  return (
    <div ref={rootRef} className="entity-picker">
      {types.length > 1 && (
        <div className="mb-2">
          <FilterGroup
            label="Narrow to one type"
            value={typeFilter ?? ALL}
            options={[
              { key: ALL, label: 'All' },
              ...types.map((t) => ({ key: t as string, label: typeLabel(t) })),
            ]}
            onChange={(key) => setTypeFilter(key === ALL ? null : (key as NodeType))}
          />
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
        aria-busy={searching}
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

      {/* Below the field, not inside the listbox: a listbox whose children are
          not options is a listbox screen readers cannot count. */}
      {open && searching && (
        <StatusTrace className="mt-2" tone="live" label="Searching records" announce={false} />
      )}
      {open && search.isError && (
        <StatusTrace
          className="mt-2"
          tone="danger"
          label="Search is unavailable"
          detail={(search.error as Error | null)?.message ?? 'You can still create a new record below.'}
        />
      )}
      {createError && (
        <StatusTrace className="mt-2" tone="danger" label="Nothing was created" detail={createError} />
      )}
      {open && noMatch && (
        <p className="mt-2 text-sm text-muted">
          No match for <span className="font-mono text-ink-soft">{q}</span>. Create one below, or
          widen the type.
        </p>
      )}

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
              <Mono className="entity-picker__type text-muted">{h.type}</Mono>
            </button>
          ))}
          {createOptions.map((type, j) => {
            const i = hits.length + j;
            const busy = creating === type;
            return (
              <button
                key={`create-${type}`}
                id={optionId(i)}
                type="button"
                role="option"
                aria-selected={i === active}
                // aria-disabled rather than disabled: an option removed from
                // the tree mid-list renumbers everything under it while the
                // user is arrowing through.
                aria-disabled={creating != null}
                className={`entity-picker__opt entity-picker__opt--create${i === active ? ' entity-picker__opt--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => void createStub(type)}
              >
                <EntityGlyph type={type} size="sm" />
                <span className="entity-picker__title">
                  {busy
                    ? `Creating ${typeLabel(type)} '${value.trim()}'...`
                    : `Create ${typeLabel(type)} '${value.trim()}', refine later`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
