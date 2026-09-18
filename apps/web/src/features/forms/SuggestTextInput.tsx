/** A scalar suggestion field with free text, optional record creation, and one shared Combobox contract. */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox, type ComboboxItem, StatusTrace, useDebounced } from '@vitae/ui';
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
  source: SuggestSource;
  propKey: string;
  placeholder?: string;
  mono?: boolean;
  id?: string;
  'aria-label'?: string;
}

const createKey = 'create';

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ type: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(value, 140);
  const sourceKey = suggestQuery(source, '');
  const q = debounced.trim();
  const suggest = useQuery({
    queryKey: ['suggest-text', sourceKey, q],
    queryFn: () =>
      api.get<{ values: SuggestValue[] }>(`/suggest/values?${suggestQuery(source, q)}`),
    ...keepLastResults,
  });
  const values = suggest.data?.values ?? [];
  const currentQuery = q === value.trim();
  const hits = currentQuery && !suggest.isPlaceholderData
    ? values.filter((hit) => hit.value.toLowerCase() !== q.toLowerCase()).slice(0, 8)
    : [];
  const stubType = entityTypeForProp(propKey);
  const typed = value.trim();
  const known =
    values.some((hit) => hit.value.toLowerCase() === typed.toLowerCase()) ||
    created?.title.toLowerCase() === typed.toLowerCase();
  // A response in flight is not an absence of a match. Never offer creation
  // while it might still return the record being typed.
  const canStub = Boolean(stubType && typed && !known && currentQuery && !suggest.isFetching);
  const items = useMemo<ComboboxItem[]>(
    () => [
      ...hits.map((hit) => ({
        value: hit.value,
        label: hit.value,
        meta: hit.count > 1 ? `×${hit.count}` : undefined,
      })),
      ...(canStub && stubType
        ? [
            {
              value: createKey,
              kind: 'create' as const,
              label: creating
                ? `Creating ${stubType.replace('_', ' ')} '${typed}'...`
                : `Create ${stubType.replace('_', ' ')} '${typed}', refine later`,
              disabled: creating,
              disabledReason: 'Creating...',
            },
          ]
        : []),
    ],
    [canStub, creating, hits, stubType, typed],
  );

  async function createStub() {
    if (!stubType || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    try {
      await api.post('/nodes', { type: stubType, title: typed, props: {}, confidence: 0.7 });
      setOpen(false);
      setCreated({ type: stubType.replace('_', ' '), title: typed });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `The ${stubType.replace('_', ' ')} could not be created.`,
      );
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  function select(item: ComboboxItem) {
    if (item.value === createKey) {
      void createStub();
      return;
    }
    onChange(item.value);
    setOpen(false);
  }

  return (
    <div className="suggest-text">
      <Combobox
        id={id}
        disabled={creating}
        inputRef={inputRef}
        label={ariaLabel ?? placeholder ?? 'Suggested value'}
        placeholder={placeholder}
        query={value}
        onQueryChange={(next) => {
          onChange(next);
          setCreated(null);
          setCreateError(null);
        }}
        onSelect={select}
        items={items}
        open={open}
        onOpenChange={setOpen}
        mono={mono}
        loading={suggest.isFetching}
        loadingMessage="Searching values..."
        error={
          suggest.isError
            ? ((suggest.error as Error | null)?.message ??
              'Type the value; it is saved either way.')
            : undefined
        }
        emptyMessage={null}
      />
      {createError && (
        <StatusTrace
          className="mt-2"
          tone="danger"
          label="Nothing was created"
          detail={createError}
        />
      )}
      {created && (
        <StatusTrace
          className="mt-2"
          tone="success"
          label="Created"
          detail={`${created.type} '${created.title}'`}
        />
      )}
    </div>
  );
}
