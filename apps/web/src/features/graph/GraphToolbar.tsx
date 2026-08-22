import { useId } from 'react';
import { InfoPopover, Inline, StatusTrace, Tooltip } from '@vitae/ui';
import { colorForType, type GraphPalette } from '../../lib/graph-palette.js';
import { LENSES, shortTypeLabel } from './constants.js';
import type { GraphLens, GraphMode } from './types.js';
import { edgeTypeLabel } from '@vitae/core';

export interface GraphToolbarProps {
  mode: GraphMode;
  onMode: (mode: GraphMode) => void;
  lens: GraphLens;
  onLens: (lens: GraphLens) => void;
  typeGroups: Array<{ label: string; types: string[] }>;
  activeTypes: Set<string>;
  onToggleType: (type: string) => void;
  edgeTypes: string[];
  activeEdgeTypes: Set<string>;
  onToggleEdgeType: (type: string) => void;
  depth: number;
  truncated: boolean;
  palette: GraphPalette;
  modeHint: string;
  nodeCount?: number;
  connectionCount?: number;
  focusTitle?: string;
  busy?: boolean;
  /** The map request failed. Overrides the count-based guess below. */
  failed?: boolean;
  /** What the failed request said, shown as the trace detail. */
  errorMessage?: string;
}

export function GraphToolbar({
  mode,
  onMode,
  lens,
  onLens,
  typeGroups,
  activeTypes,
  onToggleType,
  edgeTypes,
  activeEdgeTypes,
  onToggleEdgeType,
  depth,
  truncated,
  palette,
  modeHint,
  nodeCount,
  connectionCount,
  focusTitle,
  busy = false,
  failed,
  errorMessage,
}: GraphToolbarProps) {
  const groupLabelId = useId();

  // The counts are the view's, and the view is null whenever the query has no
  // data. So "not loading and no count" is the same fact as "the map did not
  // load", and until the caller passes `failed` it is the only honest reading.
  // Without it the trace fell through `?? 0` and told a screen reader the map
  // was assembled and simply held nothing.
  const loadFailed = failed ?? (!busy && nodeCount == null);

  const counts = `${nodeCount ?? 0} ${nodeCount === 1 ? 'record' : 'records'} · ${connectionCount ?? 0} ${connectionCount === 1 ? 'connection' : 'connections'}${focusTitle ? ` · focus ${focusTitle}` : ''}${truncated ? ' · limit 1,500' : ''}`;

  return (
    <header className="lifemap__chrome">
      <div className="explore-instrument__heading">
        <div className="lifemap__titleblock">
          <Inline align="center" gap={2}>
            <h1 className="lifemap__title">Life map</h1>
            {/* The graph has real keyboard locomotion and no way to find out.
                Nothing announced it, so it may as well not have existed. */}
            <InfoPopover
              title="Moving around the map"
              shortcuts={[
                { keys: '⌘F', label: 'Find a record and jump to it' },
                { keys: '← →', label: 'Walk the connections of the selected record' },
                { keys: 'Enter', label: 'Open the selected record' },
                { keys: 'F', label: 'Re-centre the map on the selection' },
                { keys: 'P', label: 'Toggle path mode' },
                { keys: '+ −', label: 'Show more or fewer hops' },
                { keys: 'Esc', label: 'Clear the selection' },
              ]}
            >
              <p>
                Colour marks the kind of record, the eight slots are fixed, so a type keeps its hue
                whatever is filtered. Every node is labelled as well, so the colour never carries
                the meaning by itself.
              </p>
              <p>Double-click a node to open it; drag the background to pan and scroll to zoom.</p>
            </InfoPopover>
          </Inline>
          <p className="lifemap__hint">
            {modeHint}
            <span className="u-faint"> · depth {depth}</span>
          </p>
        </div>
        <StatusTrace
          className="explore-instrument__trace"
          tone={loadFailed ? 'danger' : truncated ? 'warning' : busy ? 'live' : 'neutral'}
          // The canvas already owns the assertive alert for this failure, so
          // this one stays silent rather than saying it twice.
          announce={!loadFailed}
          label={
            loadFailed
              ? 'Couldn’t draw the map'
              : busy
                ? 'Connecting records'
                : truncated
                  ? 'Showing a bounded map'
                  : 'Map assembled from your records'
          }
          detail={
            loadFailed
              ? (errorMessage ?? 'The map request did not complete. Retry from the canvas.')
              : busy
                ? 'Reading nodes and relationships'
                : counts
          }
        />
      </div>

      <div className="explore-control-band">
        <span className="explore-control-band__label">Mode</span>
        <div className="lifemap__modes" role="group" aria-label="Explorer mode">
          <button
            type="button"
            className={`lifemap__mode${mode === 'explore' ? ' lifemap__mode--on' : ''}`}
            aria-pressed={mode === 'explore'}
            onClick={() => onMode('explore')}
          >
            Explore
          </button>
          <button
            type="button"
            className={`lifemap__mode${mode === 'path' ? ' lifemap__mode--on' : ''}`}
            aria-pressed={mode === 'path'}
            onClick={() => onMode('path')}
          >
            Path
          </button>
        </div>
      </div>

      <div className="explore-control-band">
        <span className="explore-control-band__label">Records</span>
        {/* aria-label needs a role to land on. Without one these three bands
            reached assistive tech as an unbroken run of thirty toggles. */}
        <div className="lifemap__row" role="group" aria-label="Entity filters">
          {typeGroups.map((group, gi) => (
            <div
              key={group.label}
              className="lifemap__group"
              role="group"
              aria-labelledby={`${groupLabelId}-${gi}`}
            >
              <span className="lifemap__grouplabel" id={`${groupLabelId}-${gi}`}>
                {group.label}
              </span>
              <div className="chips">
                {group.types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={activeTypes.has(t)}
                    className={`graph__filter${activeTypes.has(t) ? ' graph__filter--on' : ''}`}
                    onClick={() => onToggleType(t)}
                  >
                    <span
                      className="graph__filterdot"
                      style={{ background: colorForType(palette, t) }}
                      aria-hidden
                    />
                    {shortTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="explore-control-band">
        <span className="explore-control-band__label">Lens</span>
        <div className="lifemap__row lifemap__row--lenses" role="group" aria-label="Discovery lenses">
          {LENSES.map((l) => (
            // A title attribute is a mouse-only reveal. The tooltip opens on
            // focus too, which is the only way these five names explain
            // themselves to a keyboard or a touch.
            <Tooltip key={l.id} content={l.hint}>
              <button
                type="button"
                aria-pressed={lens === l.id}
                className={`lifemap__lens${lens === l.id ? ' lifemap__lens--on' : ''}`}
                onClick={() => onLens(l.id)}
              >
                {l.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {lens === 'edgeKinds' && edgeTypes.length > 0 && (
        <div className="explore-control-band">
          <span className="explore-control-band__label">Kinds</span>
          <div className="lifemap__row" role="group" aria-label="Edge kinds">
            {edgeTypes.map((et) => (
              <button
                key={et}
                type="button"
                aria-pressed={activeEdgeTypes.has(et)}
                className={`graph__filter${activeEdgeTypes.has(et) ? ' graph__filter--on' : ''}`}
                onClick={() => onToggleEdgeType(et)}
              >
                {edgeTypeLabel(et)}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
