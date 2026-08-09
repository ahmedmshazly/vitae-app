import { Link } from 'react-router-dom';
import { edgeDisplayLabel, edgeTypeLabel } from '@vitae/core';
import { Button, Chip, EntityGlyph, Mono } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import { colorForType, type GraphPalette } from '../../lib/graph-palette.js';
import type { FgNode, FocusTrailHop, GraphPathResult } from './types.js';

export interface PeekLink {
  neighbor: FgNode;
  edgeType: string;
  direction: 'out' | 'in';
  relation?: string;
  kind?: string;
}

export interface GraphPeekProps {
  selected: FgNode;
  links: PeekLink[];
  palette: GraphPalette;
  onClose: () => void;
  onSelectNeighbor: (node: FgNode) => void;
  onOpen: () => void;
  onMakeFocus: () => void;
  onFindPath: () => void;
  onCopyLink: () => void;
  recordHref: string;
}

export function GraphPeek({
  selected,
  links,
  palette,
  onClose,
  onSelectNeighbor,
  onOpen,
  onMakeFocus,
  onFindPath,
  onCopyLink,
  recordHref,
}: GraphPeekProps) {
  const grouped = new Map<string, PeekLink[]>();
  for (const link of links) {
    const key = edgeDisplayLabel(link.edgeType, link.direction, {
      relation: link.relation,
      kind: link.kind,
    });
    (grouped.get(key) ?? grouped.set(key, []).get(key)!).push(link);
  }

  return (
    <div className="graph__peek graph__peek--dossier" role="dialog" aria-label={`${selected.title} details`}>
      <div className="hstack" style={{ gap: 'var(--ae-space-2)' }}>
        <EntityGlyph type={selected.type} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="graph__peektitle">{selected.title}</div>
          <div className="hstack" style={{ gap: 6 }}>
            <Chip mono>{selected.isSelf ? 'self' : selected.type}</Chip>
            <Mono className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
              {selected.degree} links · hop {selected.hop}
            </Mono>
          </div>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close peek" onClick={onClose}>
          ×
        </button>
      </div>

      {grouped.size > 0 && (
        <div className="graph__peeklist">
          {[...grouped.entries()].map(([label, rows]) => (
            <div key={label} className="graph__peekgroup">
              <div className="graph__peekgrouplabel">{label}</div>
              {rows.map((row) => (
                <button
                  key={`${row.edgeType}-${row.neighbor.id}`}
                  type="button"
                  className="graph__peekrow"
                  onClick={() => onSelectNeighbor(row.neighbor)}
                >
                  <span
                    className="graph__filterdot"
                    style={{ background: colorForType(palette, row.neighbor.type) }}
                    aria-hidden
                  />
                  <span className="graph__peekrowtitle">{row.neighbor.title}</span>
                  <Link
                    className="graph__peekopen"
                    to={entityHref(row.neighbor.type, row.neighbor.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${row.neighbor.title}`}
                  >
                    open
                  </Link>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="graph__peekactions">
        <Button size="sm" variant="primary" onClick={onOpen}>
          Open record
        </Button>
        <Button size="sm" onClick={onMakeFocus}>
          Make focus
        </Button>
        <Button size="sm" onClick={onFindPath}>
          Path from self
        </Button>
        <Button size="sm" onClick={onCopyLink}>
          Copy link
        </Button>
      </div>
      <Link className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }} to={recordHref}>
        {recordHref}
      </Link>
    </div>
  );
}

export interface FocusBreadcrumbProps {
  trail: FocusTrailHop[];
  onHop: (id: string) => void;
  onReset: () => void;
}

export function FocusBreadcrumb({ trail, onHop, onReset }: FocusBreadcrumbProps) {
  if (trail.length === 0) return null;
  return (
    <nav className="lifemap__trail" aria-label="Focus trail">
      {trail.map((hop, i) => (
        <span key={`${hop.id}-${i}`} className="lifemap__trailhop">
          {i > 0 && <span className="lifemap__trailsep" aria-hidden>→</span>}
          <button type="button" className="lifemap__trailbtn" onClick={() => onHop(hop.id)}>
            {hop.title}
          </button>
        </span>
      ))}
      <button type="button" className="lifemap__trailreset" onClick={onReset}>
        reset
      </button>
    </nav>
  );
}

export interface PathStoryProps {
  path: GraphPathResult | null | undefined;
  loading: boolean;
  emptyHint: string;
  /** The lookup itself failed, distinct from "there is no path". */
  failed?: boolean;
}

export function PathStory({ path, loading, emptyHint, failed }: PathStoryProps) {
  if (loading) {
    return <div className="lifemap__story u-faint">Finding path…</div>;
  }
  // A failed lookup left `path` undefined and returned null, so asking for a
  // path showed nothing at all, indistinguishable from never having asked.
  if (failed) {
    return (
      <div className="lifemap__story" role="alert">
        <strong className="font-semibold">Couldn’t work out a path.</strong> The lookup failed, the map itself is
        unaffected.
      </div>
    );
  }
  if (!path) return null;
  if (!path.found || path.hops.length === 0) {
    return <div className="lifemap__story lifemap__story--empty">{emptyHint}</div>;
  }

  const parts: string[] = [];
  for (let i = 0; i < path.hops.length; i++) {
    const hop = path.hops[i]!;
    if (i === 0) {
      parts.push(hop.title);
      continue;
    }
    const via = hop.viaEdgeType ? edgeTypeLabel(hop.viaEdgeType) : 'linked';
    parts.push(`:  ${via} → ${hop.title}`);
  }

  return (
    <div className="lifemap__story" role="status">
      <span className="lifemap__storylabel">Path</span>
      <span className="lifemap__storytext">{parts.join(' ')}</span>
    </div>
  );
}
