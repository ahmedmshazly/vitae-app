import { NODE_TYPES, type NodeType } from '@vitae/core';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import type { FocusTrailHop } from './types.js';

export interface GraphPathfinderProps {
  fromId: string | null;
  fromTitle: string;
  toId: string | null;
  toTitle: string | null;
  onPickTo: (entity: PickedEntity) => void;
  onClearTo: () => void;
  selfId: string | null;
}

/** A/B endpoint chrome for Path mode: A defaults to self; B via EntityPicker or canvas click. */
export function GraphPathfinder({
  fromId,
  fromTitle,
  toId,
  toTitle,
  onPickTo,
  onClearTo,
  selfId,
}: GraphPathfinderProps) {
  return (
    <div className="lifemap__pathfinder">
      <div className="lifemap__endpoint">
        <span className="lifemap__endpointlabel">From</span>
        <span className="lifemap__endpointvalue">{fromTitle || fromId || 'Self'}</span>
        {selfId && fromId !== selfId && (
          <span className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
            (defaults to self when opening Path)
          </span>
        )}
      </div>
      <div className="lifemap__endpoint lifemap__endpoint--to">
        <span className="lifemap__endpointlabel">To</span>
        {toId && toTitle ? (
          <div className="hstack" style={{ gap: 8 }}>
            <span className="lifemap__endpointvalue">{toTitle}</span>
            <button type="button" className="graph__tool" onClick={onClearTo}>
              clear
            </button>
          </div>
        ) : (
          <EntityPicker
            types={[...NODE_TYPES] as NodeType[]}
            onPick={onPickTo}
            placeholder="Search who or what…"
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
