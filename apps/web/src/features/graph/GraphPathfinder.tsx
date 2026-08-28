import { useId } from 'react';
import type { NodeType } from '@vitae/core';
import { Inline } from '@vitae/ui';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { DEFAULT_ACTIVE_TYPES } from './constants.js';
import type { FocusTrailHop } from './types.js';

export interface GraphPathfinderProps {
  fromId: string | null;
  fromTitle: string;
  toId: string | null;
  toTitle: string | null;
  onPickTo: (entity: PickedEntity) => void;
  onClearTo: () => void;
  selfId: string | null;
  /**
   * Types the destination picker offers. Handing it every node type produced a
   * wall of thirty-five filter chips that pushed the canvas off the screen, so
   * this defaults to the kinds the map draws unless the caller knows better.
   */
  destinationTypes?: readonly NodeType[];
}

const DEFAULT_DESTINATION_TYPES = [...DEFAULT_ACTIVE_TYPES] as NodeType[];

/** A/B endpoint chrome for Path mode: A defaults to self; B via EntityPicker or canvas click. */
export function GraphPathfinder({
  fromId,
  fromTitle,
  toId,
  toTitle,
  onPickTo,
  onClearTo,
  selfId,
  destinationTypes = DEFAULT_DESTINATION_TYPES,
}: GraphPathfinderProps) {
  const ids = useId();
  const fromLabelId = `${ids}-from`;
  const toLabelId = `${ids}-to`;

  return (
    <div className="lifemap__pathfinder">
      <div className="lifemap__endpoint" role="group" aria-labelledby={fromLabelId}>
        <span className="lifemap__endpointlabel" id={fromLabelId}>
          From
        </span>
        <span className="lifemap__endpointvalue">{fromTitle || fromId || 'Self'}</span>
        {/* This used to be guarded on `fromId !== selfId`, which GraphView can
            never make true, so the one sentence explaining why From has no
            control was dead code. People clicked it and nothing happened. */}
        <span className="u-faint text-xs block">
          {selfId && fromId === selfId
            ? 'Paths always start from you'
            : 'Starting from the focused record'}
        </span>
      </div>
      <div className="lifemap__endpoint lifemap__endpoint--to" role="group" aria-labelledby={toLabelId}>
        <span className="lifemap__endpointlabel" id={toLabelId}>
          To
        </span>
        {toId && toTitle ? (
          <Inline gap={2} align="center">
            <span className="lifemap__endpointvalue">{toTitle}</span>
            <button type="button" className="graph__tool" onClick={onClearTo}>
              Clear
            </button>
          </Inline>
        ) : (
          <EntityPicker
            types={destinationTypes as NodeType[]}
            onPick={onPickTo}
            placeholder="Search a destination record..."
          />
        )}
      </div>
    </div>
  );
}

export function trailAfterJump(trail: FocusTrailHop[], next: FocusTrailHop): FocusTrailHop[] {
  const idx = trail.findIndex((h) => h.id === next.id);
  if (idx >= 0) return trail.slice(0, idx + 1);
  return [...trail, next];
}
