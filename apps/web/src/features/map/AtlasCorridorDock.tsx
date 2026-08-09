/**
 * Side dock for a selected city↔city corridor.
 */
import { Link } from 'react-router-dom';
import { Button, Mono } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { Corridor, SharedPerson } from './corridors.js';
import type { MapTrip } from './types.js';

export interface AtlasCorridorDockProps {
  corridor: Corridor;
  trips: MapTrip[];
  people: SharedPerson[];
  onClose: () => void;
  onSelectTrip: (trip: MapTrip) => void;
  onCompare: () => void;
}

export function AtlasCorridorDock({
  corridor,
  trips,
  people,
  onClose,
  onSelectTrip,
  onCompare,
}: AtlasCorridorDockProps) {
  return (
    <aside className="atlas__dossier" aria-label={`${corridor.a} to ${corridor.b} corridor`}>
      <div className="atlas__dossierhead">
        <div>
          <div className="atlas__dossiertitle">
            {corridor.a} ↔ {corridor.b}
          </div>
          <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', marginTop: 4 }}>
            <Mono>
              {corridor.count} trip{corridor.count === 1 ? '' : 's'}
            </Mono>
          </div>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {trips.length > 0 && (
        <div className="atlas__tripsblock">
          <span className="lifemap__grouplabel">Trips on this corridor</span>
          {trips.map((t) => (
            <button
              key={t.id}
              type="button"
              className="atlas__tripbtn"
              onClick={() => onSelectTrip(t)}
            >
              Show route · {t.title}
            </button>
          ))}
        </div>
      )}

      {people.length > 0 && (
        <div className="atlas__companions">
          <span className="lifemap__grouplabel">People</span>
          <div className="chips">
            {people.map((p) => (
              <Link key={p.id} className="atlas__companion" to={entityHref('person', p.id)}>
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="atlas__dossierfoot">
        <Button size="sm" variant="primary" onClick={onCompare}>
          Compare places
        </Button>
      </div>
    </aside>
  );
}
