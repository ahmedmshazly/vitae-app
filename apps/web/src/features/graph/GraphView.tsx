/**
 * Life map, navigable graph explorer (FR-VIS-001).
 * Orchestrates filters, lenses, path mode, peek, and keyboard locomotion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { edgeDisplayLabel } from '@vitae/core';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { EmptyState, ErrorState, SkeletonRows } from '@vitae/ui';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.js';
import { entityHref } from '../../lib/entity-href.js';
import { readGraphPalette, type GraphPalette } from '../../lib/graph-palette.js';
import { DEFAULT_ACTIVE_TYPES, FILTER_GROUPS } from './constants.js';
import { flyToNode, GraphCanvas } from './GraphCanvas.js';
import { GraphDisplayPrefsPanel } from './GraphDisplayPrefs.js';
import { useGraphDisplayPrefs } from './displayPrefs.js';
import { GraphPathfinder, trailAfterJump } from './GraphPathfinder.js';
import { FocusBreadcrumb, GraphPeek, PathStory, type PeekLink } from './GraphPeek.js';
import { ConnectedList, GraphSearch } from './GraphSearch.js';
import { GraphToolbar } from './GraphToolbar.js';
import type {
  FgLink,
  FgNode,
  FocusTrailHop,
  GraphData,
  GraphLens,
  GraphMode,
  GraphPathResult,
  GNode,
} from './types.js';
import { hashStr, linkEndId } from './types.js';
import { useGraphKeyboard } from './useGraphKeyboard.js';

function edgeUndirectedKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function GraphView() {
  const [params] = useSearchParams();
  const focusParam = params.get('focus') ?? undefined;
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const { flash } = useToast();

  const [depth, setDepth] = useState(2);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set(DEFAULT_ACTIVE_TYPES));
  const [lens, setLens] = useState<GraphLens>('neighborhood');
  const [mode, setMode] = useState<GraphMode>('explore');
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [paused, setPaused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [displayPrefs, patchDisplayPrefs, resetDisplayPrefs] = useGraphDisplayPrefs();
  const [trail, setTrail] = useState<FocusTrailHop[]>([]);
  const [pathTo, setPathTo] = useState<{ id: string; title: string } | null>(null);

  const fgRef = useRef<ForceGraphMethods<FgNode, FgLink> | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const palette = useMemo<GraphPalette>(() => readGraphPalette(), []);

  const typesKey = useMemo(() => [...activeTypes].sort().join(','), [activeTypes]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['graph', focusParam ?? null, depth, typesKey],
    queryFn: () => {
      const qs = new URLSearchParams({ depth: String(depth) });
      if (focusParam) qs.set('focus', focusParam);
      if (typesKey) qs.set('types', typesKey);
      return api.get<GraphData>(`/graph?${qs.toString()}`);
    },
  });

  const selfNode = useMemo(() => data?.nodes.find((n) => n.isSelf) ?? null, [data]);
  const focusTitle = useMemo(() => data?.nodes.find((n) => n.id === data.focus)?.title, [data]);
  const pathFromId = selfNode?.id ?? data?.focus ?? null;
  const pathFromTitle = selfNode?.title ?? trail[0]?.title ?? 'Self';

  const {
    data: pathData,
    isFetching: pathLoading,
    isError: pathFailed,
  } = useQuery({
    queryKey: ['graph-path', pathFromId, pathTo?.id],
    queryFn: () =>
      api.get<GraphPathResult>(
        `/graph/path?from=${encodeURIComponent(pathFromId!)}&to=${encodeURIComponent(pathTo!.id)}&maxDepth=6`,
      ),
    enabled: mode === 'path' && Boolean(pathFromId && pathTo?.id),
  });

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seed focus trail from current focus node title.
  useEffect(() => {
    if (!data?.focus) return;
    const focusNode = data.nodes.find((n) => n.id === data.focus);
    if (!focusNode) return;
    setTrail((prev) => {
      if (prev.length === 0) return [{ id: focusNode.id, title: focusNode.title }];
      if (prev[prev.length - 1]?.id === focusNode.id) return prev;
      return trailAfterJump(prev, { id: focusNode.id, title: focusNode.title });
    });
  }, [data?.focus, data?.nodes]);

  const typeGroups = useMemo(() => {
    const present = new Set(data?.nodes.map((n) => n.type) ?? []);
    // Always offer defaults even before load so chrome is stable.
    for (const t of DEFAULT_ACTIVE_TYPES) present.add(t);
    return FILTER_GROUPS.map((g) => ({
      label: g.label,
      types: g.types.filter((t) => present.has(t)),
    })).filter((g) => g.types.length > 0);
  }, [data]);

  const edgeTypesInPayload = useMemo(() => {
    const set = new Set(data?.edges.map((e) => e.type) ?? []);
    return [...set].sort();
  }, [data]);

  // Initialize edge-kind selection when entering that lens.
  useEffect(() => {
    if (lens !== 'edgeKinds') return;
    if (activeEdgeTypes.size === 0 && edgeTypesInPayload.length > 0) {
      setActiveEdgeTypes(new Set(edgeTypesInPayload));
    }
  }, [lens, edgeTypesInPayload, activeEdgeTypes.size]);

  const view = useMemo(() => {
    if (!data) return null;
    const visible = new Set(
      data.nodes
        .filter((n) => n.isSelf || n.id === data.focus || activeTypes.has(n.type))
        .map((n) => n.id),
    );
    const nodes: FgNode[] = data.nodes
      .filter((n) => visible.has(n.id))
      .map((n) => {
        const r1 = (hashStr(n.id) % 1000) / 1000;
        const r2 = (hashStr(`${n.id}y`) % 1000) / 1000;
        return { ...n, x: (r1 - 0.5) * 600, y: (r2 - 0.5) * 400 };
      });

    let edges = data.edges.filter((e) => visible.has(e.src) && visible.has(e.dst));
    if (lens === 'edgeKinds' && activeEdgeTypes.size > 0) {
      edges = edges.filter((e) => activeEdgeTypes.has(e.type));
      const keep = new Set<string>();
      for (const e of edges) {
        keep.add(e.src);
        keep.add(e.dst);
      }
      if (data.focus) keep.add(data.focus);
      for (const n of nodes) if (n.isSelf) keep.add(n.id);
      const filteredNodes = nodes.filter((n) => keep.has(n.id));
      const links: FgLink[] = edges.map((e) => ({
        source: e.src,
        target: e.dst,
        type: e.type,
        strength: e.strength,
        relation: e.relation,
        kind: e.kind,
      }));
      const neighbors = buildNeighbors(links);
      return { nodes: filteredNodes, links, neighbors };
    }

    const links: FgLink[] = edges.map((e) => ({
      source: e.src,
      target: e.dst,
      type: e.type,
      strength: e.strength,
      relation: e.relation,
      kind: e.kind,
    }));
    return { nodes, links, neighbors: buildNeighbors(links) };
  }, [data, activeTypes, lens, activeEdgeTypes]);

  const pathNodeIds = useMemo(() => {
    if (mode !== 'path' || !pathData?.found) return new Set<string>();
    return new Set(pathData.hops.map((h) => h.nodeId));
  }, [mode, pathData]);

  const pathEdgeKeys = useMemo(() => {
    if (mode !== 'path' || !pathData?.found) return new Set<string>();
    return new Set(pathData.edges.map((e) => edgeUndirectedKey(e.src, e.dst)));
  }, [mode, pathData]);

  const selectAndFly = useCallback(
    (node: FgNode | GNode) => {
      setSelected(node);
      const live = view?.nodes.find((n) => n.id === node.id);
      if (live) flyToNode(fgRef.current, live, reducedMotion);
    },
    [view, reducedMotion],
  );

  const peekLinks: PeekLink[] = useMemo(() => {
    if (!selected || !view || !data) return [];
    const out: PeekLink[] = [];
    for (const e of data.edges) {
      if (e.src === selected.id) {
        const neighbor = view.nodes.find((n) => n.id === e.dst);
        if (neighbor) {
          out.push({
            neighbor,
            edgeType: e.type,
            direction: 'out',
            relation: e.relation,
            kind: e.kind,
          });
        }
      } else if (e.dst === selected.id) {
        const neighbor = view.nodes.find((n) => n.id === e.src);
        if (neighbor) {
          out.push({
            neighbor,
            edgeType: e.type,
            direction: 'in',
            relation: e.relation,
            kind: e.kind,
          });
        }
      }
    }
    out.sort(
      (a, b) =>
        a.edgeType.localeCompare(b.edgeType) || a.neighbor.title.localeCompare(b.neighbor.title),
    );
    return out.slice(0, 40);
  }, [selected, view, data]);

  const neighborIds = useMemo(() => {
    if (!selected || !view) return [] as string[];
    return [...(view.neighbors.get(selected.id) ?? [])].sort();
  }, [selected, view]);

  const connectedRows = useMemo(() => {
    return peekLinks.map((l) => ({
      node: l.neighbor,
      edgeLabel: edgeDisplayLabel(l.edgeType, l.direction, { relation: l.relation, kind: l.kind }),
    }));
  }, [peekLinks]);

  const makeFocus = useCallback(
    (node: GNode) => {
      setTrail((prev) => trailAfterJump(prev, { id: node.id, title: node.title }));
      setSelected(null);
      navigate(`/explore/graph?focus=${encodeURIComponent(node.id)}`);
    },
    [navigate],
  );

  const openRecord = useCallback(
    (node: GNode) => {
      navigate(entityHref(node.type, node.id));
    },
    [navigate],
  );

  useGraphKeyboard({
    enabled: true,
    selected: selected && view ? (view.nodes.find((n) => n.id === selected.id) ?? null) : null,
    neighbors: neighborIds,
    mode,
    depth,
    searchOpen,
    onSelectId: (id) => {
      if (!id || !view) {
        setSelected(null);
        return;
      }
      const n = view.nodes.find((x) => x.id === id);
      if (n) selectAndFly(n);
    },
    onOpen: openRecord,
    onFocus: makeFocus,
    onMode: setMode,
    onDepth: setDepth,
    onToggleSearch: () => setSearchOpen((o) => !o),
    onClear: () => {
      if (searchOpen) setSearchOpen(false);
      else if (selected) setSelected(null);
      else if (mode === 'path') {
        setMode('explore');
        setPathTo(null);
      }
    },
  });

  function exportPng() {
    const canvas = panelRef.current?.querySelector('canvas');
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((png) => {
      if (!png) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = 'vitae-life-map.png';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function focusSelection() {
    if (!selected || !view) return;
    const live = view.nodes.find((n) => n.id === selected.id);
    if (live) flyToNode(fgRef.current, live, reducedMotion);
  }

  const modeHint =
    mode === 'path'
      ? 'Choose a destination to reveal the evidence path from self'
      : lens === 'hubs'
        ? 'High-connectivity records carry more visual weight'
        : lens === 'career'
          ? 'Roles, organizations, projects, and evidence form the career spine'
          : lens === 'strength'
            ? 'Known relationships reflect their recorded tie strength'
            : lens === 'edgeKinds'
              ? 'Relationship kinds become the active filter'
              : 'Explore the neighborhood, select to inspect, or open the underlying record';

  return (
    <div className="page page--lifemap">
      <GraphToolbar
        mode={mode}
        onMode={(m) => {
          setMode(m);
          if (m === 'path' && !pathTo && selected && !selected.isSelf) {
            setPathTo({ id: selected.id, title: selected.title });
          }
        }}
        lens={lens}
        onLens={setLens}
        typeGroups={typeGroups}
        activeTypes={activeTypes}
        onToggleType={(t) =>
          setActiveTypes((prev) => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return next;
          })
        }
        edgeTypes={edgeTypesInPayload}
        activeEdgeTypes={activeEdgeTypes}
        onToggleEdgeType={(t) =>
          setActiveEdgeTypes((prev) => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return next;
          })
        }
        depth={depth}
        truncated={Boolean(data?.truncated)}
        palette={palette}
        modeHint={modeHint}
        nodeCount={view?.nodes.length}
        connectionCount={view?.links.length}
        focusTitle={focusTitle}
        busy={isLoading}
      />

      <FocusBreadcrumb
        trail={trail}
        onHop={(id) => navigate(`/explore/graph?focus=${encodeURIComponent(id)}`)}
        onReset={() => {
          setTrail([]);
          navigate('/explore/graph');
        }}
      />

      {mode === 'path' && (
        <GraphPathfinder
          fromId={pathFromId}
          fromTitle={pathFromTitle}
          toId={pathTo?.id ?? null}
          toTitle={pathTo?.title ?? null}
          selfId={selfNode?.id ?? null}
          onPickTo={(e) => setPathTo({ id: e.id, title: e.title })}
          onClearTo={() => setPathTo(null)}
        />
      )}

      {mode === 'path' && (
        <PathStory
          path={pathData}
          loading={pathLoading}
          failed={pathFailed}
          emptyHint="No path within current depth, expand more or clear filters."
        />
      )}

      {/* A <canvas> is opaque to assistive tech: it had no name, no role and
          nothing announcing what was selected, so the keyboard locomotion that
          already existed (⌘F, then arrows along the neighbours, Enter to open)
          was unreachable and undiscoverable. */}
      <div
        className="graph__panel graph__panel--lifemap"
        ref={panelRef}
        role="region"
        aria-label={
          view
            ? `Life map: ${view.nodes.length} records and ${view.links.length} connections. Press Command F to find a record, then use the left and right arrow keys to walk its connections and Enter to open one.`
            : 'Life map'
        }
        aria-busy={isLoading}
      >
        {isError ? (
          // `isError` was never destructured, so a failed load left `data`
          // undefined, `!view` held, and the screen span a spinner for ever
          // without ever saying that anything had gone wrong.
          <div className="grid h-full place-items-center p-8">
            <ErrorState
              title="Couldn’t draw the map"
              detail={(error as Error | null)?.message}
              onRetry={() => void refetch()}
            />
          </div>
        ) : isLoading || !view ? (
          <div className="p-8">
            <SkeletonRows rows={5} label="Connecting records on the life map" />
          </div>
        ) : view.nodes.length === 0 ? (
          <div className="grid h-full place-items-center p-8">
            <EmptyState
              glyph="graph"
              title="Nothing to explore yet"
              hint="Capture people, organizations and projects, the map draws itself from the ties between them."
              action={
                <Link className="vt-btn vt-btn--sm" to="/network/people">
                  Open People
                </Link>
              }
            />
          </div>
        ) : (
          <GraphCanvas
            width={size.w}
            height={size.h}
            nodes={view.nodes}
            links={view.links}
            neighbors={view.neighbors}
            palette={palette}
            lens={lens}
            mode={mode}
            hoverId={hoverId}
            selectedId={selected?.id ?? null}
            pathNodeIds={pathNodeIds}
            pathEdgeKeys={pathEdgeKeys}
            paused={paused}
            reducedMotion={reducedMotion}
            prefs={displayPrefs}
            onHover={setHoverId}
            onSelect={(n) => {
              selectAndFly(n);
              if (mode === 'path' && !n.isSelf) {
                setPathTo({ id: n.id, title: n.title });
              }
            }}
            onOpen={openRecord}
            onBackground={() => setSelected(null)}
            fgRef={fgRef}
          />
        )}

        {/* Selection changes nothing visible to a screen reader, the canvas
            just repaints, so the change has to be spoken. */}
        <p aria-live="polite" className="u-visually-hidden">
          {selected
            ? `${selected.title}, ${selected.type}. ${peekLinks.length} ${peekLinks.length === 1 ? 'connection' : 'connections'}.`
            : ''}
        </p>

        <GraphSearch
          open={searchOpen}
          nodes={view?.nodes ?? []}
          onClose={() => setSearchOpen(false)}
          onPick={(n) => {
            selectAndFly(n);
            // In path mode, clicking a node on the canvas set the target but
            // picking the same node from ⌘F did not, so the only route that
            // works without a mouse was the one that could not finish a path.
            if (mode === 'path' && !n.isSelf) setPathTo({ id: n.id, title: n.title });
          }}
        />

        {selected && (
          <GraphPeek
            selected={selected as FgNode}
            links={peekLinks}
            palette={palette}
            recordHref={entityHref(selected.type, selected.id)}
            onClose={() => setSelected(null)}
            onSelectNeighbor={selectAndFly}
            onOpen={() => openRecord(selected)}
            onMakeFocus={() => makeFocus(selected)}
            onFindPath={() => {
              setMode('path');
              if (!selected.isSelf) setPathTo({ id: selected.id, title: selected.title });
            }}
            onCopyLink={() => {
              const url = `${window.location.origin}/explore/graph?focus=${encodeURIComponent(selected.id)}`;
              // Reported nothing whatsoever, not success, not failure. You
              // pressed it and had to go and check.
              void navigator.clipboard
                ?.writeText(url)
                .then(() => flash(`Copied a link to ${selected.title}`))
                .catch(() => flash('Couldn’t reach the clipboard.', { variant: 'error' }));
            }}
          />
        )}

        <div className="lifemap__connectedwrap">
          <ConnectedList
            open={listOpen}
            selected={selected as FgNode | null}
            rows={connectedRows}
            onSelect={selectAndFly}
            onToggle={() => setListOpen((o) => !o)}
          />
        </div>

        <div className="graph__tools graph__tools--lifemap">
          <GraphDisplayPrefsPanel
            open={prefsOpen}
            prefs={displayPrefs}
            onToggle={() => setPrefsOpen((o) => !o)}
            onPatch={patchDisplayPrefs}
            onReset={resetDisplayPrefs}
          />
          <button
            type="button"
            className="graph__tool"
            onClick={() => setListOpen((o) => !o)}
            aria-pressed={listOpen}
          >
            {listOpen ? 'Hide list' : 'Connected list'}
          </button>
          <button
            type="button"
            className="graph__tool graph__tool--accent"
            disabled={depth >= 4}
            onClick={() => setDepth((d) => Math.min(d + 1, 4))}
          >
            Expand more +
          </button>
          <button
            type="button"
            className="graph__tool"
            disabled={depth <= 1}
            onClick={() => setDepth((d) => Math.max(d - 1, 1))}
          >
            Shallower −
          </button>
          <button
            type="button"
            className="graph__tool"
            onClick={() => fgRef.current?.zoomToFit(reducedMotion ? 0 : 400, 60)}
          >
            Fit map
          </button>
          <button
            type="button"
            className="graph__tool"
            onClick={focusSelection}
            disabled={!selected}
          >
            Focus selection
          </button>
          <button
            type="button"
            className="graph__tool"
            aria-pressed={paused}
            onClick={() => {
              setPaused((p) => {
                const next = !p;
                if (next) fgRef.current?.pauseAnimation();
                else fgRef.current?.resumeAnimation();
                return next;
              });
            }}
          >
            {paused ? 'Resume layout' : 'Pause layout'}
          </button>
          <button type="button" className="graph__tool" onClick={exportPng}>
            Export PNG
          </button>
          <button type="button" className="graph__tool" onClick={() => setSearchOpen(true)}>
            Find · ⌘F
          </button>
          {focusParam && (
            <Link className="graph__tool" to="/explore/graph">
              Reset focus
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function buildNeighbors(links: FgLink[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  for (const l of links) {
    const s = linkEndId(l.source);
    const t = linkEndId(l.target);
    if (!neighbors.has(s)) neighbors.set(s, new Set());
    if (!neighbors.has(t)) neighbors.set(t, new Set());
    neighbors.get(s)!.add(t);
    neighbors.get(t)!.add(s);
  }
  return neighbors;
}

export default GraphView;
