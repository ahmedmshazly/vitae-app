import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
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

function replaceState(
  state: ObservatoryWorkspaceState,
  mutate: (draft: ObservatoryWorkspaceState) => void,
): ObservatoryWorkspaceState {
  const next = cloneObservatoryState(state);
  mutate(next);
  return next;
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
  const [workspaceName, setWorkspaceName] = useState('My observatory');
  const importRef = useRef<HTMLInputElement | null>(null);
  const selectedLabel =
    state.selectedIds[0]?.replace(/^entity:|^relation:/, '') ?? 'No focus selected';

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
      <div className="ec-observatory-toolbar" aria-label="Schema observatory controls">
        <div className="ec-lens-switcher" role="group" aria-label="Observatory lens">
          {LENSES.map((lens) => (
            <button
              key={lens.value}
              type="button"
              className={state.lens === lens.value ? 'is-active' : ''}
              aria-pressed={state.lens === lens.value}
              onClick={() => setLens(lens.value)}
            >
              <span>{lens.label}</span>
              <kbd>{lens.key}</kbd>
            </button>
          ))}
        </div>

        <div className="ec-observatory-search">
          <label htmlFor="ec-observatory-search">Search schema</label>
          <input
            id="ec-observatory-search"
            type="search"
            value={search}
            placeholder="Entity, relation, or field…"
            autoComplete="off"
            onChange={(event) => onSearch(event.target.value)}
          />
          {search.trim() ? (
            <div className="ec-observatory-search__results" role="listbox">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={state.selectedIds.includes(result.id)}
                    onClick={(event) => {
                      onSelect(result.id, event.shiftKey);
                      onSearch('');
                    }}
                  >
                    <span>{result.kind}</span>
                    <code>{result.label}</code>
                    <small>{result.meta}</small>
                  </button>
                ))
              ) : (
                <p>No matching schema item.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="ec-observatory-tools">
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}>−</button>
          <button type="button" title="Fit view" onClick={onFit}>Fit</button>
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}>+</button>
          <button type="button" title="Undo" aria-label="Undo visual change" disabled={!canUndo} onClick={onUndo}>↶</button>
          <button type="button" title="Redo" aria-label="Redo visual change" disabled={!canRedo} onClick={onRedo}>↷</button>
          <button type="button" disabled={!state.selectedIds.length} onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className={drawerOpen ? 'is-active' : ''}
            aria-expanded={drawerOpen}
            onClick={onToggleDrawer}
          >
            Controls
          </button>
          <button type="button" title="Command palette" onClick={onOpenCommands}>
            ⌘K
          </button>
        </div>
      </div>

      <div className="ec-observatory-context">
        <span className="ec-observatory-context__pulse" aria-hidden />
        <strong>{state.lens.toUpperCase()}</strong>
        <span>·</span>
        <code>{selectedLabel}</code>
        <span>·</span>
        <span>{state.filters.groups.length} groups</span>
        <span>·</span>
        <span>{state.filters.relations.length} relations</span>
        {state.compareIds.length ? (
          <>
            <span>·</span>
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
        {...(!drawerOpen ? ({ inert: '' } as Record<string, string>) : {})}
      >
        <div className="ec-cockpit__header">
          <div>
            <span>Observatory cockpit</span>
            <h2>Visual controls</h2>
          </div>
          <button type="button" aria-label="Close controls" onClick={onToggleDrawer}>×</button>
        </div>

        <details open>
          <summary>Entity groups</summary>
          <div className="ec-cockpit__checks ec-cockpit__checks--groups">
            {ENTITY_GROUPS.map((group) => {
              const checked = state.filters.groups.includes(group.label);
              return (
                <label key={group.label} data-group={group.label}>
                  <input
                    type="checkbox"
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
                  />
                  <span aria-hidden />
                  {group.label}
                  <small>{group.types.length}</small>
                </label>
              );
            })}
          </div>
        </details>

        <details>
          <summary>
            Relation vocabulary <small>{state.filters.relations.length}/28</small>
          </summary>
          <div className="ec-cockpit__inline-actions">
            <button
              type="button"
              onClick={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.relations = CATALOG_RELATIONS.map((relation) => relation.type);
                  }),
                )
              }
            >
              All
            </button>
            <button
              type="button"
              onClick={() =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.filters.relations = [];
                  }),
                )
              }
            >
              None
            </button>
          </div>
          <div className="ec-cockpit__checks ec-cockpit__checks--relations">
            {CATALOG_RELATIONS.map((relation) => {
              const checked = state.filters.relations.includes(relation.type);
              return (
                <label key={relation.id}>
                  <input
                    type="checkbox"
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
                  />
                  <code>{relation.type}</code>
                </label>
              );
            })}
          </div>
        </details>

        <details open>
          <summary>Relationship lens</summary>
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
                      draft.display.labelDensity = event.target.value as typeof draft.display.labelDensity;
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
                max="23"
                value={state.filters.minDegree}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.filters.minDegree = Math.max(0, Number(event.target.value));
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
                max="99"
                value={state.filters.maxDegree}
                onChange={(event) =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.filters.maxDegree = Math.max(0, Number(event.target.value));
                    }),
                  )
                }
              />
            </label>
          </div>
        </details>

        <details>
          <summary>Motion and rendering</summary>
          <div className="ec-cockpit__toggles">
            {[
              ['Motion', 'motion'],
              ['Minimap', 'minimap'],
              ['Fisheye lens', 'fisheye'],
            ].map(([label, key]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(state.display[key as 'motion' | 'minimap' | 'fisheye'])}
                  onChange={() =>
                    onStateChange(
                      replaceState(state, (draft) => {
                        const property = key as 'motion' | 'minimap' | 'fisheye';
                        draft.display[property] = !draft.display[property];
                      }),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={state.filters.showWildcard}
                onChange={() =>
                  onStateChange(
                    replaceState(state, (draft) => {
                      draft.filters.showWildcard = !draft.filters.showWildcard;
                    }),
                  )
                }
              />
              Wildcard hub
            </label>
          </div>
          <label className="ec-cockpit__range">
            <span>Route opacity <output>{state.display.routeOpacity.toFixed(2)}</output></span>
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
            <span>Route weight <output>{state.display.routeThickness.toFixed(1)}×</output></span>
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
            <span>Motion speed <output>{state.display.pulseSpeed.toFixed(1)}×</output></span>
            <input
              type="range"
              min="0.25"
              max="2"
              step="0.25"
              value={state.display.pulseSpeed}
              onChange={(event) =>
                onStateChange(
                  replaceState(state, (draft) => {
                    draft.display.pulseSpeed = Number(event.target.value);
                  }),
                )
              }
            />
          </label>
        </details>

        {state.lens === 'matrix' ? (
          <details open>
            <summary>Matrix controls</summary>
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
              <label className="ec-cockpit__toggle-field">
                <input
                  type="checkbox"
                  checked={state.display.transpose}
                  onChange={() =>
                    onStateChange(
                      replaceState(state, (draft) => {
                        draft.display.transpose = !draft.display.transpose;
                      }),
                    )
                  }
                />
                Transpose axes
              </label>
            </div>
          </details>
        ) : null}

        <details>
          <summary>Workspace</summary>
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
            <div>
              <button
                type="button"
                disabled={!workspaceName.trim()}
                onClick={() => onSaveWorkspace(workspaceName.trim())}
              >
                Save current
              </button>
              <button
                type="button"
                disabled={!activeWorkspaceId}
                onClick={() => activeWorkspaceId && onDeleteWorkspace(activeWorkspaceId)}
              >
                Delete
              </button>
            </div>
            <div>
              <button type="button" onClick={onCopyLink}>Copy share link</button>
              <button type="button" onClick={onExportWorkspace}>Export JSON</button>
              <button type="button" onClick={() => importRef.current?.click()}>Import JSON</button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={handleImport}
              />
            </div>
          </div>
        </details>

        <details>
          <summary>Canvas and reset</summary>
          <label className="ec-cockpit__range">
            <span>Panel width <output>{state.display.panelWidth}px</output></span>
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
            <button type="button" onClick={onUnpinAll}>Unpin all</button>
            <button
              type="button"
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
            </button>
            <button type="button" onClick={onReset}>Reset observatory</button>
          </div>
        </details>
      </aside>
    </>
  );
}
