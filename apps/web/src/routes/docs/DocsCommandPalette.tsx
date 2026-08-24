/**
 * Jumping anywhere in the corpus from the keyboard.
 *
 * A section rail is how someone browses; it is a poor way to reach a page they
 * can already name. At fifty pages the rail is a scroll, and the reader who
 * knows they want the migrations page should not have to find which section
 * put it there.
 *
 * It reuses `CommandOverlay` and the full ARIA combobox contract the product's
 * own switcher established, rather than inventing a second palette: the same
 * dialog, the same listbox, the same focus restoration, so the behaviour a
 * reader learned in the application still holds in the documentation.
 *
 * The index is fetched only when the palette first opens. Someone who reads a
 * page and leaves never pays for it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CommandOverlay, Kbd, Skeleton } from '@vitae/ui';
import { searchIndexQueryOptions } from './docsContent.js';
import { type DocsManifest, typeMeta } from './docsModel.js';
import { searchDocs } from './docsSearch.js';

const LISTBOX_ID = 'docs-palette-listbox';
const optionId = (index: number) => `docs-palette-option-${index}`;

/** How many pages the palette offers at once. */
const SHOWN = 8;

/**
 * Is the reader typing into something, rather than reading?
 *
 * A bare `/` opens the palette, which is the convention every documentation
 * surface uses and which would otherwise swallow the slash in a search field
 * or in the palette's own input.
 */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName);
}

export function useDocsPalette(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = (event.key === 'k' && (event.metaKey || event.ctrlKey)) || event.key === '/';
      if (!shortcut) return;
      if (event.key === '/' && typingInto(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

export function DocsCommandPalette({
  manifest,
  onClose,
}: {
  manifest: DocsManifest;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const index = useQuery(searchIndexQueryOptions(manifest));
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    if (!index.data) return [];
    if (!value.trim()) {
      // With nothing typed the palette offers the corpus in reading order,
      // which is a table of contents rather than an empty box.
      return index.data.documents.slice(0, SHOWN).map((document) => ({ document }));
    }
    return searchDocs(index.data, value).hits.slice(0, SHOWN);
  }, [index.data, value]);

  // Adjusting state during render rather than in an effect, which is what
  // React documents for exactly this case: the highlighted row belongs to a
  // particular query, so when the query changes the old index is stale before
  // anything is painted. An effect would render one frame with row four of a
  // list that now has two entries.
  const [activeFor, setActiveFor] = useState(value);
  if (activeFor !== value) {
    setActiveFor(value);
    setActive(0);
  }

  useEffect(() => {
    list.current?.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (route: string) => {
    onClose();
    navigate(route);
  };

  const runActive = () => {
    const hit = hits[active];
    if (hit) go(hit.document.route);
  };

  return (
    <CommandOverlay
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Jump to a documentation page"
      description="Search every page in the corpus by title, heading or wording."
    >
      <input
        className="vt-palette__input"
        placeholder="Jump to a page"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label="Documentation page search"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, hits.length - 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            runActive();
          }
        }}
      />

      {index.isPending && (
        <div className="docs-palette__loading" role="status" aria-label="Loading the corpus index">
          <Skeleton height={14} width="52%" />
          <Skeleton height={14} width="38%" />
        </div>
      )}

      {index.isError && (
        <p className="docs-palette__message" role="alert">
          The page index could not be read, so jumping is unavailable. The section list on the left
          still reaches every page.
        </p>
      )}

      {index.data && hits.length === 0 && (
        <p className="docs-palette__message">
          No page matches <span className="docs-mono">{value}</span>.
        </p>
      )}

      {hits.length > 0 && (
        <div
          className="vt-palette__list"
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Documentation pages"
          ref={list}
        >
          {hits.map((hit, position) => (
            <button
              key={hit.document.id}
              id={optionId(position)}
              role="option"
              aria-selected={position === active}
              type="button"
              className={`vt-palette__row${position === active ? ' vt-palette__row--on' : ''}`}
              onClick={() => go(hit.document.route)}
              onMouseEnter={() => setActive(position)}
            >
              <span className="docs-palette__title">{hit.document.title}</span>
              <span className="docs-palette__where">
                {typeMeta(manifest, hit.document.type).label} ·{' '}
                {manifest.domains.find((domain) => domain.key === hit.document.domain)?.title ??
                  hit.document.domain}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="docs-palette__hint">
        <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move, <Kbd>Enter</Kbd> to open, <Kbd>Esc</Kbd> to close.
      </p>
    </CommandOverlay>
  );
}
