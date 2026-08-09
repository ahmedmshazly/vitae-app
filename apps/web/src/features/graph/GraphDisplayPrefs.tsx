import type { GraphDisplayPrefs, GraphLabelMode } from './displayPrefs.js';

export interface GraphDisplayPrefsProps {
  open: boolean;
  prefs: GraphDisplayPrefs;
  onToggle: () => void;
  onPatch: (patch: Partial<GraphDisplayPrefs>) => void;
  onReset: () => void;
}

const LABEL_OPTIONS: ReadonlyArray<{ id: GraphLabelMode; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'always', label: 'Always' },
  { id: 'selection', label: 'Selection' },
];

/** Display toggles for life-map visual behaviors (localStorage-backed). */
export function GraphDisplayPrefsPanel({
  open,
  prefs,
  onToggle,
  onPatch,
  onReset,
}: GraphDisplayPrefsProps) {
  return (
    <div className="lifemap__prefs">
      <button
        type="button"
        className={`graph__tool${open ? ' graph__tool--accent' : ''}`}
        aria-expanded={open}
        aria-controls="lifemap-display-prefs"
        onClick={onToggle}
      >
        Display
      </button>
      {open && (
        <div
          id="lifemap-display-prefs"
          className="lifemap__prefspanel"
          role="dialog"
          aria-label="Life map display preferences"
        >
          <div className="lifemap__prefshead">
            <span className="lifemap__grouplabel">Display</span>
            <button type="button" className="lifemap__prefsreset" onClick={onReset}>
              Reset
            </button>
          </div>

          <label className="lifemap__prefsrow">
            <input
              type="checkbox"
              checked={prefs.dimOnHover}
              onChange={(e) => onPatch({ dimOnHover: e.target.checked })}
            />
            <span>Dim non-neighbors on hover</span>
          </label>
          <label className="lifemap__prefsrow">
            <input
              type="checkbox"
              checked={prefs.dimOffPath}
              onChange={(e) => onPatch({ dimOffPath: e.target.checked })}
            />
            <span>Dim off-path in Path mode</span>
          </label>
          <label className="lifemap__prefsrow">
            <input
              type="checkbox"
              checked={prefs.fadeByHop}
              onChange={(e) => onPatch({ fadeByHop: e.target.checked })}
            />
            <span>Fade by hop from focus</span>
          </label>
          <label className="lifemap__prefsrow">
            <input
              type="checkbox"
              checked={prefs.accentHoverLinks}
              onChange={(e) => onPatch({ accentHoverLinks: e.target.checked })}
            />
            <span>Accent links on hover</span>
          </label>

          <div className="lifemap__prefslabels">
            <span className="lifemap__grouplabel">Labels</span>
            <div className="lifemap__modes" role="group" aria-label="Label mode">
              {LABEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`lifemap__mode${prefs.labels === opt.id ? ' lifemap__mode--on' : ''}`}
                  onClick={() => onPatch({ labels: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
