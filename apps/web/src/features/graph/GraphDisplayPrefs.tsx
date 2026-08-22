import { Button, Checkbox, FilterGroup, Popover, Spread, Stack } from '@vitae/ui';
import type { GraphDisplayPrefs, GraphLabelMode } from './displayPrefs.js';

export interface GraphDisplayPrefsProps {
  open: boolean;
  prefs: GraphDisplayPrefs;
  onToggle: () => void;
  onPatch: (patch: Partial<GraphDisplayPrefs>) => void;
  onReset: () => void;
}

const LABEL_OPTIONS: ReadonlyArray<{ key: GraphLabelMode; label: string }> = [
  { key: 'auto', label: 'Auto' },
  { key: 'always', label: 'Always' },
  { key: 'selection', label: 'Selection' },
];

/**
 * Display toggles for life-map visual behaviors (localStorage-backed).
 *
 * The panel used to claim role="dialog" while handling none of what a dialog
 * owes: no focus move, no outside click, and no Escape. Escape was worse than
 * missing, it fell through to the map's window handler and threw away the
 * user's selection instead of closing this. Radix supplies all three.
 */
export function GraphDisplayPrefsPanel({
  open,
  prefs,
  onToggle,
  onPatch,
  onReset,
}: GraphDisplayPrefsProps) {
  return (
    <div className="lifemap__prefs">
      <Popover
        open={open}
        onOpenChange={() => onToggle()}
        side="top"
        align="start"
        trigger={
          <button type="button" className={`graph__tool${open ? ' graph__tool--accent' : ''}`}>
            Display
          </button>
        }
      >
        {/* The popover's own role carries no name, so the name lives on the
            group inside it. See the note in the handover about Popover. */}
        <div role="group" aria-label="Life map display preferences">
          <Stack gap={2}>
            <Spread align="center">
              <span className="lifemap__grouplabel">Display</span>
              <Button size="sm" variant="ghost" onClick={onReset}>
                Reset
              </Button>
            </Spread>

            <Checkbox
              checked={prefs.dimOnHover}
              onChange={(v) => onPatch({ dimOnHover: v })}
              label="Dim non-neighbors on hover"
            />
            <Checkbox
              checked={prefs.dimOffPath}
              onChange={(v) => onPatch({ dimOffPath: v })}
              label="Dim off-path in Path mode"
            />
            <Checkbox
              checked={prefs.fadeByHop}
              onChange={(v) => onPatch({ fadeByHop: v })}
              label="Fade by hop from focus"
            />
            <Checkbox
              checked={prefs.accentHoverLinks}
              onChange={(v) => onPatch({ accentHoverLinks: v })}
              label="Accent links on hover"
            />

            <div className="lifemap__prefslabels">
              <span className="lifemap__grouplabel">Labels</span>
              {/* Which mode was on used to be a class name and nothing else. */}
              <FilterGroup
                label="Label mode"
                value={prefs.labels}
                options={LABEL_OPTIONS}
                onChange={(labels) => onPatch({ labels })}
              />
            </div>
          </Stack>
        </div>
      </Popover>
    </div>
  );
}
