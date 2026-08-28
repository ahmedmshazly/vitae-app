import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, Spread } from '@vitae/ui';
import type { FgNode } from './types.js';

export interface GraphSearchProps {
  open: boolean;
  nodes: FgNode[];
  onClose: () => void;
  onPick: (node: FgNode) => void;
}

const LISTBOX_ID = 'lifemap-search-listbox';
const optionId = (i: number) => `lifemap-search-option-${i}`;
/** How many rows the panel will show at once. */
const HIT_LIMIT = 12;

/**
 * ⌘F typeahead over nodes currently in the life-map view.
 *
 * It drives a list with the arrow keys, so it owes assistive tech the combobox
 * contract that goes with that: the input owns the listbox, the rows are real
 * options, and the highlighted row is named through aria-activedescendant.
 * Before, arrowing changed a background tone and announced nothing, which made
 * the one keyboard entry point into the map unusable without sight.
 */
export function GraphSearch({ open, nodes, onClose, onPick }: GraphSearchProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Reset while rendering rather than from an effect. The effect version set
  // state on every open/close and is the shape the React lint rule warns about.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setQ('');
    setActive(0);
  }

  // Closing used to leave focus on <body>, on a screen whose whole value is
  // keyboard locomotion. Remember where ⌘F was pressed and hand it back.
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) el.focus();
    return undefined;
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return nodes;
    return nodes.filter(
      (n) => n.title.toLowerCase().includes(needle) || n.type.includes(needle),
    );
  }, [nodes, q]);

  const hits = useMemo(() => matches.slice(0, HIT_LIMIT), [matches]);
  // The list can shrink under a stale index, so clamp here instead of chasing
  // it with another effect.
  const activeIndex = hits.length === 0 ? 0 : Math.min(active, hits.length - 1);

  const searching = q.trim().length > 0;
  const noun = searching ? 'matches' : 'records in view';
  const status =
    hits.length === 0
      ? 'No matches in view'
      : matches.length > hits.length
        ? `Showing ${hits.length} of ${matches.length} ${noun}, keep typing to narrow`
        : searching
          ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`
          : `${hits.length} ${hits.length === 1 ? 'record' : 'records'} in view`;

  if (!open) return null;

  return (
    <div className="lifemap__search" role="search">
      <input
        ref={inputRef}
        className="lifemap__searchinput"
        value={q}
        placeholder="Find in map..."
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={hits.length > 0 ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        aria-label="Search nodes in graph"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
          } else if (e.key === 'Enter' && hits[activeIndex]) {
            e.preventDefault();
            onPick(hits[activeIndex]!);
            onClose();
          }
        }}
      />
      <div className="lifemap__searchlist" id={LISTBOX_ID} role="listbox" aria-label="Records in view">
        {hits.map((n, i) => (
          <button
            key={n.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            type="button"
            className={`lifemap__searchrow items-center min-h-8 pointer-coarse:min-h-11${i === activeIndex ? ' lifemap__searchrow--on' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              onPick(n);
              onClose();
            }}
          >
            <span>{n.title}</span>
            <span className="u-faint">{n.type}</span>
          </button>
        ))}
      </div>
      {/* Beside the listbox, never inside it: an option list may only contain
          options, and the count has to be spoken as it changes. */}
      <p className="u-faint lifemap__searchempty" role="status">
        {status}
      </p>
    </div>
  );
}

export interface ConnectedListProps {
  open: boolean;
  selected: FgNode | null;
  rows: Array<{ node: FgNode; edgeLabel: string }>;
  onSelect: (node: FgNode) => void;
  onToggle: () => void;
}

/** Compact a11y alternative to canvas-only neighbor discovery. */
export function ConnectedList({ open, selected, rows, onSelect, onToggle }: ConnectedListProps) {
  if (!open) return null;
  return (
    <div className="lifemap__connectedpanel" role="region" aria-label="Connected nodes">
      {/* Was an inline style putting 6px of margin on a hand-rolled row. */}
      <Spread align="center" className="mb-2">
        <span className="lifemap__grouplabel">Connected</span>
        {/* "hide" named nothing and reported nothing, while the toolbar's own
            toggle for the same panel already carried its state. */}
        <button type="button" className="graph__tool" aria-expanded={open} onClick={onToggle}>
          Hide connected list
        </button>
      </Spread>
      {!selected ? (
        <EmptyState
          glyph="search"
          title="Nothing selected"
          hint="Pick a node on the map, or press ⌘F to find one."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          glyph="graph"
          title="No neighbors in view"
          hint="Widen the record filters or expand the depth."
        />
      ) : (
        <ul className="lifemap__connectedlist">
          {rows.map(({ node, edgeLabel }) => (
            <li key={node.id}>
              <button type="button" className="graph__peekrow" onClick={() => onSelect(node)}>
                <span className="graph__peekrowtitle">{node.title}</span>
                <span className="u-faint">{edgeLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
