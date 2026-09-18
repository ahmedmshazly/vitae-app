/** A multi-value suggestion field on the shared Combobox contract. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox, type ComboboxItem, StatusTrace, useDebounced } from '@vitae/ui';
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
  /** Names the input when its surrounding form has no associated label. */
  'aria-label'?: string;
}

const createKey = 'create';

export function SuggestTagInput({
  value,
  onChange,
  kind,
  placeholder = 'Add...',
  mono,
  id,
  'aria-label': ariaLabel,
}: SuggestTagInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);
  const debounced = useDebounced(draft, 140);
  const q = debounced.trim();
  const suggest = useQuery({
    queryKey: ['suggest', kind, q],
    queryFn: () =>
      api.get<{ values: SuggestValue[] }>(
        `/suggest/values?kind=${kind}&q=${encodeURIComponent(q)}`,
      ),
    ...keepLastResults,
  });

  // Removing a tag makes it available immediately, without waiting for a new
  // request to replace cached suggestions.
  const values = suggest.data?.values ?? [];
  const currentQuery = q === draft.trim();
  const hits = currentQuery && !suggest.isPlaceholderData
    ? values.filter((hit) => !value.includes(hit.value)).slice(0, 8)
    : [];
  const stubType = ENTITY_BACKED_KINDS[kind];
  const typed = draft.trim();
  const known = values.some((hit) => hit.value.toLowerCase() === typed.toLowerCase());
  // A request still in flight is not proof there is no matching record.
  const canStub = Boolean(stubType && typed && !known && currentQuery && !suggest.isFetching);

  useEffect(
    () => () => {
      if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !value.includes(part));
    if (parts.length) onChange([...value, ...parts]);
    setDraft('');
  };

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
    if (!stubType || creating || !typed) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    try {
      await api.post('/nodes', { type: stubType, title: typed, props: {}, confidence: 0.7 });
      add(typed);
      setCreated(`${stubType.replace('_', ' ')} '${typed}'`);
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
    if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    if (item.value === createKey) {
      void createStub();
      return;
    }
    add(item.value);
    inputRef.current?.focus();
  }

  return (
    <div className={`suggest-tags${mono ? ' u-mono' : ''}`}>
      <Combobox
        id={id}
        disabled={creating}
        inputRef={inputRef}
        label={ariaLabel ?? placeholder ?? 'Suggested value'}
        placeholder={value.length ? '' : placeholder}
        query={draft}
        onQueryChange={(next) => {
          setDraft(next);
          setCreated(null);
          setCreateError(null);
        }}
        onSelect={select}
        items={items}
        open={open}
        onOpenChange={setOpen}
        keepOpenOnSelect
        loading={suggest.isFetching && hits.length === 0}
        loadingMessage="Searching values..."
        error={
          suggest.isError
            ? ((suggest.error as Error | null)?.message ??
              'Type the value; it is saved either way.')
            : undefined
        }
        emptyMessage={null}
        inputBefore={value.map((tag) => (
          <span key={tag} className="vt-tags__tag">
            {tag}
            <button
              type="button"
              className="vt-tags__x"
              aria-label={`Remove ${tag}`}
              disabled={creating}
              onClick={() => onChange(value.filter((current) => current !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        inputClassName="vt-tags__input"
        onInputKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === ',') {
            event.preventDefault();
            add(draft);
          } else if (event.key === 'Backspace' && !draft && value.length) {
            event.preventDefault();
            onChange(value.slice(0, -1));
          } else if (
            event.key === 'Enter' &&
            !event.currentTarget.getAttribute('aria-activedescendant')
          ) {
            // Combobox owns Enter for a deliberately arrowed option. Without
            // one, Enter still commits free text as this tag field always did.
            event.preventDefault();
            if (draft.trim()) add(draft);
          }
        }}
        onInputBlur={() => {
          if (!draft.trim()) return;
          const text = draft;
          blurTimer.current = window.setTimeout(() => {
            blurTimer.current = null;
            add(text);
          }, 120);
        }}
      />

      {createError && (
        <StatusTrace
          className="mt-2"
          tone="danger"
          label="Nothing was created"
          detail={createError}
        />
      )}
      {created && <StatusTrace className="mt-2" tone="success" label="Created" detail={created} />}
    </div>
  );
}
