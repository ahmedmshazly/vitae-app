/**
 * Side dock comparing two Atlas cities.
 */
import { Link } from 'react-router-dom';
import { Button, Mono, StatusTrace } from '@vitae/ui';
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
  return (
    <aside className="atlas__dossier" aria-label={`Compare ${cityA} and ${cityB}`}>
      <div className="atlas__dossierhead">
        <div>
          <h2 className="atlas__dossiertitle">
            {cityA} · {cityB}
          </h2>
          <div className="u-faint text-xs mt-1">
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

      {/* Both dossier panels say where their claims came from before making
          them. This one opened straight into "Shared people" with no account
          of what shared means or what was searched. */}
      <StatusTrace
        label="Comparison assembled from trips and place records"
        detail={`${shared.length} shared ${shared.length === 1 ? 'person' : 'people'} · ${linkingTrips.length} linking ${linkingTrips.length === 1 ? 'trip' : 'trips'}`}
        announce={false}
      />

      {shared.length > 0 ? (
        <div className="atlas__companions">
          <span className="lifemap__grouplabel">Shared people</span>
          <ul className="chips list-none m-0 p-0" aria-label="Shared people">
            {shared.map((p) => (
              <li key={p.id}>
                <Link
                  className="atlas__companion min-h-8 pointer-coarse:min-h-11"
                  to={entityHref('person', p.id)}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="u-faint text-sm m-0">No shared people in both places.</p>
      )}

      {/* The trips half of the answer used to vanish entirely when it was
          empty, so a search that found nothing looked like a panel that had
          never looked. */}
      {linkingTrips.length > 0 ? (
        <div className="atlas__companions">
          <span className="lifemap__grouplabel">Linking trips</span>
          <ul className="atlas__tripsblock list-none m-0 p-0" aria-label="Linking trips">
            {linkingTrips.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="atlas__tripbtn w-full"
                  onClick={() => onSelectTrip(t)}
                >
                  Show route · {t.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="u-faint text-sm m-0">No recorded trip connects these two places.</p>
      )}

      <div className="atlas__dossierfoot">
        {/* The footer's primary was a second "Show route" that silently meant
            linkingTrips[0]. Every route is now named once, in the list. */}
        {corridor && (
          <Button size="sm" onClick={onOpenCorridor}>
            Corridor
          </Button>
        )}
        {/* Was "Clear", which reads as resetting the pair and keeping the dock.
            It closes the dock, same as the × above it. */}
        <Button size="sm" onClick={onClose}>
          Close comparison
        </Button>
      </div>
    </aside>
  );
}
