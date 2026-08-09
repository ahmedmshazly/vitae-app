/**
 * Side dock listing Atlas cities without coordinates.
 */
import { Mono } from '@vitae/ui';
import type { MapCity } from './types.js';

export interface UnmappedDockProps {
  cities: MapCity[];
  onPlace: (city: string) => void;
  onClose: () => void;
}

export function UnmappedDock({ cities, onPlace, onClose }: UnmappedDockProps) {
  return (
    <aside className="atlas__unmappeddock" role="dialog" aria-label="Unmapped places">
      <div className="atlas__dossierhead">
        <div>
          <div className="atlas__dossiertitle">Unmapped</div>
          <p className="u-faint" style={{ margin: '4px 0 0', fontSize: 'var(--ae-text-xs)' }}>
            {cities.length} label{cities.length === 1 ? '' : 's'} without coordinates
          </p>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="atlas__listul atlas__dossierlist">
        {cities.map((c) => (
          <li key={c.city}>
            <div className="atlas__unmappedrow">
              <div className="atlas__unmappedrowmain">
                <span className="atlas__listrowtitle">{c.city}</span>
                <Mono className="u-faint">{c.count}</Mono>
              </div>
              <button type="button" className="graph__tool" onClick={() => onPlace(c.city)}>
                Place on map
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
