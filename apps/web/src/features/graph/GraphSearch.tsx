import { useEffect, useMemo, useRef, useState } from 'react';
import type { FgNode } from './types.js';

export interface GraphSearchProps {
  open: boolean;
  nodes: FgNode[];
  onClose: () => void;
  onPick: (node: FgNode) => void;
}

/** ⌘F typeahead over nodes currently in the life-map view. */
export function GraphSearch({ open, nodes, onClose, onPick }: GraphSearchProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ('');
      setActive(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return nodes.slice(0, 12);
    return nodes
      .filter((n) => n.title.toLowerCase().includes(needle) || n.type.includes(needle))
      .slice(0, 12);
  }, [nodes, q]);

  if (!open) return null;

  return (
    <div className="lifemap__search" role="search">
      <input
        ref={inputRef}
        className="lifemap__searchinput"
        value={q}
        placeholder="Find in map…"
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
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            onPick(hits[active]!);
            onClose();
          }
        }}
      />
      <ul className="lifemap__searchlist" role="listbox">
        {hits.map((n, i) => (
          <li key={n.id}>
            <button
              type="button"
              className={`lifemap__searchrow${i === active ? ' lifemap__searchrow--on' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onPick(n);
                onClose();
              }}
            >
              <span>{n.title}</span>
              <span className="u-faint">{n.type}</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="u-faint lifemap__searchempty">No matches in view</li>}
      </ul>
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
      <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="lifemap__grouplabel">Connected</span>
        <button type="button" className="graph__tool" onClick={onToggle}>
          hide
        </button>
      </div>
      {!selected ? (
        <p className="u-faint">Select a node to list its neighborhood.</p>
      ) : rows.length === 0 ? (
        <p className="u-faint">No neighbors in the current view.</p>
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
