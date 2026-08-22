import { useId, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Button, Checkbox, ConfirmDialog, Disclosure, Field, Input, Kbd } from '@vitae/ui';
import { CATALOG_RELATIONS, ENTITY_GROUPS } from './entityCatalogModel.js';
import {
  cloneObservatoryState,
  type ObservatoryLens,
  type ObservatorySelectionId,
  type ObservatoryWorkspaceState,
  type SavedObservatoryWorkspace,
} from './entityObservatoryModel.js';

interface SearchResult {
  id: ObservatorySelectionId;
  kind: string;
  label: string;
  meta: string;
}

interface EntityObservatoryControlsProps {
  state: ObservatoryWorkspaceState;
  drawerOpen: boolean;
  search: string;
  searchResults: SearchResult[];
  activeWorkspaceId: string | null;
  savedWorkspaces: SavedObservatoryWorkspace[];
  onStateChange: (next: ObservatoryWorkspaceState) => void;
  onToggleDrawer: () => void;
  onSearch: (value: string) => void;
  onSelect: (id: ObservatorySelectionId, compare?: boolean) => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  onReset: () => void;
  onCopyLink: () => void;
  onOpenCommands: () => void;
  onSaveWorkspace: (name: string) => void;
  onLoadWorkspace: (id: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (payload: string) => void;
  onUnpinAll: () => void;
}

const LENSES: Array<{ value: ObservatoryLens; label: string; key: string }> = [
  { value: 'orbit', label: 'Orbit', key: '1' },
  { value: 'focus', label: 'Focus', key: '2' },
  { value: 'matrix', label: 'Matrix', key: '3' },
];

/** The degree filter is a window over a fixed catalog, so a value outside it
 * can only produce an empty scene the user did not ask for. */
const MAX_DEGREE = 99;

function replaceState(
  state: ObservatoryWorkspaceState,
  mutate: (draft: ObservatoryWorkspaceState) => void,
): ObservatoryWorkspaceState {
  const next = cloneObservatoryState(state);
  mutate(next);
  return next;
}

function clampDegree(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.round(parsed), 0), MAX_DEGREE);
}

export function EntityObservatoryControls({
  state,
  drawerOpen,
  search,
  searchResults,
  activeWorkspaceId,
  savedWorkspaces,
  onStateChange,
  onToggleDrawer,
  onSearch,
  onSelect,
  onFit,
  onZoomIn,
  onZoomOut,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onReset,
  onCopyLink,
  onOpenCommands,
  onSaveWorkspace,
  onLoadWorkspace,
  onDeleteWorkspace,
  onExportWorkspace,
  onImportWorkspace,
  onUnpinAll,
}: EntityObservatoryControlsProps) {
  const ids = useId();
  const [workspaceName, setWorkspaceName] = useState('My observatory');
  const [confirming, setConfirming] = useState<'delete-workspace' | 'reset' | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const selectedLabel =
    state.selectedIds[0]?.replace(/^entity:|^relation:/, '') ?? 'No focus selected';
  const searching = search.trim().length > 0;
  const activeWorkspace = savedWorkspaces.find((workspace) => workspace.id === activeWorkspaceId);
  // A minimum above the maximum is a window that can never contain anything.
  // The scene goes blank and nothing else on the screen explains why.
  const degreeRangeInverted = state.filters.minDegree > state.filters.maxDegree;

  function setLens(lens: ObservatoryLens) {
    onStateChange(
      replaceState(state, (draft) => {
        draft.lens = lens;
      }),
    );
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then(onImportWorkspace);
    event.target.value = '';
  }

  return (
    <>
      {/* An aria-label on a plain div names nothing: only an element with a
          role takes one. This strip groups the screen's controls, so it says
          so. */}
      <div className="ec-observatory-toolbar" role="group" aria-label="Schema observatory controls">
        <div className="ec-lens-switcher" role="group" aria-label="Observatory lens">
          {LENSES.map((lens) => (
            <button
              key={lens.value}
              type="button"
              className={state.lens === lens.value ? 'is-active' : ''}
              aria-pressed={state.lens === lens.value}
              // The shortcut used to be plain text inside the button, so the
              // name came out as "Orbit 1" and the digit read as part of the
              // label rather than as the key that reaches it.
              aria-keyshortcuts={lens.key}
              onClick={() => setLens(lens.value)}
            >
              <span>{lens.label}</span>
              <span aria-hidden>
                <Kbd>{lens.key}</Kbd>
              </span>
            </button>
          ))}
        </div>

        <div className="ec-observatory-search">
          {/* Not a listbox. The results are real buttons the user can Tab to
              and Shift-click to compare, and a listbox whose options are
              buttons is a contract this never kept: no aria-activedescendant,
              no arrow keys, and a paragraph where only options may go. What it
              owes a screen reader is the count, which it now says out loud. */}
          <Field label="Search schema" htmlFor={`${ids}-search`}>
            <Input
              id={`${ids}-search`}
              type="search"
              value={search}
              placeholder="Entity, relation, or field…"
              autoComplete="off"
              aria-describedby={`${ids}-search-count`}
              onChange={(event) => onSearch(event.target.value)}
            />
          </Field>
          <p className="u-visually-hidden" role="status" id={`${ids}-search-count`}>
            {searching
              ? searchResults.length
                ? `${searchResults.length} matching schema item${searchResults.length === 1 ? '' : 's'}`
                : 'No matching schema item'
              : ''}
          </p>
          {searching ? (
            <div className="ec-observatory-search__results">
              {searchResults.length ? (
                <ul aria-label="Schema search results">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={(event) => {
                          onSelect(result.id, event.shiftKey);
                          onSearch('');
                        }}
                      >
                        <span>{result.kind}</span>
                        <code>{result.label}</code>
                        <small>{result.meta}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No matching schema item.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="ec-observatory-tools">
          <Button size="sm" aria-label="Zoom out" onClick={onZoomOut}>
            <span aria-hidden>−</span>
          </Button>
          <Button size="sm" onClick={onFit}>
            Fit
          </Button>
          <Button size="sm" aria-label="Zoom in" onClick={onZoomIn}>
            <span aria-hidden>+</span>
          </Button>
          <Button size="sm" aria-label="Undo visual change" disabled={!canUndo} onClick={onUndo}>
            <span aria-hidden>↶</span>
          </Button>
          <Button size="sm" aria-label="Redo visual change" disabled={!canRedo} onClick={onRedo}>
            <span aria-hidden>↷</span>
          </Button>
          <Button size="sm" disabled={!state.selectedIds.length} onClick={onClear}>
            Clear
          </Button>
          <Button
            size="sm"
            className={drawerOpen ? 'is-active' : ''}
            aria-expanded={drawerOpen}
            onClick={onToggleDrawer}
          >
            Controls
          </Button>
          {/* The glyph alone was the accessible name, so this button announced
              itself as "command K". */}
          <Button size="sm" aria-label="Open command palette" onClick={onOpenCommands}>
            <span aria-hidden>⌘K</span>
          </Button>
        </div>
      </div>

      {/* Every control above changes this line and nothing announced it. A
          polite status means the lens, the focus and the compare pick are
          spoken when they change, rather than only being visible. */}
      <div className="ec-observatory-context" role="status">
        <span className="ec-observatory-context__pulse" aria-hidden />
        <strong>{state.lens.toUpperCase()}</strong>
        <span aria-hidden>·</span>
        <code>{selectedLabel}</code>
        <span aria-hidden>·</span>
        <span>{state.filters.groups.length} groups</span>
        <span aria-hidden>·</span>
        <span>{state.filters.relations.length} relations</span>
        {state.compareIds.length ? (
          <>
            <span aria-hidden>·</span>
            <span className="ec-observatory-context__compare">
              comparing {state.compareIds[0].replace(/^entity:|^relation:/, '')}
            </span>
          </>
        ) : null}
      </div>

      <aside
        className={`ec-observatory-drawer${drawerOpen ? ' is-open' : ''}`}
        style={{ '--cockpit-width': `${state.display.panelWidth}px` } as CSSProperties}
        aria-label="Advanced observatory controls"
        aria-hidden={!drawerOpen}
        // `inert` as a real boolean, not `{...{ inert: '' }}`. The string form
        // was how React 18 took it; React 19 reads `inert` as a boolean and
        // treats the empty string as false, so the attribute never reached the
        // DOM. The drawer was left `aria-hidden` with 62 focusable controls
        // still in the tab order — axe's `aria-hidden-focus`, serious, and the
        // one violation failing this page.
        inert={!drawerOpen}
      >
        <div className="ec-cockpit__header">
          <div>
            <span>Observatory cockpit</span>
            <h2>Visual controls</h2>
          </div>
          <Button size="sm" variant="ghost" glyph="close" aria-label="Close controls" onClick={onToggleDrawer} />
        </div>

        <Disclosure label="Entity groups" defaultOpen>
          <div className="ec-cockpit__checks ec-cockpit__checks--groups">
            {ENTITY_GROUPS.map((group) => {
              const checked = state.filters.groups.includes(group.label);
              return (
                <Checkbox
                  key={group.label}
                  checked={checked}
                  onChange={() =>
                    onStateChange(
                      replaceState(state, (draft) => {
                        draft.filters.groups = checked
                          ? draft.filters.groups.filter((value) => value !== group.label)
                          : [...draft.filters.groups, group.label];
                      }),
                    )
                  }
                  label={
                    <span className="ec-cockpit__check-label" data-group={group.label}>
                      <i aria-hidden />
                      {group.label}
                      <small>{group.types.length}</small>
                    </span>
                  }
                />
              );
            })}
          </div>
        </Disclosure>

        <Disclosure
          label="Relation vocabulary"
          // Was a literal 28 beside a live count, so the pair went silently
          // wrong the moment the catalog gained a relation.
          meta={`${state.filters.relations.length}/${CATALOG_RELATIONS.length}`}
        >
          <div className="ec-cockpit__inline-actions">
            <Button
              size="sm"
              aria-label="Show every relation"
              onClick={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.relations = CATALOG_RELATIONS.map((relation) => relation.type);
                  }),
                )
              }
            >
              All
            </Button>
            <Button
              size="sm"
              aria-label="Hide every relation"
              onClick={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.relations = [];
                  }),
                )
              }
            >
              None
            </Button>
          </div>
          {state.filters.relations.length === 0 ? (
            <p className="ec-cockpit__note" role="status">
              No relation is showing, so every route is hidden. Pick one, or choose All.
            </p>
          ) : null}
          <div className="ec-cockpit__checks ec-cockpit__checks--relations">
            {CATALOG_RELATIONS.map((relation) => {
              const checked = state.filters.relations.includes(relation.type);
              return (
                <Checkbox
                  key={relation.id}
                  checked={checked}
                  onChange={() =>
                    onStateChange(
                      replaceState(state, (draft) => {
                        draft.filters.relations = checked
                          ? draft.filters.relations.filter((value) => value !== relation.type)
                          : [...draft.filters.relations, relation.type];
                      }),
                    )
                  }
                  label={<code>{relation.type}</code>}
                />
              );
            })}
          </div>
        </Disclosure>

        <Disclosure label="Relationship lens" defaultOpen>
          <div className="ec-cockpit__field-grid">
            <label>
              Direction
              <select
                value={state.filters.direction}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.filters.direction = event.target.value as typeof draft.filters.direction;
                    }),
                  )
                }
              >
                <option value="both">Incoming + outgoing</option>
                <option value="out">Outgoing</option>
                <option value="in">Incoming</option>
              </select>
            </label>
            <label>
              Edge reveal
              <select
                value={state.display.edgeMode}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.display.edgeMode = event.target.value as typeof draft.display.edgeMode;
                    }),
                  )
                }
              >
                <option value="on-demand">Reveal on demand</option>
                <option value="bundled">Bundled overview</option>
                <option value="all">All, edge-bundled</option>
              </select>
            </label>
            <label>
              Labels
              <select
                value={state.display.labelDensity}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.display.labelDensity = event.target
                        .value as typeof draft.display.labelDensity;
                    }),
                  )
                }
              >
                <option value="auto">Zoom aware</option>
                <option value="sparse">Sparse</option>
                <option value="full">Every label</option>
              </select>
            </label>
            <label>
              Focus depth
              <select
                value={state.display.hopDepth}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.display.hopDepth = Number(event.target.value) as 1 | 2 | 3;
                    }),
                  )
                }
              >
                <option value="1">1 hop</option>
                <option value="2">2 hops</option>
                <option value="3">3 hops</option>
              </select>
            </label>
          </div>
          <label className="ec-cockpit__wide-field">
            Relation or field filter
            <input
              value={state.filters.fieldQuery}
              placeholder="confidence, dates, KNOWS…"
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.fieldQuery = event.target.value;
                  }),
                )
              }
            />
          </label>
          <div className="ec-cockpit__field-grid">
            <label>
              Minimum degree
              <input
                type="number"
                min="0"
                max={MAX_DEGREE}
                value={state.filters.minDegree}
                aria-invalid={degreeRangeInverted || undefined}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      // Was `Math.max(0, Number(...))` with no ceiling, so a
                      // typed 500 emptied the scene and nothing said why.
                      draft.filters.minDegree = clampDegree(event.target.value);
                    }),
                  )
                }
              />
            </label>
            <label>
              Maximum degree
              <input
                type="number"
                min="0"
                max={MAX_DEGREE}
                value={state.filters.maxDegree}
                aria-invalid={degreeRangeInverted || undefined}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.filters.maxDegree = clampDegree(event.target.value);
                    }),
                  )
                }
              />
            </label>
          </div>
          {degreeRangeInverted ? (
            <p className="ec-cockpit__note ec-cockpit__note--warn" role="status">
              The minimum is above the maximum, so nothing can pass the degree filter.
            </p>
          ) : null}
        </Disclosure>

        <Disclosure label="Motion and rendering">
          <div className="ec-cockpit__toggles">
            {(
              [
                ['Motion', 'motion'],
                ['Minimap', 'minimap'],
                ['Fisheye lens', 'fisheye'],
              ] as const
            ).map(([label, key]) => (
              <Checkbox
                key={key}
                label={label}
                checked={Boolean(state.display[key])}
                onChange={() =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.display[key] = !draft.display[key];
                    }),
                  )
                }
              />
            ))}
            <Checkbox
              label="Wildcard hub"
              checked={state.filters.showWildcard}
              onChange={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.showWildcard = !draft.filters.showWildcard;
                  }),
                )
              }
            />
          </div>
          <label className="ec-cockpit__range">
            <span>
              Route opacity <output>{state.display.routeOpacity.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min="0.15"
              max="1"
              step="0.05"
              value={state.display.routeOpacity}
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.display.routeOpacity = Number(event.target.value);
                  }),
                )
              }
            />
          </label>
          <label className="ec-cockpit__range">
            <span>
              Route weight <output>{state.display.routeThickness.toFixed(1)}×</output>
            </span>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={state.display.routeThickness}
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.display.routeThickness = Number(event.target.value);
                  }),
                )
              }
            />
          </label>
          <label className="ec-cockpit__range">
            <span>
              Motion speed <output>{state.display.pulseSpeed.toFixed(1)}×</output>
            </span>
            <input
              type="range"
              min="0.25"
              max="2"
              step="0.25"
              value={state.display.pulseSpeed}
              disabled={!state.display.motion}
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.display.pulseSpeed = Number(event.target.value);
                  }),
                )
              }
            />
          </label>
          {state.display.motion ? null : (
            <p className="ec-cockpit__note">Motion is off, so speed changes nothing.</p>
          )}
        </Disclosure>

        {state.lens === 'matrix' ? (
          <Disclosure label="Matrix controls" defaultOpen>
            <div className="ec-cockpit__field-grid">
              <label>
                Sort axes
                <select
                  value={state.display.sort}
                  onChange={(event) =>
                    onStateChange(
                      replaceState(state, (draft) => {
                        draft.display.sort = event.target.value as typeof draft.display.sort;
                      }),
                    )
                  }
                >
                  <option value="group">Schema group</option>
                  <option value="alpha">Alphabetical</option>
                  <option value="degree">Endpoint degree</option>
                </select>
              </label>
              <Checkbox
                label="Transpose axes"
                checked={state.display.transpose}
                onChange={() =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.display.transpose = !draft.display.transpose;
                    }),
                  )
                }
              />
            </div>
          </Disclosure>
        ) : null}

        <Disclosure label="Workspace">
          <div className="ec-cockpit__workspace">
            <label>
              Saved workspace
              <select
                value={activeWorkspaceId ?? ''}
                onChange={(event) => event.target.value && onLoadWorkspace(event.target.value)}
              >
                <option value="">Unsaved workspace</option>
                {savedWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                value={workspaceName}
                maxLength={60}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </label>
            <div className="ec-cockpit__inline-actions">
              <Button
                size="sm"
                disabled={!workspaceName.trim()}
                onClick={() => onSaveWorkspace(workspaceName.trim())}
              >
                Save current
              </Button>
              {/* Deleting a saved workspace cannot be undone by the Undo
                  button beside it, which only walks visual state. */}
              <Button
                size="sm"
                variant="danger"
                disabled={!activeWorkspaceId}
                onClick={() => setConfirming('delete-workspace')}
              >
                Delete
              </Button>
            </div>
            <div className="ec-cockpit__inline-actions">
              <Button size="sm" onClick={onCopyLink}>
                Copy share link
              </Button>
              <Button size="sm" onClick={onExportWorkspace}>
                Export JSON
              </Button>
              <Button size="sm" onClick={() => importRef.current?.click()}>
                Import JSON
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={handleImport}
              />
            </div>
          </div>
        </Disclosure>

        <Disclosure label="Canvas and reset">
          <label className="ec-cockpit__range">
            <span>
              Panel width <output>{state.display.panelWidth}px</output>
            </span>
            <input
              type="range"
              min="280"
              max="440"
              step="10"
              value={state.display.panelWidth}
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.display.panelWidth = Number(event.target.value);
                  }),
                )
              }
            />
          </label>
          <div className="ec-cockpit__danger-zone">
            <Button size="sm" onClick={onUnpinAll}>
              Unpin all
            </Button>
            <Button
              size="sm"
              disabled={!state.hiddenIds.length}
              onClick={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.hiddenIds = [];
                  }),
                )
              }
            >
              Restore hidden ({state.hiddenIds.length})
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirming('reset')}>
              Reset observatory
            </Button>
          </div>
        </Disclosure>
      </aside>

      <ConfirmDialog
        open={confirming === 'delete-workspace'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Delete ${activeWorkspace?.name ?? 'this workspace'}?`}
        body="The saved workspace is removed from this browser. What is on screen stays as it is."
        confirmLabel="Delete workspace"
        destructive
        onConfirm={() => {
          if (activeWorkspaceId) onDeleteWorkspace(activeWorkspaceId);
          setConfirming(null);
        }}
      />
      <ConfirmDialog
        open={confirming === 'reset'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Reset the observatory?"
        body="Filters, lens, pins, hidden items and the current selection all go back to their defaults. Saved workspaces are kept."
        confirmLabel="Reset observatory"
        destructive
        onConfirm={() => {
          onReset();
          setConfirming(null);
        }}
      />
    </>
  );
}
