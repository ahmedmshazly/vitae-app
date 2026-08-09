import { Mono } from '@vitae/ui';
import { cityScreenPos } from './geo.js';
import type { MapCity, MapTrip } from './types.js';

export interface AtlasListProps {
  cities: MapCity[];
  trips: MapTrip[];
  selectedCity: string | null;
  onSelectCity: (city: string) => void;
  onSelectTrip: (trip: MapTrip) => void;
  onPlaceUnmapped?: (city: string) => void;
  filterQuery: string;
  onFilterQuery: (q: string) => void;
}

export function AtlasList({
  cities,
  trips,
  selectedCity,
  onSelectCity,
  onSelectTrip,
  onPlaceUnmapped,
  filterQuery,
  onFilterQuery,
}: AtlasListProps) {
  const q = filterQuery.trim().toLowerCase();
  const filtered = cities.filter((c) => !q || c.city.toLowerCase().includes(q));
  const mapped = filtered.filter((c) => cityScreenPos(c).mapped);
  const unmapped = filtered.filter((c) => !cityScreenPos(c).mapped);
  const tripHits = trips.filter((t) => !q || t.title.toLowerCase().includes(q));

  return (
    <div className="atlas__list">
      <div className="atlas__listfilter">
        <input
          className="lifemap__searchinput"
          value={filterQuery}
          placeholder="Filter places and trips…"
          aria-label="Filter list"
          onChange={(e) => onFilterQuery(e.target.value)}
        />
      </div>
      <section>
        <h2 className="atlas__listhead">Cities ({mapped.length})</h2>
        <ul className="atlas__listul">
          {mapped.map((c) => (
            <li key={c.city}>
              <button
                type="button"
                className={`atlas__listrow${selectedCity === c.city ? ' atlas__listrow--on' : ''}`}
                onClick={() => onSelectCity(c.city)}
              >
                <span className="atlas__listrowtitle">{c.city}</span>
                <Mono>{c.count}</Mono>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {unmapped.length > 0 && (
        <section>
          <h2 className="atlas__listhead">Unmapped ({unmapped.length})</h2>
          <ul className="atlas__listul">
            {unmapped.map((c) => (
              <li key={c.city}>
                <div className="atlas__unmappedrow">
                  <button type="button" className="atlas__listrow" onClick={() => onSelectCity(c.city)}>
                    <span className="atlas__listrowtitle">{c.city}</span>
                    <Mono className="u-faint">no coords</Mono>
                  </button>
                  {onPlaceUnmapped && (
                    <button type="button" className="graph__tool" onClick={() => onPlaceUnmapped(c.city)}>
                      Place on map
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tripHits.length > 0 && (
        <section>
          <h2 className="atlas__listhead">Trips ({tripHits.length})</h2>
          <ul className="atlas__listul">
            {tripHits.map((t) => (
              <li key={t.id}>
                <button type="button" className="atlas__listrow" onClick={() => onSelectTrip(t)}>
                  <span className="atlas__listrowtitle">{t.title}</span>
                  <Mono>{t.stops.length} stops</Mono>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
