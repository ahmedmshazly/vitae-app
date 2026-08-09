/**
 * Atlas chrome, primary actions + filter row (camera lives on the map HUD).
 */
import { useEffect, useRef } from 'react';
import type { AtlasDisplayPrefs } from './displayPrefs.js';
import type { AtlasPeriod, AtlasViewMode } from './types.js';
import { TYPE_FILTERS } from './types.js';

export interface AtlasToolbarProps {
  mode: AtlasViewMode;
  onMode: (m: AtlasViewMode) => void;
  activeFilters: Set<string>;
  onToggleFilter: (label: string) => void;
  period: AtlasPeriod;
  onPeriod: (p: AtlasPeriod) => void;
  year: number;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  prefs: AtlasDisplayPrefs;
  onPatchPrefs: (p: Partial<AtlasDisplayPrefs>) => void;
  prefsOpen: boolean;
  onTogglePrefs: () => void;
  onClosePrefs: () => void;
  onResetPrefs: () => void;
  onExportPng: () => void;
  onFind: () => void;
  findOpen: boolean;
  hint: string;
  unmappedCount: number;
  unmappedDockOpen: boolean;
  onUnmappedClick: () => void;
}

export function AtlasToolbar({
  mode,
  onMode,
  activeFilters,
  onToggleFilter,
  period,
  onPeriod,
  year,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  prefs,
  onPatchPrefs,
  prefsOpen,
  onTogglePrefs,
  onClosePrefs,
  onResetPrefs,
  onExportPng,
  onFind,
  findOpen,
  hint,
  unmappedCount,
  unmappedDockOpen,
  onUnmappedClick,
}: AtlasToolbarProps) {
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prefsOpen) return;
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        onClosePrefs();
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [prefsOpen, onClosePrefs]);

  return (
    <header className="atlas__chrome">
      <div className="atlas__primary">
        <div className="lifemap__titleblock">
          <h1 className="lifemap__title">Atlas</h1>
          <p className="lifemap__hint">{hint}</p>
        </div>

        <div className="atlas__primaryactions">
          <div className="lifemap__modes" role="group" aria-label="View mode">
            <button
              type="button"
              className={`lifemap__mode${mode === 'atlas' ? ' lifemap__mode--on' : ''}`}
              onClick={() => onMode('atlas')}
            >
              Atlas
            </button>
            <button
              type="button"
              className={`lifemap__mode${mode === 'list' ? ' lifemap__mode--on' : ''}`}
              onClick={() => onMode('list')}
            >
              List
            </button>
          </div>

          <button
            type="button"
            className={`graph__tool${findOpen ? ' graph__tool--accent' : ''}`}
            onClick={onFind}
            aria-pressed={findOpen}
          >
            Find
          </button>

          <button
            type="button"
            className={`graph__tool${prefs.showPatterns ? ' graph__tool--accent' : ''}`}
            onClick={() => onPatchPrefs({ showPatterns: !prefs.showPatterns })}
            aria-pressed={prefs.showPatterns}
            title="Show corridor patterns between places"
          >
            Patterns
          </button>

          {unmappedCount > 0 && (
            <button
              type="button"
              className={`atlas__unmappedchip${unmappedDockOpen ? ' atlas__unmappedchip--on' : ''}`}
              onClick={onUnmappedClick}
              aria-pressed={unmappedDockOpen}
            >
              {unmappedCount} unmapped
            </button>
          )}

          <div className="lifemap__prefs atlas__more" ref={moreRef}>
            <button
              type="button"
              className={`graph__tool${prefsOpen ? ' graph__tool--accent' : ''}`}
              onClick={onTogglePrefs}
              aria-expanded={prefsOpen}
              aria-haspopup="dialog"
            >
              More
            </button>
            {prefsOpen && (
              <div className="lifemap__prefspanel atlas__prefspanel" role="dialog" aria-label="Atlas more">
                <div className="lifemap__prefshead">
                  <span className="lifemap__grouplabel">Display</span>
                  <button type="button" className="lifemap__prefsreset" onClick={onResetPrefs}>
                    Reset
                  </button>
                </div>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.showLabels}
                    onChange={(e) => onPatchPrefs({ showLabels: e.target.checked })}
                  />
                  <span>Show city labels</span>
                </label>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.showArcs}
                    onChange={(e) => onPatchPrefs({ showArcs: e.target.checked })}
                  />
                  <span>Show trip arcs</span>
                </label>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.showPatterns}
                    onChange={(e) => onPatchPrefs({ showPatterns: e.target.checked })}
                  />
                  <span>Show corridor patterns</span>
                </label>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.cluster}
                    onChange={(e) => onPatchPrefs({ cluster: e.target.checked })}
                  />
                  <span>Cluster at low zoom</span>
                </label>
                <div className="atlas__moreactions">
                  <button type="button" className="graph__tool" onClick={onExportPng}>
                    Export PNG
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="atlas__filters">
        <div className="lifemap__row" aria-label="Type filters">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`graph__filter${activeFilters.has(f.label) ? ' graph__filter--on' : ''}`}
              onClick={() => onToggleFilter(f.label)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="lifemap__row" aria-label="Period">
          <button
            type="button"
            className={`graph__filter${period === 'all' ? ' graph__filter--on' : ''}`}
            onClick={() => onPeriod('all')}
          >
            all time
          </button>
          <button
            type="button"
            className={`graph__filter${period === 'year' ? ' graph__filter--on' : ''}`}
            onClick={() => onPeriod('year')}
          >
            {year}
          </button>
          <button
            type="button"
            className={`graph__filter${period === 'custom' ? ' graph__filter--on' : ''}`}
            onClick={() => onPeriod('custom')}
          >
            custom
          </button>
          {period === 'custom' && (
            <span className="atlas__perioddates">
              <input
                type="date"
                className="atlas__date"
                value={customFrom}
                aria-label="From date"
                onChange={(e) => onCustomFrom(e.target.value)}
              />
              <span className="u-faint">→</span>
              <input
                type="date"
                className="atlas__date"
                value={customTo}
                aria-label="To date"
                onChange={(e) => onCustomTo(e.target.value)}
              />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
