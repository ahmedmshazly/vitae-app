import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  CATALOG_COUNTS,
  CATALOG_ENTITIES,
  CATALOG_RELATIONS,
  ENTITY_GROUPS,
  selectionForId,
  type CatalogSelection,
} from './entityCatalogModel.js';
import {
  DEFAULT_OBSERVATORY_STATE,
  buildFocusScene,
  buildOrbitScene,
  cloneObservatoryState,
  loadSavedObservatoryWorkspaces,
  observatorySearchParams,
  observatorySelectionConnections,
  observatoryStateFromSearchParams,
  parseObservatoryWorkspace,
  saveObservatoryWorkspaces,
  type ObservatorySelectionId,
  type ObservatoryWorkspaceState,
  type SavedObservatoryWorkspace,
} from './entityObservatoryModel.js';
import type { EntityObservatoryGraphHandle } from './EntityObservatoryGraph.js';
import { EntityObservatoryControls } from './EntityObservatoryControls.js';
import {
  EntityObservatoryCommandPalette,
  type ObservatoryCommand,
} from './EntityObservatoryCommandPalette.js';
import { EntityObservatoryMatrix } from './EntityObservatoryMatrix.js';
import {
  EntityObservatoryPrint,
  EntityObservatorySnapshot,
} from './EntityObservatorySnapshot.js';
import { SelectionDetails } from './EntityCatalogDetails.js';
import { EntityCatalogAtlas } from './EntityCatalogAtlas.js';
import {
  EntityCatalogOverview,
  OVERVIEW_SVG_EXPORT_STYLE,
} from './EntityCatalogOverview.js';
import { readGraphPalette } from '../../lib/graph-palette.js';

type ReferenceView = 'explore' | 'atlas';
type PrintMode = 'overview' | 'atlas' | 'workspace';

const EntityObservatoryGraph = lazy(async () => {
  const module = await import('./EntityObservatoryGraph.js');
  return { default: module.EntityObservatoryGraph };
});

function includesSearch(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function serializeSvg(source: SVGSVGElement): string {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function workspaceId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `observatory-${Date.now().toString(36)}`;
}

export function EntityCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ReferenceView = searchParams.get('view') === 'atlas' ? 'atlas' : 'explore';
  const [observatory, setObservatory] = useState<ObservatoryWorkspaceState>(() =>
    observatoryStateFromSearchParams(searchParams),
  );
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedObservatoryWorkspace[]>(
    loadSavedObservatoryWorkspaces,
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const graphRef = useRef<EntityObservatoryGraphHandle | null>(null);
  const overviewSvgRef = useRef<SVGSVGElement | null>(null);
  const workspaceSvgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<ObservatoryWorkspaceState[]>([]);
  const futureRef = useRef<ObservatoryWorkspaceState[]>([]);

  const scene = useMemo(
    () =>
      observatory.lens === 'focus'
        ? buildFocusScene(observatory)
        : buildOrbitScene(observatory, hoveredId),
    [hoveredId, observatory],
  );
  const selection = selectionForId(observatory.selectedIds[0] ?? null);
  const selectionConnections = selection
    ? observatorySelectionConnections(selection.id)
    : { incoming: [], outgoing: [] };

  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return [];
    const entities = CATALOG_ENTITIES.filter(
      (entity) =>
        includesSearch(entity.type, query) ||
        includesSearch(entity.titleLabel, query) ||
        entity.fields.some(
          (field) => includesSearch(field.key, query) || includesSearch(field.label, query),
        ),
    ).map((entity) => ({
      id: entity.id as ObservatorySelectionId,
      kind: 'entity',
      label: entity.type,
      meta: `${entity.group} · ${entity.fields.length} props`,
    }));
    const relations = CATALOG_RELATIONS.filter(
      (relation) =>
        includesSearch(relation.type, query) ||
        includesSearch(relation.label, query) ||
        includesSearch(relation.description, query) ||
        relation.fields.some(
          (field) => includesSearch(field.key, query) || includesSearch(field.label, query),
        ),
    ).map((relation) => ({
      id: relation.id as ObservatorySelectionId,
      kind: 'relation',
      label: relation.type,
      meta: `${relation.label} · ${relation.fields.length} props`,
    }));
    return [...entities, ...relations].slice(0, 28);
  }, [search]);

  const commitState = useCallback(
    (next: ObservatoryWorkspaceState, recordHistory = true) => {
      if (recordHistory) {
        historyRef.current = [...historyRef.current.slice(-39), cloneObservatoryState(observatory)];
        futureRef.current = [];
      }
      setObservatory(next);
    },
    [observatory],
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [cloneObservatoryState(observatory), ...futureRef.current.slice(0, 39)];
    setObservatory(previous);
  }, [observatory]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current.slice(-39), cloneObservatoryState(observatory)];
    setObservatory(next);
  }, [observatory]);

  const select = useCallback(
    (id: string, compare = false) => {
      const resolved = selectionForId(id);
      if (!resolved) return;
      const next = cloneObservatoryState(observatory);
      if (compare && next.selectedIds.length > 0 && next.selectedIds[0] !== resolved.id) {
        next.compareIds = [resolved.id];
      } else {
        next.selectedIds = [resolved.id];
        next.compareIds = [];
      }
      commitState(next);
    },
    [commitState, observatory],
  );

  const clearSelection = useCallback(() => {
    if (!observatory.selectedIds.length && !observatory.compareIds.length) return;
    const next = cloneObservatoryState(observatory);
    next.selectedIds = [];
    next.compareIds = [];
    commitState(next);
  }, [commitState, observatory]);

  useEffect(() => {
    const resetPrintMode = () => setPrintMode(null);
    window.addEventListener('afterprint', resetPrintMode);
    return () => window.removeEventListener('afterprint', resetPrintMode);
  }, []);

  useEffect(() => {
    const next = observatorySearchParams(observatory, searchParams);
    if (view === 'atlas') next.set('view', 'atlas');
    else next.delete('view');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [observatory, searchParams, setSearchParams, view]);

  useEffect(() => {
    saveObservatoryWorkspaces(savedWorkspaces);
  }, [savedWorkspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setSavedWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === activeWorkspaceId
          ? {
              ...workspace,
              updatedAt: new Date().toISOString(),
              state: cloneObservatoryState(observatory),
            }
          : workspace,
      ),
    );
  }, [activeWorkspaceId, observatory]);

  const setLens = useCallback(
    (lens: ObservatoryWorkspaceState['lens']) => {
      const next = cloneObservatoryState(observatory);
      next.lens = lens;
      commitState(next);
    },
    [commitState, observatory],
  );

  const commands = useMemo<ObservatoryCommand[]>(
    () => [
      { id: 'orbit', label: 'Open Orbit lens', description: 'Return to the calm constellation overview', shortcut: '1', run: () => setLens('orbit') },
      { id: 'focus', label: 'Open Focus lens', description: 'Isolate the selected neighborhood', shortcut: '2', run: () => setLens('focus') },
      { id: 'matrix', label: 'Open Matrix lens', description: 'Audit all exact endpoint mappings without lines', shortcut: '3', run: () => setLens('matrix') },
      { id: 'fit', label: 'Fit scene', description: 'Fit all visible elements into the viewport', shortcut: 'F', run: () => graphRef.current?.fit() },
      { id: 'controls', label: 'Toggle visual controls', description: 'Open or close the expert cockpit', shortcut: 'C', run: () => setDrawerOpen((current) => !current) },
      { id: 'undo', label: 'Undo visual change', description: 'Restore the previous observatory state', shortcut: '⌘Z', run: undo },
      { id: 'redo', label: 'Redo visual change', description: 'Reapply the last undone state', shortcut: '⇧⌘Z', run: redo },
      { id: 'clear', label: 'Clear focus', description: 'Return to an unselected overview', shortcut: 'Esc', run: clearSelection },
      {
        id: 'bundles',
        label: 'Show bundled overview',
        description: 'Aggregate endpoint routes into group corridors',
        run: () => {
          const next = cloneObservatoryState(observatory);
          next.display.edgeMode = 'bundled';
          commitState(next);
        },
      },
      {
        id: 'fullscreen',
        label: 'Enter fullscreen',
        description: 'Give the observatory the entire display',
        run: () => void stageRef.current?.requestFullscreen(),
      },
    ],
    [clearSelection, commitState, observatory, redo, setLens, undo],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (editing || commandOpen) return;
      if (event.key === '/') {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === '1') setLens('orbit');
      else if (event.key === '2') setLens('focus');
      else if (event.key === '3') setLens('matrix');
      else if (event.key.toLocaleLowerCase() === 'f') graphRef.current?.fit();
      else if (event.key === 'Escape') clearSelection();
      else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, commandOpen, redo, setLens, undo]);

  function patchView(nextView: ReferenceView) {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'atlas') next.set('view', 'atlas');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  }

  function startPrint(mode: PrintMode) {
    flushSync(() => setPrintMode(mode));
    window.requestAnimationFrame(() => window.print());
  }

  function downloadOverviewSvg() {
    const source = overviewSvgRef.current;
    if (!source) return;
    const clone = source.cloneNode(true) as SVGSVGElement;
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = OVERVIEW_SVG_EXPORT_STYLE;
    clone.prepend(style);
    downloadBlob(
      new Blob([serializeSvg(clone)], { type: 'image/svg+xml;charset=utf-8' }),
      'vitae-canonical-entity-map.svg',
    );
  }

  function downloadWorkspaceSvg() {
    const source = workspaceSvgRef.current;
    if (!source) return;
    downloadBlob(
      new Blob([serializeSvg(source)], { type: 'image/svg+xml;charset=utf-8' }),
      `vitae-observatory-${observatory.lens}.svg`,
    );
  }

  function downloadWorkspacePng() {
    const source = workspaceSvgRef.current;
    if (!source) return;
    const payload = serializeSvg(source);
    const url = URL.createObjectURL(new Blob([payload], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1500;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = readGraphPalette().bg;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `vitae-observatory-${observatory.lens}.png`);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  function saveWorkspace(name: string) {
    const now = new Date().toISOString();
    if (activeWorkspaceId) {
      setSavedWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === activeWorkspaceId
            ? { ...workspace, name, updatedAt: now, state: cloneObservatoryState(observatory) }
            : workspace,
        ),
      );
      return;
    }
    const id = workspaceId();
    setSavedWorkspaces((current) => [
      ...current,
      { id, name, updatedAt: now, state: cloneObservatoryState(observatory) },
    ]);
    setActiveWorkspaceId(id);
  }

  function loadWorkspace(id: string) {
    const workspace = savedWorkspaces.find((candidate) => candidate.id === id);
    if (!workspace) return;
    setActiveWorkspaceId(id);
    commitState(cloneObservatoryState(workspace.state));
  }

  function deleteWorkspace(id: string) {
    setSavedWorkspaces((current) => current.filter((workspace) => workspace.id !== id));
    if (activeWorkspaceId === id) setActiveWorkspaceId(null);
  }

  function exportWorkspace() {
    const payload = JSON.stringify(
      {
        format: 'vitae-schema-observatory',
        exportedAt: new Date().toISOString(),
        state: observatory,
      },
      null,
      2,
    );
    downloadBlob(
      new Blob([payload], { type: 'application/json;charset=utf-8' }),
      'vitae-observatory-workspace.json',
    );
  }

  function importWorkspace(payload: string) {
    try {
      const parsed = JSON.parse(payload) as { state?: unknown };
      const state = parseObservatoryWorkspace(JSON.stringify(parsed.state ?? parsed));
      if (!state) return;
      setActiveWorkspaceId(null);
      commitState(state);
    } catch {
      // Invalid files leave the current workspace untouched.
    }
  }

  function isolateSelection() {
    if (!selection) return;
    const relationTypes = [
      ...selectionConnections.incoming,
      ...selectionConnections.outgoing,
    ].map((relation) => relation.type);
    const next = cloneObservatoryState(observatory);
    next.filters.relations = [...new Set(relationTypes)];
    next.lens = 'focus';
    commitState(next);
  }

  function hideSelection() {
    if (!selection) return;
    const next = cloneObservatoryState(observatory);
    if (!next.hiddenIds.includes(selection.id)) next.hiddenIds.push(selection.id);
    next.selectedIds = next.selectedIds.filter((id) => id !== selection.id);
    next.compareIds = next.compareIds.filter((id) => id !== selection.id);
    commitState(next);
  }

  function renderEmptyInspector() {
    return (
      <div className="ec-browser">
        <div className="ec-detail__eyebrow">Keyboard-accessible index</div>
        <h2>Choose a signal</h2>
        <p>
          Select an entity or relation. Hold Shift while selecting a second item to compare.
        </p>
        {ENTITY_GROUPS.map((group) => (
          <details key={group.label} className="ec-browser__group">
            <summary>
              <span>{group.label}</span>
              <small>{group.types.length} entities</small>
            </summary>
            <div>
              {CATALOG_ENTITIES.filter((entity) => entity.group === group.label).map((entity) => (
                <button key={entity.id} type="button" onClick={() => select(entity.id)}>
                  <code>{entity.type}</code>
                  <span>{entity.fields.length} props</span>
                </button>
              ))}
            </div>
          </details>
        ))}
        <details className="ec-browser__group">
          <summary>
            <span>Relations</span>
            <small>{CATALOG_RELATIONS.length} types</small>
          </summary>
          <div>
            {CATALOG_RELATIONS.map((relation) => (
              <button key={relation.id} type="button" onClick={() => select(relation.id)}>
                <code>{relation.type}</code>
                <span>{relation.fields.length} props</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="ec ec--observatory" data-print-mode={printMode ?? 'atlas'}>
      <header className="ec-header ec-observatory-header">
        <div className="ec-header__brand">
          <span className="ec-header__kicker">Vitae · schema observatory</span>
          <h1>Relation intelligence, without the hairball.</h1>
          <p>
            Navigate {CATALOG_COUNTS.nodes} entity constellations and {CATALOG_COUNTS.edges}{' '}
            directed relation signals through Orbit, Focus, and Matrix lenses.
          </p>
        </div>
        <div className="ec-header__actions" aria-label="Observatory outputs">
          <button type="button" onClick={() => startPrint('workspace')}>Print current lens</button>
          <button type="button" onClick={() => startPrint('overview')}>Print overview pack</button>
          <button type="button" onClick={() => startPrint('atlas')}>Print full atlas</button>
          <button type="button" onClick={downloadWorkspaceSvg}>Lens SVG</button>
          <button type="button" onClick={downloadWorkspacePng}>Lens PNG</button>
          <button type="button" onClick={downloadOverviewSvg}>Canonical SVG</button>
        </div>
      </header>

      <nav className="ec-view-tabs" aria-label="Reference view">
        <button
          type="button"
          className={view === 'explore' ? 'is-active' : ''}
          aria-current={view === 'explore' ? 'page' : undefined}
          onClick={() => patchView('explore')}
        >
          Schema observatory
        </button>
        <button
          type="button"
          className={view === 'atlas' ? 'is-active' : ''}
          aria-current={view === 'atlas' ? 'page' : undefined}
          onClick={() => patchView('atlas')}
        >
          A4 atlas
        </button>
      </nav>

      {view === 'explore' ? (
        <main className="ec-explorer ec-observatory">
          <EntityObservatoryControls
            state={observatory}
            drawerOpen={drawerOpen}
            search={search}
            searchResults={searchResults}
            activeWorkspaceId={activeWorkspaceId}
            savedWorkspaces={savedWorkspaces}
            onStateChange={commitState}
            onToggleDrawer={() => setDrawerOpen((current) => !current)}
            onSearch={setSearch}
            onSelect={select}
            onFit={() => graphRef.current?.fit()}
            onZoomIn={() => graphRef.current?.zoomIn()}
            onZoomOut={() => graphRef.current?.zoomOut()}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyRef.current.length > 0}
            canRedo={futureRef.current.length > 0}
            onClear={clearSelection}
            onReset={() => {
              setActiveWorkspaceId(null);
              commitState(cloneObservatoryState(DEFAULT_OBSERVATORY_STATE));
            }}
            onCopyLink={() => void navigator.clipboard?.writeText(window.location.href)}
            onOpenCommands={() => setCommandOpen(true)}
            onSaveWorkspace={saveWorkspace}
            onLoadWorkspace={loadWorkspace}
            onDeleteWorkspace={deleteWorkspace}
            onExportWorkspace={exportWorkspace}
            onImportWorkspace={importWorkspace}
            onUnpinAll={() => {
              const next = cloneObservatoryState(observatory);
              next.pinnedPositions = {};
              commitState(next);
            }}
          />

          <section ref={stageRef} className="ec-observatory-stage">
            <div className="ec-observatory-viewport">
              {observatory.lens === 'matrix' ? (
                <EntityObservatoryMatrix state={observatory} onSelect={select} />
              ) : observatory.lens === 'focus' && !observatory.selectedIds.length ? (
                <div className="ec-focus-empty">
                  <span aria-hidden>◎</span>
                  <h2>Focus needs a center of gravity.</h2>
                  <p>Search or select an entity or relation, then its neighborhood will unfold here.</p>
                  <button type="button" onClick={() => setLens('orbit')}>Return to Orbit</button>
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="ec-observatory-loading" role="status">
                      Calibrating the observatory…
                    </div>
                  }
                >
                  <EntityObservatoryGraph
                    ref={graphRef}
                    scene={scene}
                    state={observatory}
                    onSelect={select}
                    onHover={setHoveredId}
                    onPin={(id, x, y) => {
                      const next = cloneObservatoryState(observatory);
                      next.pinnedPositions[id] = { x, y };
                      commitState(next);
                    }}
                    onClear={() => {
                      setHoveredId(null);
                      clearSelection();
                    }}
                  />
                </Suspense>
              )}
              {observatory.lens !== 'matrix' ? (
                <div className="ec-observatory-legend" aria-label="Visual legend">
                  <span><i className="is-entity" />entity</span>
                  <span><i className="is-relation" />relation</span>
                  <span><i className="is-direction" />direction</span>
                  <b>{scene.routeCount} routes visible</b>
                </div>
              ) : null}
            </div>

            <aside className="ec-inspector ec-observatory-inspector" aria-label="Schema details">
              {selection ? (
                <>
                  <div className="ec-inspector-actions">
                    <button type="button" onClick={isolateSelection}>Isolate</button>
                    <button type="button" onClick={hideSelection}>Hide</button>
                    <button
                      type="button"
                      onClick={() => {
                        setLens('focus');
                        window.setTimeout(
                          () => graphRef.current?.focus([selection.id]),
                          80,
                        );
                      }}
                    >
                      Open in Focus
                    </button>
                    <button type="button" aria-label="Close details" onClick={clearSelection}>×</button>
                  </div>
                  <div className="ec-inspector-signal">
                    <div>
                      <span>incoming</span>
                      <strong>{selectionConnections.incoming.length}</strong>
                    </div>
                    <div>
                      <span>outgoing</span>
                      <strong>{selectionConnections.outgoing.length}</strong>
                    </div>
                    <div>
                      <span>degree</span>
                      <strong>
                        {selectionConnections.incoming.length + selectionConnections.outgoing.length}
                      </strong>
                    </div>
                  </div>
                  <SelectionDetails selection={selection as CatalogSelection} />
                </>
              ) : (
                renderEmptyInspector()
              )}
            </aside>
          </section>
        </main>
      ) : null}

      <div className="ec-export-snapshot" aria-hidden="true">
        <EntityCatalogOverview svgRef={overviewSvgRef} />
        <EntityObservatorySnapshot
          state={observatory}
          scene={scene}
          svgRef={workspaceSvgRef}
          title={`Vitae Schema Observatory · ${observatory.lens}`}
          idPrefix="ec-export-workspace"
        />
      </div>
      {printMode === 'workspace' ? (
        <EntityObservatoryPrint state={observatory} scene={scene} />
      ) : null}
      {view === 'atlas' || printMode === 'overview' || printMode === 'atlas' ? (
        <EntityCatalogAtlas visible={view === 'atlas'} />
      ) : null}
      <EntityObservatoryCommandPalette
        open={commandOpen}
        commands={commands}
        onClose={() => setCommandOpen(false)}
      />
    </div>
  );
}

export default EntityCatalog;
