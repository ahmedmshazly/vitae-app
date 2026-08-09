/**
 * Side dock comparing two Atlas cities.
 */
import { Link } from 'react-router-dom';
import { Button, Mono } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { Corridor, SharedPerson } from './corridors.js';
import type { MapTrip } from './types.js';

export interface AtlasCompareDockProps {
  cityA: string;
  cityB: string;
  shared: SharedPerson[];
  linkingTrips: MapTrip[];
  corridor: Corridor | null;
  onClose: () => void;
  onSelectTrip: (trip: MapTrip) => void;
  onOpenCorridor: () => void;
}

export function AtlasCompareDock({
  cityA,
  cityB,
  shared,
  linkingTrips,
  corridor,
  onClose,
  onSelectTrip,
  onOpenCorridor,
}: AtlasCompareDockProps) {
  const strongest = linkingTrips[0] ?? null;

  return (
    <aside className="atlas__dossier" aria-label={`Compare ${cityA} and ${cityB}`}>
      <div className="atlas__dossierhead">
        <div>
          <div className="atlas__dossiertitle">
            {cityA} · {cityB}
          </div>
          <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', marginTop: 4 }}>
            Compare places
            {corridor ? (
              <>
                {' '}
                · <Mono>{corridor.count} corridor trip{corridor.count === 1 ? '' : 's'}</Mono>
              </>
            ) : null}
          </div>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {shared.length > 0 ? (
        <div className="atlas__companions">
          <span className="lifemap__grouplabel">Shared people</span>
          <div className="chips">
            {shared.map((p) => (
              <Link key={p.id} className="atlas__companion" to={entityHref('person', p.id)}>
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="u-faint" style={{ fontSize: 'var(--ae-text-sm)', margin: 0 }}>
          No shared people in both places.
        </p>
      )}

      {linkingTrips.length > 0 && (
        <div className="atlas__tripsblock">
          <span className="lifemap__grouplabel">Linking trips</span>
          {linkingTrips.map((t) => (
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

      <div className="atlas__dossierfoot">
        {strongest && (
          <Button size="sm" variant="primary" onClick={() => onSelectTrip(strongest)}>
            Show route
          </Button>
        )}
        {corridor && (
          <Button size="sm" onClick={onOpenCorridor}>
            Corridor
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          Clear
        </Button>
      </div>
    </aside>
  );
}
