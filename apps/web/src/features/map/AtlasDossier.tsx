import { Link } from 'react-router-dom';
import { Button, Chip, EntityGlyph, Mono, StatusTrace } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { MapCity, MapRecord, MapTrip } from './types.js';

export interface AtlasDossierProps {
  city: MapCity | null;
  trip: MapTrip | null;
  tripsHere: MapTrip[];
  companionTitles: Map<string, string>;
  onClose: () => void;
  onSelectTrip: (trip: MapTrip | null) => void;
  onCopyLink: () => void;
  onCompare?: () => void;
}

function recordLinkLabel(link: MapRecord['link']): string {
  if (link === 'LOCATED_IN') return 'Located in relationship';
  if (link === 'VISITED') return 'Visited relationship';
  return 'City field';
}

export function AtlasDossier({
  city,
  trip,
  tripsHere,
  companionTitles,
  onClose,
  onSelectTrip,
  onCopyLink,
  onCompare,
}: AtlasDossierProps) {
  if (trip) {
    return (
      <aside className="atlas__dossier" aria-label={`${trip.title} route`}>
        <div className="atlas__dossierhead">
          <div>
            <div className="atlas__dossiertitle">{trip.title}</div>
            <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
              {trip.stops.length} stops
              {trip.start ? ` · ${trip.start}` : ''}
              {trip.end ? ` → ${trip.end}` : ''}
            </div>
          </div>
          <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <StatusTrace
          label="Route reconstructed from trip stops"
          detail={`${trip.stops.length} ${trip.stops.length === 1 ? 'stop' : 'stops'}${trip.companionIds.length ? ` · ${trip.companionIds.length} ${trip.companionIds.length === 1 ? 'companion' : 'companions'}` : ''}`}
          announce={false}
        />
        <ol className="atlas__stoplist">
          {trip.stops.map((s, i) => (
            <li key={`${s.city}-${i}`}>
              <span className="atlas__stopcity">{s.city}</span>
              <Mono className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                {s.nights != null ? `${s.nights}n` : ''}
                {s.date ? ` · ${s.date}` : ''}
              </Mono>
            </li>
          ))}
        </ol>
        {trip.companionIds.length > 0 && (
          <div className="atlas__companions">
            <span className="lifemap__grouplabel">Companions</span>
            <div className="chips">
              {trip.companionIds.map((id) => (
                <Link key={id} className="atlas__companion" to={entityHref('person', id)}>
                  {companionTitles.get(id) ?? id.slice(0, 8)}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="atlas__dossierfoot">
          <Button size="sm" variant="primary" onClick={() => onSelectTrip(null)}>
            Clear route
          </Button>
          <Button size="sm" onClick={() => window.open(entityHref('trip', trip.id), '_self')}>
            Open trip
          </Button>
        </div>
      </aside>
    );
  }

  if (!city) return null;

  const chronographHref =
    city.records.find((r) => r.date)?.date != null
      ? `/explore/timeline?from=${
          city.records
            .map((r) => r.date)
            .filter(Boolean)
            .sort()[0]
        }&to=${[...city.records]
          .map((r) => r.date)
          .filter(Boolean)
          .sort()
          .at(-1)}`
      : '/explore/timeline';

  return (
    <aside className="atlas__dossier" aria-label={`${city.city} dossier`}>
      <div className="atlas__dossierhead">
        <div>
          <div className="atlas__dossiertitle">{city.city}</div>
          <div className="chips" style={{ marginTop: 6 }}>
            {Object.entries(city.types).map(([t, n]) => (
              <Chip key={t} mono>
                {n} {t}
              </Chip>
            ))}
          </div>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <StatusTrace
        label="Place dossier linked from your records"
        detail={`${city.records.length} ${city.records.length === 1 ? 'record' : 'records'} · relationships remain inspectable`}
        announce={false}
      />

      <div className="atlas__dossierlist">
        {city.records.map((r: MapRecord) => (
          <Link key={r.id} to={entityHref(r.type, r.id)} className="atlas__dossierrow">
            <EntityGlyph type={r.type} size="sm" />
            <div className="atlas__dossierrowmain">
              <div className="atlas__dossierrowtitle">{r.title}</div>
              <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                {r.type}
                {` · ${recordLinkLabel(r.link)}`}
                {r.date ? ` · ${r.date}` : ''}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {tripsHere.length > 0 && (
        <div className="atlas__tripsblock">
          <span className="lifemap__grouplabel">Trips through here</span>
          {tripsHere.map((t) => (
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
        {onCompare && (
          <Button size="sm" variant="primary" onClick={onCompare}>
            Compare
          </Button>
        )}
        <Button size="sm" onClick={onCopyLink}>
          Copy link
        </Button>
        <Link
          className="graph__tool"
          to={
            city.records[0]
              ? `/explore/graph?focus=${encodeURIComponent(city.records[0].id)}`
              : '/explore/graph'
          }
        >
          Life map
        </Link>
        <Link className="graph__tool" to={chronographHref}>
          Chronograph
        </Link>
      </div>
    </aside>
  );
}
