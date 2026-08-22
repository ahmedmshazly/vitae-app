/**
 * Atlas chrome, primary actions + filter row (camera lives on the map HUD).
 */
import { useId } from 'react';
import { Checkbox, Input, Popover, StatusTrace, Tooltip } from '@vitae/ui';
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
  cityCount?: number;
  tripCount?: number;
  selectedContext?: string;
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
  cityCount = 0,
  tripCount = 0,
  selectedContext,
}: AtlasToolbarProps) {
  // The two filter bands carried an aria-label on a plain div, which ARIA
  // drops entirely, and the dropped string was not even the label printed
  // beside the band. Name them from the words on screen instead.
  const recordsLabelId = useId();
  const periodLabelId = useId();

  return (
    <header className="atlas__chrome">
      <div className="atlas__primary">
        <div className="explore-instrument__heading explore-instrument__heading--atlas">
          <div className="lifemap__titleblock">
            <h1 className="lifemap__title">Atlas</h1>
            <p className="lifemap__hint">{hint}</p>
          </div>
          <StatusTrace
            className="explore-instrument__trace"
            tone={unmappedCount > 0 ? 'warning' : 'neutral'}
            label={
              unmappedCount > 0
                ? 'Place evidence needs review'
                : 'Place evidence assembled from your records'
            }
            detail={`${cityCount} ${cityCount === 1 ? 'place' : 'places'} · ${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}${selectedContext ? ` · ${selectedContext}` : ''}${unmappedCount > 0 ? ` · ${unmappedCount} unmapped` : ''}`}
          />
        </div>

        <div className="atlas__primaryactions">
          <div className="lifemap__modes" role="group" aria-label="View mode">
            <button
              type="button"
              className={`lifemap__mode${mode === 'atlas' ? ' lifemap__mode--on' : ''}`}
              aria-pressed={mode === 'atlas'}
              onClick={() => onMode('atlas')}
            >
              Atlas
            </button>
            <button
              type="button"
              className={`lifemap__mode${mode === 'list' ? ' lifemap__mode--on' : ''}`}
              aria-pressed={mode === 'list'}
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

          {/* `title` is the one explanation of what a corridor pattern is, and
              it never reaches touch or a keyboard. The tooltip does both. */}
          <Tooltip content="Show corridor patterns between places">
            <button
              type="button"
              className={`graph__tool${prefs.showPatterns ? ' graph__tool--accent' : ''}`}
              onClick={() => onPatchPrefs({ showPatterns: !prefs.showPatterns })}
              aria-pressed={prefs.showPatterns}
            >
              Patterns
            </button>
          </Tooltip>

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

          <div className="lifemap__prefs atlas__more">
            {/* Was a bare div dismissed by a document mousedown listener.
                Escape from one of its checkboxes did nothing, because the
                view's key handler bails on INPUT, and tabbing past the last
                row left the panel hanging open over the map. */}
            <Popover
              open={prefsOpen}
              onOpenChange={(o) => (o ? onTogglePrefs() : onClosePrefs())}
              align="end"
              trigger={
                <button
                  type="button"
                  className={`graph__tool${prefsOpen ? ' graph__tool--accent' : ''}`}
                >
                  More
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                <div className="lifemap__prefshead">
                  <span className="lifemap__grouplabel">Display</span>
                  <button type="button" className="lifemap__prefsreset" onClick={onResetPrefs}>
                    Reset
                  </button>
                </div>
                <Checkbox
                  checked={prefs.showLabels}
                  onChange={(v) => onPatchPrefs({ showLabels: v })}
                  label="Show city labels"
                />
                <Checkbox
                  checked={prefs.showArcs}
                  onChange={(v) => onPatchPrefs({ showArcs: v })}
                  label="Show trip arcs"
                />
                <Checkbox
                  checked={prefs.showPatterns}
                  onChange={(v) => onPatchPrefs({ showPatterns: v })}
                  label="Show corridor patterns"
                />
                <Checkbox
                  checked={prefs.cluster}
                  onChange={(v) => onPatchPrefs({ cluster: v })}
                  label="Cluster at low zoom"
                />
                <div className="atlas__moreactions">
                  <button type="button" className="graph__tool" onClick={onExportPng}>
                    Export PNG
                  </button>
                </div>
              </div>
            </Popover>
          </div>
        </div>
      </div>

      <div className="atlas__filters">
        <div className="explore-control-band">
          <span id={recordsLabelId} className="explore-control-band__label">
            Records
          </span>
          <div className="lifemap__row" role="group" aria-labelledby={recordsLabelId}>
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                aria-pressed={activeFilters.has(f.label)}
                className={`graph__filter${activeFilters.has(f.label) ? ' graph__filter--on' : ''}`}
                onClick={() => onToggleFilter(f.label)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="explore-control-band">
          <span id={periodLabelId} className="explore-control-band__label">
            Period
          </span>
          <div className="lifemap__row" role="group" aria-labelledby={periodLabelId}>
            <button
              type="button"
              aria-pressed={period === 'all'}
              className={`graph__filter${period === 'all' ? ' graph__filter--on' : ''}`}
              onClick={() => onPeriod('all')}
            >
              All time
            </button>
            <button
              type="button"
              aria-pressed={period === 'year'}
              className={`graph__filter${period === 'year' ? ' graph__filter--on' : ''}`}
              onClick={() => onPeriod('year')}
            >
              {year}
            </button>
            <button
              type="button"
              aria-pressed={period === 'custom'}
              className={`graph__filter${period === 'custom' ? ' graph__filter--on' : ''}`}
              onClick={() => onPeriod('custom')}
            >
              Custom
            </button>
            {period === 'custom' && (
              <span className="atlas__perioddates">
                {/* Both ends of the custom period were 21px tall next to 32px
                    filter buttons, and shrank rather than grew on touch. */}
                <span className="inline-block w-36">
                  <Input
                    type="date"
                    mono
                    value={customFrom}
                    aria-label="From date"
                    onChange={(e) => onCustomFrom(e.target.value)}
                  />
                </span>
                <span className="u-faint">→</span>
                <span className="inline-block w-36">
                  <Input
                    type="date"
                    mono
                    value={customTo}
                    aria-label="To date"
                    onChange={(e) => onCustomTo(e.target.value)}
                  />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
