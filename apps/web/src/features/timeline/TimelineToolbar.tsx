import { StatusTrace } from '@vitae/ui';
import type { TimelineDisplayPrefs } from './displayPrefs.js';
import { ALL_LANES, type BrushRange, type TimelineViewMode, type TimelineZoom } from './types.js';

export interface TimelineToolbarProps {
  zoom: TimelineZoom;
  onZoom: (z: TimelineZoom) => void;
  mode: TimelineViewMode;
  onMode: (m: TimelineViewMode) => void;
  prefs: TimelineDisplayPrefs;
  onPatchPrefs: (p: Partial<TimelineDisplayPrefs>) => void;
  prefsOpen: boolean;
  onTogglePrefs: () => void;
  onResetPrefs: () => void;
  onToday: () => void;
  onFit: () => void;
  hint: string;
  recordCount?: number;
  activeRange?: BrushRange | null;
  reviewState?: 'idle' | 'loading' | 'failed' | 'ready';
}

const ZOOMS: TimelineZoom[] = ['decade', 'year', 'quarter', 'month'];

export function TimelineToolbar({
  zoom,
  onZoom,
  mode,
  onMode,
  prefs,
  onPatchPrefs,
  prefsOpen,
  onTogglePrefs,
  onResetPrefs,
  onToday,
  onFit,
  hint,
  recordCount = 0,
  activeRange = null,
  reviewState = 'idle',
}: TimelineToolbarProps) {
  return (
    <header className="chronograph__chrome">
      <div className="explore-instrument__heading">
        <div className="lifemap__titleblock">
          <h1 className="lifemap__title">Chronograph</h1>
          <p className="lifemap__hint">{hint}</p>
        </div>
        <StatusTrace
          className="explore-instrument__trace"
          tone={
            reviewState === 'failed' ? 'danger' : reviewState === 'loading' ? 'live' : 'neutral'
          }
          label={
            reviewState === 'failed'
              ? 'Season review unavailable'
              : reviewState === 'loading'
                ? 'Reading the selected season'
                : activeRange
                  ? 'Season selected from dated evidence'
                  : 'Chronology assembled from dated records'
          }
          detail={
            activeRange
              ? `${activeRange.from} → ${activeRange.to} · ${zoom} scale`
              : `${recordCount} ${recordCount === 1 ? 'record' : 'records'} · ${zoom} scale`
          }
        />
      </div>

      <div className="explore-control-band">
        <span className="explore-control-band__label">View</span>
        <div className="lifemap__modes" role="group" aria-label="View mode">
          <button
            type="button"
            className={`lifemap__mode${mode === 'chronograph' ? ' lifemap__mode--on' : ''}`}
            aria-pressed={mode === 'chronograph'}
            onClick={() => onMode('chronograph')}
          >
            Chronograph
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
      </div>

      <div className="explore-control-band">
        <span className="explore-control-band__label">Scale</span>
        <div className="lifemap__row" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              className={`graph__filter${zoom === z ? ' graph__filter--on' : ''}`}
              onClick={() => onZoom(z)}
            >
              {z}
            </button>
          ))}
          <button type="button" className="graph__tool" onClick={onToday}>
            Today
          </button>
          <button type="button" className="graph__tool" onClick={onFit}>
            Fit career
          </button>
        </div>
      </div>

      <div className="explore-control-band explore-control-band--lanes">
        <span className="explore-control-band__label">Evidence lanes</span>
        <div className="lifemap__row" aria-label="Lanes">
          {ALL_LANES.map((lane) => {
            const on = prefs.activeLanes.includes(lane);
            // At least one lane has to stay on. That was enforced by silently
            // putting the lane straight back, so the last button looked live and
            // did nothing when pressed, say it instead.
            const isLastOn = on && prefs.activeLanes.length === 1;
            return (
              <button
                key={lane}
                type="button"
                aria-pressed={on}
                disabled={isLastOn}
                title={isLastOn ? 'At least one lane has to stay on' : undefined}
                className={`graph__filter${on ? ' graph__filter--on' : ''}`}
                onClick={() => {
                  onPatchPrefs({
                    activeLanes: on
                      ? prefs.activeLanes.filter((l) => l !== lane)
                      : [...prefs.activeLanes, lane],
                  });
                }}
              >
                {lane}
              </button>
            );
          })}
          <div className="lifemap__prefs">
            <button
              type="button"
              className={`graph__tool${prefsOpen ? ' graph__tool--accent' : ''}`}
              aria-expanded={prefsOpen}
              onClick={onTogglePrefs}
            >
              Display
            </button>
            {prefsOpen && (
              <div
                className="lifemap__prefspanel tl__prefspanel"
                role="dialog"
                aria-label="Timeline display"
              >
                <div className="lifemap__prefshead">
                  <span className="lifemap__grouplabel">Display</span>
                  <button type="button" className="lifemap__prefsreset" onClick={onResetPrefs}>
                    Reset
                  </button>
                </div>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.showSubtitles}
                    onChange={(e) => onPatchPrefs({ showSubtitles: e.target.checked })}
                  />
                  <span>Show subtitles on bars</span>
                </label>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.showMoments}
                    onChange={(e) => onPatchPrefs({ showMoments: e.target.checked })}
                  />
                  <span>Show moment diamonds</span>
                </label>
                <label className="lifemap__prefsrow">
                  <input
                    type="checkbox"
                    checked={prefs.stickyLabels}
                    onChange={(e) => onPatchPrefs({ stickyLabels: e.target.checked })}
                  />
                  <span>Sticky lane labels</span>
                </label>
                <div className="lifemap__prefslabels">
                  <span className="lifemap__grouplabel">Density</span>
                  <div className="lifemap__modes">
                    <button
                      type="button"
                      className={`lifemap__mode${prefs.density === 'comfortable' ? ' lifemap__mode--on' : ''}`}
                      onClick={() => onPatchPrefs({ density: 'comfortable' })}
                    >
                      Comfortable
                    </button>
                    <button
                      type="button"
                      className={`lifemap__mode${prefs.density === 'compact' ? ' lifemap__mode--on' : ''}`}
                      onClick={() => onPatchPrefs({ density: 'compact' })}
                    >
                      Compact
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
