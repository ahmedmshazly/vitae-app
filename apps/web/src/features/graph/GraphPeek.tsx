import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { edgeDisplayLabel, edgeTypeLabel } from '@vitae/core';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Glyph,
  Inline,
  Mono,
  StatusTrace,
} from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { GraphPalette } from '../../lib/graph-palette.js';
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
  /** Kept for the caller's sake, the peek now names types rather than tinting them. */
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
  onClose,
  onSelectNeighbor,
  onOpen,
  onMakeFocus,
  onFindPath,
  onCopyLink,
  recordHref,
}: GraphPeekProps) {
  const groupId = useId();
  const grouped = new Map<string, PeekLink[]>();
  for (const link of links) {
    const key = edgeDisplayLabel(link.edgeType, link.direction, {
      relation: link.relation,
      kind: link.kind,
    });
    (grouped.get(key) ?? grouped.set(key, []).get(key)!).push(link);
  }

  return (
    // Not a dialog: nothing focuses it, nothing traps focus in it, and the
    // canvas keeps the caret. It is an inspector anchored to the selection.
    <div
      className="graph__peek graph__peek--dossier"
      role="region"
      aria-label={`${selected.title} details`}
    >
      <Inline gap={2}>
        <EntityGlyph type={selected.type} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="graph__peektitle">{selected.title}</div>
          <Inline gap={2}>
            <Chip mono>{selected.isSelf ? 'self' : selected.type}</Chip>
            <Mono className="text-xs u-faint">
              {selected.degree} links · hop {selected.hop}
            </Mono>
          </Inline>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close peek" onClick={onClose}>
          <Glyph name="close" size={14} />
        </button>
      </Inline>

      {grouped.size > 0 ? (
        <div className="graph__peeklist">
          {[...grouped.entries()].map(([label, rows], gi) => (
            <div
              key={label}
              className="graph__peekgroup"
              role="group"
              aria-labelledby={`${groupId}-${gi}`}
            >
              <h3 id={`${groupId}-${gi}`} className="graph__peekgrouplabel font-normal">
                {label}
              </h3>
              <ul className="list-none m-0 p-0">
                {rows.map((row) => (
                  <li key={`${row.edgeType}-${row.neighbor.id}`} className="graph__peekrow">
                    <button
                      type="button"
                      className="graph__peekselect"
                      onClick={() => onSelectNeighbor(row.neighbor)}
                    >
                      {/* A tinted dot was the only thing saying what kind of
                          record this row was, and it was aria-hidden. The glyph
                          carries a shape and names the type in its title. */}
                      <EntityGlyph type={row.neighbor.type} size="sm" />
                      <span className="graph__peekrowtitle">{row.neighbor.title}</span>
                    </button>
                    <Link
                      className="graph__peekopen"
                      to={entityHref(row.neighbor.type, row.neighbor.id)}
                      aria-label={`Open ${row.neighbor.title}`}
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          glyph="graph"
          title="No connections in view"
          hint="Widen the record filters above, or press + to expand the depth."
        />
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
      {/* Evidence, not a second route to the same place. As a link its name was
          a URL fragment read out slash by slash beside "Open record". */}
      <Mono className="text-xs text-muted">{recordHref}</Mono>
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
          {i > 0 && (
            <span className="lifemap__trailsep" aria-hidden>
              →
            </span>
          )}
          {/* Every hop re-fetches the whole graph, so a mis-tap is expensive.
              These were roughly 23px and 17px tall. */}
          <button
            type="button"
            className="lifemap__trailbtn inline-flex items-center min-h-8 pointer-coarse:min-h-11"
            onClick={() => onHop(hop.id)}
          >
            {hop.title}
          </button>
        </span>
      ))}
      <button
        type="button"
        className="lifemap__trailreset inline-flex items-center min-h-8 pointer-coarse:min-h-11"
        onClick={onReset}
      >
        Reset
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
  /** Run the lookup again. Defaults to refetching the path query. */
  onRetry?: () => void;
}

/**
 * One persistent live region for the path lookup.
 *
 * Every state used to be its own element with its own role, or none: loading
 * was a bare div nobody heard, the result arrived in a region created in the
 * same commit as its content, and a failed lookup offered no way to try again.
 */
export function PathStory({ path, loading, emptyHint, failed, onRetry }: PathStoryProps) {
  const client = useQueryClient();
  const retry =
    onRetry ??
    (() => {
      void client.refetchQueries({ queryKey: ['graph-path'] });
    });

  let body: ReactNode = null;
  let empty = false;

  if (loading) {
    body = (
      <StatusTrace
        tone="live"
        label="Finding path"
        detail="Reading the connections between the two records"
        announce={false}
      />
    );
  } else if (failed) {
    body = (
      <ErrorState
        title="Couldn't work out a path"
        detail="The lookup failed. The map itself is unaffected."
        onRetry={retry}
      />
    );
  } else if (path && (!path.found || path.hops.length === 0)) {
    body = <span className="lifemap__storytext">{emptyHint}</span>;
    empty = true;
  } else if (path) {
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
    body = (
      <>
        <span className="lifemap__storylabel">Path</span>
        <span className="lifemap__storytext">{parts.join(' ')}</span>
      </>
    );
  }

  return (
    <div
      className={body ? `lifemap__story${empty ? ' lifemap__story--empty' : ''}` : undefined}
      role="status"
      aria-live="polite"
    >
      {body}
    </div>
  );
}
