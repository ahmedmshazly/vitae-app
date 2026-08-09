import { InfoPopover } from '@vitae/ui';
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
}: GraphToolbarProps) {
  return (
    <header className="lifemap__chrome">
      <div className="lifemap__titleblock">
        <span className="flex items-center gap-2">
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
              Colour marks the kind of record, the eight slots are fixed, so a type keeps its hue whatever is
              filtered. Every node is labelled as well, so the colour never carries the meaning by itself.
            </p>
            <p>Double-click a node to open it; drag the background to pan and scroll to zoom.</p>
          </InfoPopover>
        </span>
        <p className="lifemap__hint">
          {modeHint}
          <span className="u-faint"> · depth {depth}</span>
          {truncated ? <span className="u-faint"> · truncated at 1.5k</span> : null}
        </p>
      </div>

      <div className="lifemap__modes" role="group" aria-label="Explorer mode">
        <button
          type="button"
          className={`lifemap__mode${mode === 'explore' ? ' lifemap__mode--on' : ''}`}
          onClick={() => onMode('explore')}
        >
          Explore
        </button>
        <button
          type="button"
          className={`lifemap__mode${mode === 'path' ? ' lifemap__mode--on' : ''}`}
          onClick={() => onMode('path')}
        >
          Path
        </button>
      </div>

      <div className="lifemap__row" aria-label="Entity filters">
        {typeGroups.map((group) => (
          <div key={group.label} className="lifemap__group">
            <span className="lifemap__grouplabel">{group.label}</span>
            <div className="chips">
              {group.types.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`graph__filter${activeTypes.has(t) ? ' graph__filter--on' : ''}`}
                  style={{ borderColor: activeTypes.has(t) ? colorForType(palette, t) : undefined }}
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

      <div className="lifemap__row lifemap__row--lenses" aria-label="Discovery lenses">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            title={l.hint}
            className={`lifemap__lens${lens === l.id ? ' lifemap__lens--on' : ''}`}
            onClick={() => onLens(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {lens === 'edgeKinds' && edgeTypes.length > 0 && (
        <div className="lifemap__row" aria-label="Edge kinds">
          {edgeTypes.map((et) => (
            <button
              key={et}
              type="button"
              className={`graph__filter${activeEdgeTypes.has(et) ? ' graph__filter--on' : ''}`}
              onClick={() => onToggleEdgeType(et)}
            >
              {edgeTypeLabel(et)}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
