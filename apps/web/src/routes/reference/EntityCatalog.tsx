// Both sheets belong to this route and nothing else uses their .ec-* scope,
// so they ride the lazy chunk rather than the global bundle. Print rules
// first, observatory second: that is the order main.tsx used, and the two
// still share four selectors.
import '../../styles/entity-catalog-print.css';
import '../../styles/entity-observatory.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Mono,
  Skeleton,
  StatusTrace,
  Tabs,
} from '@vitae/ui';
import { ErrorBoundary } from '../../components/ErrorBoundary.js';
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
  OBSERVATORY_GROUP_ORDER,
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

/**
 * Everything on this screen that can fail reports through one region.
 * The route mounts outside `ToastProvider` (App.tsx puts it inside
 * `AuthedApp`), so the inline grammar is the only one available here, and one
 * region is easier to find than six scattered ones.
 */
interface Notice {
  tone: 'danger' | 'warning';
  title: string;
  detail: string;
}

const VIEW_TABS = [
  { value: 'explore', label: 'Schema observatory' },
  { value: 'atlas', label: 'A4 atlas' },
] as const;

/** How much work each print mode mounts, so the wait can be named. */
const PRINT_SHEETS: Record<PrintMode, string> = {
  workspace: 'current lens',
  overview: '1 sheet',
  atlas: '62 sheets',
};

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
  const [notice, setNotice] = useState<Notice | null>(null);
  // Rasterising 2400 by 1500, and mounting 62 print sheets, are both slow
  // enough that a silent click reads as a broken button. Naming the work in
  // flight is also what stops a second click stacking a second render.
  const [busy, setBusy] = useState<{ label: string; detail?: string } | null>(null);
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  const graphRef = useRef<EntityObservatoryGraphHandle | null>(null);
  const overviewSvgRef = useRef<SVGSVGElement | null>(null);
  const workspaceSvgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<ObservatoryWorkspaceState[]>([]);
  const futureRef = useRef<ObservatoryWorkspaceState[]>([]);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const firstRenderRef = useRef(true);

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
  const selectionId = selection?.id ?? null;
  const selectionName = selection
    ? 'type' in selection
      ? selection.type
      : selection.label
    : null;

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

  // Selecting from the index unmounts the index, taking the focused button
  // with it, so focus would fall back to the document body and a keyboard
  // user would be silently returned to the top of the page. The first render
  // is skipped so a selection restored from the URL does not steal focus past
  // the heading on load.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (selectionId) detailRef.current?.focus();
  }, [selectionId]);

  // Mounting 62 sheets used to run inside flushSync, which blocks the main
  // thread before the browser can paint: whatever the screen said about the
  // wait, the user could not see it until the wait was over. Printing is
  // driven from an effect instead, so the sheets and the trace paint first
  // and the dialog opens on the frame after that.
  useEffect(() => {
    if (!printMode) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.print();
      // print() returns when the dialog closes. Clearing here as well as on
      // afterprint means the busy state cannot outlive the dialog in a
      // browser that never fires the event.
      setPrintMode(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printMode]);

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
        run: () => {
          // requestFullscreen rejects when the browser refuses: an iframe
          // without allowfullscreen, a call it does not count as user
          // activated. A discarded rejection leaves the command looking broken.
          stageRef.current?.requestFullscreen().catch(() => {
            setNotice({
              tone: 'warning',
              title: 'Fullscreen was refused',
              detail: 'This browser would not let the observatory take the whole display.',
            });
          });
        },
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      // Everything below is a bare key, so a held modifier means the user is
      // talking to the browser and not to us. Without this guard Ctrl+F
      // refits the diagram under the find bar, and Ctrl+1 changes the lens on
      // the way to another tab.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === '1') setLens('orbit');
      else if (event.key === '2') setLens('focus');
      else if (event.key === '3') setLens('matrix');
      else if (event.key.toLocaleLowerCase() === 'f') graphRef.current?.fit();
      else if (event.key === 'Escape') clearSelection();
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
    setNotice(null);
    setPrintMode(mode);
  }

  function reportExportFailure(what: string) {
    setNotice({
      tone: 'danger',
      title: `Could not build the ${what}`,
      detail: 'Nothing was downloaded. Reload the page and try once more.',
    });
  }

  function downloadOverviewSvg() {
    const source = overviewSvgRef.current;
    if (!source) {
      reportExportFailure('canonical SVG');
      return;
    }
    setNotice(null);
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
    if (!source) {
      reportExportFailure('lens SVG');
      return;
    }
    setNotice(null);
    downloadBlob(
      new Blob([serializeSvg(source)], { type: 'image/svg+xml;charset=utf-8' }),
      `vitae-observatory-${observatory.lens}.svg`,
    );
  }

  function downloadWorkspacePng() {
    const source = workspaceSvgRef.current;
    if (!source) {
      reportExportFailure('lens PNG');
      return;
    }
    setNotice(null);
    setBusy({ label: 'Rendering the lens PNG', detail: '2400 x 1500' });
    const payload = serializeSvg(source);
    const url = URL.createObjectURL(new Blob([payload], { type: 'image/svg+xml;charset=utf-8' }));
    const finish = () => {
      URL.revokeObjectURL(url);
      setBusy(null);
    };
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1500;
      const context = canvas.getContext('2d');
      if (!context) {
        finish();
        reportExportFailure('lens PNG');
        return;
      }
      context.fillStyle = readGraphPalette().bg;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        finish();
        if (blob) downloadBlob(blob, `vitae-observatory-${observatory.lens}.png`);
        else reportExportFailure('lens PNG');
      }, 'image/png');
    };
    // A serialized SVG that will not decode used to leave this promise-shaped
    // work simply never finishing, with the user watching for a file that was
    // never coming.
    image.onerror = () => {
      finish();
      reportExportFailure('lens PNG');
    };
    image.src = url;
  }

  async function copyShareLink() {
    setCopyState(null);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('copied');
    } catch {
      // Denied permission, an insecure context, an unfocused document: all of
      // them reject, and all of them used to be swallowed by a bare void.
      setCopyState('failed');
    }
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
    const rejected = () =>
      setNotice({
        tone: 'danger',
        title: 'That file is not an observatory workspace',
        detail: 'Export one from this screen to see the shape it expects. Nothing was changed.',
      });
    try {
      const parsed = JSON.parse(payload) as { state?: unknown };
      const state = parseObservatoryWorkspace(JSON.stringify(parsed.state ?? parsed));
      // Both branches used to leave the workspace untouched and say nothing,
      // so the only available reading was that the import button is broken.
      if (!state) {
        rejected();
        return;
      }
      setNotice(null);
      setActiveWorkspaceId(null);
      commitState(state);
    } catch {
      rejected();
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
        {/* This index is the inspector's empty state, so it is gone by the
            time a second item could be picked. Compare is offered where it
            can actually be reached. */}
        <p>
          Select an entity or relation here, then hold Shift while picking a second one on the
          map to compare the two.
        </p>
        {ENTITY_GROUPS.map((group) => (
          <details key={group.label} className="ec-browser__group">
            <summary>
              <span>{group.label}</span>
              <small>{group.types.length} entities</small>
            </summary>
            {/* Sixty-two records in six groups. As sibling divs a screen
                reader could not say how long a group was or how far through
                it you had got, on the panel this screen calls its index. */}
            <ul className="ec-browser__group-list" aria-label={`${group.label} entities`}>
              {CATALOG_ENTITIES.filter((entity) => entity.group === group.label).map((entity) => (
                <li key={entity.id}>
                  {/* Shift is forwarded so this index behaves the same as
                      the map if it ever renders beside a selection. */}
                  <button type="button" onClick={(event) => select(entity.id, event.shiftKey)}>
                    <code>{entity.type}</code>
                    <span>{entity.fields.length} props</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        <details className="ec-browser__group">
          <summary>
            <span>Relations</span>
            <small>{CATALOG_RELATIONS.length} types</small>
          </summary>
          <ul className="ec-browser__group-list" aria-label="Relation types">
            {CATALOG_RELATIONS.map((relation) => (
              <li key={relation.id}>
                <button type="button" onClick={(event) => select(relation.id, event.shiftKey)}>
                  <code>{relation.type}</code>
                  <span>{relation.fields.length} props</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  return (
    <div className="ec ec--observatory" data-print-mode={printMode ?? 'atlas'}>
      <header className="ec-header ec-observatory-header">
        <div className="ec-header__brand">
          {/* This route mounts outside Shell, so it carries no rail and no
              breadcrumb. Without this the only exit is the Back button,
              which a link opened in a new tab does not have, and which is
              unreliable here anyway because the screen replaces the query
              string on nearly every interaction. */}
          <Link className="ec-header__back" to="/today">
            <span aria-hidden>&larr;</span> Back to Vitae
          </Link>
          <span className="ec-header__kicker">Vitae · schema observatory</span>
          <h1>Relation intelligence, without the hairball.</h1>
          <p>
            Navigate {CATALOG_COUNTS.nodes} entity constellations and {CATALOG_COUNTS.edges}{' '}
            directed relation signals through Orbit, Focus, and Matrix lenses.
          </p>
        </div>
        {/* aria-label on a bare div names nothing: a generic role takes no
            accessible name, so these six arrived as loose unlabelled
            siblings. */}
        <div
          className="ec-header__actions"
          role="group"
          aria-label="Observatory outputs"
          aria-busy={printMode !== null || busy !== null}
        >
          <Button
            variant="primary"
            size="sm"
            onClick={() => startPrint('workspace')}
          >
            Print current lens
          </Button>
          <Button size="sm" onClick={() => startPrint('overview')}>
            Print overview pack
          </Button>
          <Button size="sm" onClick={() => startPrint('atlas')}>
            Print full atlas
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={downloadWorkspaceSvg}>
            Lens SVG
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={downloadWorkspacePng}>
            Lens PNG
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={downloadOverviewSvg}>
            Canonical SVG
          </Button>
        </div>
      </header>

      <div className="ec-report">
        {printMode ? (
          <StatusTrace
            tone="live"
            label="Preparing the print sheets"
            detail={PRINT_SHEETS[printMode]}
          />
        ) : null}
        {busy ? <StatusTrace tone="live" label={busy.label} detail={busy.detail} /> : null}
        {copyState === 'copied' ? <StatusTrace tone="success" label="Share link copied" /> : null}
        {copyState === 'failed' ? (
          <StatusTrace
            tone="danger"
            label="Could not copy the link"
            detail="Copy it from the address bar"
          />
        ) : null}
        {notice ? (
          <Banner
            tone={notice.tone}
            title={notice.title}
            onDismiss={() => setNotice(null)}
          >
            {notice.detail}
          </Banner>
        ) : null}
      </div>

      <Tabs
        className="ec-view-tabs"
        label="Reference view"
        tabs={VIEW_TABS}
        value={view}
        onChange={(next) => patchView(next as ReferenceView)}
      />

      <main id="main-content" className="ec-main">
      {view === 'explore' ? (
        <div className="ec-explorer ec-observatory">
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
            onCopyLink={() => void copyShareLink()}
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
                  <EmptyState
                    glyph="graph"
                    title="Focus needs a center of gravity"
                    detail="Search or select an entity or relation, then its neighborhood unfolds here."
                    action={<Button onClick={() => setLens('orbit')}>Return to Orbit</Button>}
                  />
                </div>
              ) : (
                // Nothing above this route catches a render error: the app's
                // boundaries are mounted inside AuthedApp, and this route is
                // not. A rejected chunk import used to white-screen the whole
                // public reference page.
                <ErrorBoundary
                  fallback={(retry) => (
                    <div className="ec-observatory-loading">
                      <ErrorState
                        title="The observatory canvas did not load"
                        detail="The header, the lenses and the Matrix view still work."
                        onRetry={retry}
                        action={
                          <Button size="sm" onClick={() => setLens('matrix')}>
                            Open the Matrix lens
                          </Button>
                        }
                      />
                    </div>
                  )}
                >
                <Suspense
                  fallback={
                    <div className="ec-observatory-loading">
                      {/* The canvas is the largest region on the page, so its
                          pending state holds the viewport rather than
                          collapsing to one centred line and snapping back. */}
                      <Skeleton width="100%" height="100%" />
                      <span role="status" className="ec-observatory-loading__label">
                        Calibrating the observatory
                      </span>
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
                    onRequestMatrix={() => setLens('matrix')}
                  />
                </Suspense>
                </ErrorBoundary>
              )}
              {observatory.lens !== 'matrix' ? (
                <div className="ec-observatory-legend" role="group" aria-label="Visual legend">
                  <span><i className="is-entity" />entity</span>
                  <span><i className="is-relation" />relation</span>
                  <span><i className="is-direction" />direction</span>
                  {/* The five schema groups were readable only as hue, and
                      only from a swatch inside a drawer that starts closed.
                      Each group's outline dash is repeated here so the key
                      works without colour vision as well as without the
                      cockpit. */}
                  {OBSERVATORY_GROUP_ORDER.map((group) => (
                    <span key={group} className="ec-observatory-legend__group">
                      <i data-group={group} />
                      {group.toLocaleLowerCase()}
                    </span>
                  ))}
                  <span className="ec-observatory-legend__count" aria-live="polite">
                    <Mono>{scene.routeCount}</Mono> routes visible
                  </span>
                </div>
              ) : null}
            </div>

            <aside className="ec-inspector ec-observatory-inspector" aria-label="Schema details">
              {/* One polite region for the whole screen. The canvas is a
                  canvas, so this and the route count are the only ways a
                  selection is ever spoken. */}
              <span className="u-visually-hidden" role="status">
                {selectionName
                  ? `${selectionName} selected. ${selectionConnections.incoming.length} incoming, ${selectionConnections.outgoing.length} outgoing.`
                  : ''}
              </span>
              {selection ? (
                <div
                  ref={detailRef}
                  tabIndex={-1}
                  role="group"
                  aria-label={`${selectionName} details`}
                  className="ec-inspector-body"
                >
                  <div className="ec-inspector-actions">
                    <Button size="sm" onClick={isolateSelection}>Isolate</Button>
                    <Button size="sm" onClick={hideSelection}>Hide</Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setLens('focus');
                        window.setTimeout(
                          () => graphRef.current?.focus([selection.id]),
                          80,
                        );
                      }}
                    >
                      Open in Focus
                    </Button>
                    <Button size="sm" aria-label="Close details" onClick={clearSelection}>
                      <span aria-hidden>×</span>
                    </Button>
                  </div>
                  {/* Three tiles of span plus strong carried no label/value
                      relationship and printed the screen's most-read numbers
                      at 8px. This is the ledger Record.tsx uses. */}
                  <dl className="ec-inspector-signal">
                    <div>
                      <dt>incoming</dt>
                      <dd><Mono>{selectionConnections.incoming.length}</Mono></dd>
                    </div>
                    <div>
                      <dt>outgoing</dt>
                      <dd><Mono>{selectionConnections.outgoing.length}</Mono></dd>
                    </div>
                    <div>
                      <dt>degree</dt>
                      <dd>
                        <Mono>
                          {selectionConnections.incoming.length +
                            selectionConnections.outgoing.length}
                        </Mono>
                      </dd>
                    </div>
                  </dl>
                  <SelectionDetails selection={selection as CatalogSelection} />
                </div>
              ) : (
                renderEmptyInspector()
              )}
            </aside>
          </section>
        </div>
      ) : null}
      {/* The atlas used to render outside every landmark, so on that tab the
          "main" shortcut led nowhere and 62 sheets were reachable only by
          walking the page from the top. */}
      {view === 'atlas' ? <EntityCatalogAtlas visible /> : null}
      </main>

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
      {view !== 'atlas' && (printMode === 'overview' || printMode === 'atlas') ? (
        <EntityCatalogAtlas visible={false} />
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
