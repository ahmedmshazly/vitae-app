/**
 * Async entity picker: title search plus an explicit, recoverable create path.
 *
 * The picker owns querying and mutations; the shared Combobox owns the ARIA
 * contract, popup layering, keyboard traversal, and coarse-pointer targets.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Combobox,
  type ComboboxItem,
  EntityGlyph,
  FilterGroup,
  Mono,
  Select,
  StatusTrace,
  useDebounced,
} from '@vitae/ui';
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
  types: NodeType[];
  onPick: (entity: PickedEntity) => void;
  placeholder?: string;
  excludeIds?: string[];
  autoFocus?: boolean;
  /** Link-only workflows must not create an incomplete record as a side effect. */
  allowCreate?: boolean;
  /** Use a full record form when required details must be collected. */
  onCreate?: (type: NodeType, title: string) => void;
}

function humanTypeList(types: NodeType[]): string {
  const labels = types.slice(0, 4).map(typeLabel);
  if (types.length > 4) return `${labels.join(', ')}...`;
  if (labels.length <= 1) return labels[0] ?? 'records';
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

const ALL = '__all__';
const createKey = (type: NodeType) => `create:${type}`;

export function EntityPicker({
  types,
  onPick,
  placeholder,
  excludeIds = [],
  autoFocus,
  allowCreate = true,
  onCreate,
}: EntityPickerProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<NodeType | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<NodeType | null>(null);
  const debounced = useDebounced(value, 120);

  const typesKey = types.join(',');
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
      const params = new URLSearchParams({ q });
      if (effectiveKey) params.set('types', effectiveKey);
      return api.get<{ results: SwitchHit[] }>(`/search/switch?${params.toString()}`);
    },
    enabled: q.length > 0,
  });

  const hits =
    !q || q !== value.trim()
      ? []
      : (search.data?.results ?? [])
          .filter((hit) => (effectiveTypes as string[]).includes(hit.type))
          .filter((hit) => !excludeIds.includes(hit.id))
          .slice(0, 8);

  // The debounce is part of an in-flight search. Creating before it resolves
  // can mint a duplicate of a record that is about to arrive.
  const pending = q !== value.trim() || search.isFetching;
  const createOptions: NodeType[] =
    allowCreate && value.trim() && !pending
      ? typeFilter
        ? [typeFilter]
        : effectiveTypes.length <= 4
          ? [...effectiveTypes]
          : effectiveTypes.slice(0, 4)
      : [];
  const defaultPlaceholder = `Search ${humanTypeList(types)}...`;

  const items: ComboboxItem[] = [
    ...hits.map((hit) => ({
      value: hit.id,
      label: hit.title,
      description: hit.subtitle,
      meta: <Mono>{hit.type}</Mono>,
      glyph: <EntityGlyph type={hit.type} size="sm" />,
    })),
    ...createOptions.map((type) => ({
      value: createKey(type),
      kind: 'create' as const,
      label:
        creating === type
          ? `Creating ${typeLabel(type)} '${value.trim()}'...`
          : `Create ${typeLabel(type)} '${value.trim()}', ${onCreate ? 'add details' : 'refine later'}`,
      glyph: <EntityGlyph type={type} size="sm" />,
      disabled: creating !== null,
      disabledReason: creating === type ? 'Creating...' : 'Another record is being created',
    })),
  ];

  async function createStub(type: NodeType) {
    if (creating) return;
    setCreating(type);
    setCreateError(null);
    try {
      const response = await api.post<{ node: { id: string; type: string; title: string } }>(
        '/nodes',
        {
          type,
          title: value.trim(),
          props: {},
          confidence: 0.7,
        },
      );
      onPick({ id: response.node.id, type: response.node.type, title: response.node.title });
      setValue('');
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : `The ${typeLabel(type)} could not be created.`,
      );
    } finally {
      setCreating(null);
    }
  }

  function select(item: ComboboxItem) {
    if (item.kind === 'create') {
      const type = createOptions.find((candidate) => createKey(candidate) === item.value);
      if (type && onCreate) {
        setOpen(false);
        onCreate(type, value.trim());
      } else if (type) void createStub(type);
      return;
    }
    const hit = hits.find((candidate) => candidate.id === item.value);
    if (!hit) return;
    onPick({ id: hit.id, type: hit.type, title: hit.title });
    setValue('');
    setCreateError(null);
  }

  const searchError = search.isError
    ? ((search.error as Error | null)?.message ?? 'You can still create a new record below.')
    : undefined;
  const noMatch = Boolean(q) && !pending && !search.isError && hits.length === 0;

  return (
    <div className="entity-picker">
      {types.length > 1 && (
        <div className="mb-2">
          {types.length > 4 ? (
            <Select
              label="Record type"
              value={typeFilter ?? ALL}
              disabled={creating !== null}
              onChange={(key) => setTypeFilter(key === ALL ? null : (key as NodeType))}
              options={[
                { value: ALL, label: 'All record types' },
                ...types.map((type) => ({ value: type, label: typeLabel(type) })),
              ]}
            />
          ) : (
            <FilterGroup
              label="Narrow to one type"
              value={typeFilter ?? ALL}
              options={[
                { key: ALL, label: 'All' },
                ...types.map((type) => ({ key: type as string, label: typeLabel(type) })),
              ]}
              onChange={(key) => {
                if (!creating) setTypeFilter(key === ALL ? null : (key as NodeType));
              }}
            />
          )}
        </div>
      )}
      <Combobox
        disabled={creating !== null}
        label={placeholder ?? defaultPlaceholder}
        placeholder={placeholder ?? defaultPlaceholder}
        query={value}
        onQueryChange={(next) => {
          setValue(next);
          setCreateError(null);
        }}
        onSelect={select}
        open={open}
        onOpenChange={setOpen}
        items={items}
        loading={pending}
        loadingMessage="Searching records..."
        error={searchError}
        emptyMessage={
          q && !pending && !search.isError
            ? allowCreate
              ? `No match for '${q}'. Create one below, or widen the type.`
              : `No match for '${q}'. Search for an existing record by title.`
            : null
        }
        autoFocus={autoFocus}
      />
      {open && noMatch && (
        <p className="mt-2 text-sm text-muted">
          No match for <span className="font-mono text-ink-soft">{q}</span>.{' '}
          {allowCreate
            ? 'Create one below, or widen the type.'
            : 'Search for an existing record by title.'}
        </p>
      )}
      {createError && (
        <StatusTrace
          className="mt-2"
          tone="danger"
          label="Nothing was created"
          detail={createError}
        />
      )}
    </div>
  );
}
