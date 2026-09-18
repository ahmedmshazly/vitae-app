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
import { EmptyState, ErrorState, SkeletonRows, useTheme } from '@vitae/ui';
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
import { GraphDiscoveryPanel, type DiscoveryTab } from './GraphDiscoveryPanel.js';
import type {
  FgLink,
  FgNode,
  FocusTrailHop,
  GraphData,
  GraphDiscovery,
  CommunityDetail,
  CommunityConnectionDetail,
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
  const [params, setSearchParams] = useSearchParams();
  const focusParam = params.get('focus') ?? undefined;
  const discoveryTab = (params.get('discovery') as DiscoveryTab | null) ?? 'communities';
  const selectedCommunityId = params.get('community');
  const selectedBridgeId = params.get('bridge');
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const { flash } = useToast();
  const { resolvedTheme } = useTheme();

  // Start close to the current record. A two-hop view is useful once someone
  // has their bearings, but it is a poor first frame: one person can turn it
  // into a wall of dots before the map has explained itself.
  const [depth, setDepth] = useState(1);
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
  const [pathFrom, setPathFrom] = useState<{ id: string; title: string } | null>(null);
  // Discovery is a workspace-wide directory. It should be available without
  // covering the map people arrived to explore. A shared discovery URL still
  // opens it directly.
  const [discoveryOpen, setDiscoveryOpen] = useState(() =>
    Boolean(selectedCommunityId || selectedBridgeId),
  );
  const [memberOffset, setMemberOffset] = useState(0);
  const [showAllNeighbors, setShowAllNeighbors] = useState(false);

  const fgRef = useRef<ForceGraphMethods<FgNode, FgLink> | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const palette = useMemo<GraphPalette>(() => readGraphPalette(resolvedTheme), [resolvedTheme]);

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

  const discoveryQuery = useQuery({
    queryKey: ['graph-discovery'],
    queryFn: () => api.get<GraphDiscovery>('/graph/discovery'),
    staleTime: 30_000,
  });

  const communityQuery = useQuery({
    queryKey: ['graph-community', selectedCommunityId, memberOffset],
    queryFn: () =>
      api.get<CommunityDetail>(
        `/graph/discovery/community/${encodeURIComponent(selectedCommunityId!)}?offset=${memberOffset}&limit=100`,
      ),
    enabled: Boolean(selectedCommunityId),
    placeholderData: (previous) => previous,
  });

  const connectionPair = params.get('connection')?.split('|') ?? [];
  const connectionQuery = useQuery({
    queryKey: ['graph-community-connection', connectionPair[0], connectionPair[1]],
    queryFn: () =>
      api.get<CommunityConnectionDetail>(
        `/graph/discovery/connection?from=${encodeURIComponent(connectionPair[0]!)}&to=${encodeURIComponent(connectionPair[1]!)}`,
      ),
    enabled: connectionPair.length === 2,
    placeholderData: (previous) => previous,
  });

  const selfNode = useMemo(() => data?.nodes.find((n) => n.isSelf) ?? null, [data]);
  const focusTitle = useMemo(() => data?.nodes.find((n) => n.id === data.focus)?.title, [data]);
  const pathFromId = pathFrom?.id ?? selfNode?.id ?? data?.focus ?? null;
  const pathFromTitle = pathFrom?.title ?? selfNode?.title ?? trail[0]?.title ?? 'Self';

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

  useEffect(() => {
    if (selectedCommunityId || selectedBridgeId) setDiscoveryOpen(true);
  }, [selectedBridgeId, selectedCommunityId]);

  useEffect(() => {
    setShowAllNeighbors(false);
  }, [focusParam]);

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

  const baseView = useMemo(() => {
    const selectedCommunity = discoveryQuery.data?.communities.find(
      (item) => item.id === selectedCommunityId,
    );
    if (selectedCommunity && !communityQuery.isLoading && communityQuery.data) {
      const nodes: FgNode[] = communityQuery.data.members.map((n) => ({
        ...n,
        isSelf: false,
        hop: 0,
        kind: 'record',
        x: ((hashStr(n.id) % 1000) / 1000 - 0.5) * 600,
        y: ((hashStr(`${n.id}y`) % 1000) / 1000 - 0.5) * 400,
      }));
      const links: FgLink[] = communityQuery.data.relationships.map((e) => ({
        source: e.src,
        target: e.dst,
        type: e.type,
        relation: e.relation,
        kind: e.kind,
      }));
      return { nodes, links, neighbors: buildNeighbors(links) };
    }
    if (!data) return null;
    const visible = new Set(
      data.nodes
        .filter((n) => n.isSelf || n.id === data.focus || activeTypes.has(n.type))
        .map((n) => n.id),
    );
    const candidateNodes = data.nodes.filter((n) => visible.has(n.id));
    // A person with a rich life can have dozens of first-degree records. Start
    // with a readable slice led by the strongest structural signals; the full
    // neighborhood is one explicit action away and remains searchable.
    const shouldStartSmall =
      !showAllNeighbors && depth === 1 && lens === 'neighborhood' && candidateNodes.length > 22;
    const displayIds = shouldStartSmall
      ? new Set(
          [...candidateNodes]
            .sort((a, b) => {
              const aAnchor = a.isSelf || a.id === data.focus ? 1 : 0;
              const bAnchor = b.isSelf || b.id === data.focus ? 1 : 0;
              return bAnchor - aAnchor || b.degree - a.degree || a.title.localeCompare(b.title);
            })
            .slice(0, 22)
            .map((node) => node.id),
        )
      : visible;
    const nodes: FgNode[] = candidateNodes
      .filter((n) => displayIds.has(n.id))
      .map((n) => {
        const r1 = (hashStr(n.id) % 1000) / 1000;
        const r2 = (hashStr(`${n.id}y`) % 1000) / 1000;
        return { ...n, x: (r1 - 0.5) * 600, y: (r2 - 0.5) * 400 };
      });

    let edges = data.edges.filter((e) => displayIds.has(e.src) && displayIds.has(e.dst));
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
  }, [
    data,
    activeTypes,
    lens,
    activeEdgeTypes,
    discoveryQuery.data,
    selectedCommunityId,
    communityQuery.data,
    communityQuery.isLoading,
    showAllNeighbors,
    depth,
  ]);

  const pathNodeIds = useMemo(() => {
    if (mode !== 'path' || !pathData?.found) return new Set<string>();
    return new Set(pathData.hops.map((h) => h.nodeId));
  }, [mode, pathData]);

  const pathEdgeKeys = useMemo(() => {
    if (mode !== 'path' || !pathData?.found) return new Set<string>();
    return new Set(pathData.edges.map((e) => edgeUndirectedKey(e.src, e.dst)));
  }, [mode, pathData]);

  // A path can legitimately travel outside the current neighbourhood or a
  // selected community. Keep its returned records in the scene so the route
  // remains visible instead of highlighting invisible IDs.
  const view = useMemo(() => {
    if (!baseView || mode !== 'path' || !pathData?.found) return baseView;
    const known = new Set(baseView.nodes.map((node) => node.id));
    const nodes = [...baseView.nodes];
    for (const [index, hop] of pathData.hops.entries()) {
      if (!known.has(hop.nodeId)) {
        nodes.push({
          id: hop.nodeId,
          title: hop.title,
          type: hop.type,
          isSelf: hop.nodeId === selfNode?.id,
          degree: 0,
          hop: index,
          kind: 'record',
          x: ((hashStr(hop.nodeId) % 1000) / 1000 - 0.5) * 600,
          y: ((hashStr(`${hop.nodeId}y`) % 1000) / 1000 - 0.5) * 400,
        });
      }
    }
    const linkKeys = new Set(
      baseView.links.map((edge) =>
        edgeUndirectedKey(linkEndId(edge.source), linkEndId(edge.target)),
      ),
    );
    const links = [...baseView.links];
    for (const edge of pathData.edges) {
      const key = edgeUndirectedKey(edge.src, edge.dst);
      if (!linkKeys.has(key)) links.push({ source: edge.src, target: edge.dst, type: edge.type });
    }
    return { nodes, links, neighbors: buildNeighbors(links) };
  }, [baseView, mode, pathData, selfNode?.id]);

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

  const updateDiscovery = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  };

  const selectCommunity = (id: string) => {
    setMemberOffset(0);
    setSelected(null);
    setDiscoveryOpen(true);
    updateDiscovery({ discovery: 'communities', community: id, bridge: null, connection: null });
  };

  const zoomMap = (amount: number) => {
    const graph = fgRef.current;
    if (!graph) return;
    graph.zoom(Math.min(5, Math.max(0.55, graph.zoom() + amount)), reducedMotion ? 0 : 180);
  };

  const resetMapView = () => {
    fgRef.current?.zoomToFit(reducedMotion ? 0 : 260, 34);
  };

  return (
    <div className="page page--lifemap">
      <header className="lifemap__atlashead">
        <div>
          <p className="lifemap__kicker">Constellation atlas</p>
          <h1 className="lifemap__title">Life map</h1>
          <p className="lifemap__hint">{modeHint}</p>
        </div>
        <div className="lifemap__headtools">
          <button
            type="button"
            className="graph__tool graph__tool--accent"
            onClick={() => setDiscoveryOpen((value) => !value)}
            aria-expanded={discoveryOpen}
          >
            {discoveryOpen ? 'Hide discoveries' : 'Discover patterns'}
          </button>
          <button type="button" className="graph__tool" onClick={() => setSearchOpen(true)}>
            Find · ⌘F
          </button>
          <button
            type="button"
            className={`graph__tool${mode === 'path' ? ' graph__tool--accent' : ''}`}
            aria-pressed={mode === 'path'}
            onClick={() => setMode((value) => (value === 'path' ? 'explore' : 'path'))}
          >
            Path
          </button>
          <details className="lifemap__controls">
            <summary>Map controls</summary>
            <div>
              <section aria-label="Map lens">
                <span>Lens</span>
                {['neighborhood', 'hubs', 'career', 'strength', 'edgeKinds'].map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={lens === item ? 'is-active' : undefined}
                    aria-pressed={lens === item}
                    onClick={() => setLens(item as GraphLens)}
                  >
                    {item === 'edgeKinds' ? 'Kinds' : item}
                  </button>
                ))}
              </section>
              <section aria-label="Record filters">
                <span>Records</span>
                {typeGroups
                  .flatMap((group) => group.types)
                  .map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={activeTypes.has(type) ? 'is-active' : undefined}
                      aria-pressed={activeTypes.has(type)}
                      onClick={() =>
                        setActiveTypes((previous) => {
                          const next = new Set(previous);
                          next.has(type) ? next.delete(type) : next.add(type);
                          return next;
                        })
                      }
                    >
                      {type}
                    </button>
                  ))}
              </section>
              {lens === 'edgeKinds' && (
                <section aria-label="Relationship filters">
                  <span>Relationships</span>
                  {edgeTypesInPayload.map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={activeEdgeTypes.has(type) ? 'is-active' : undefined}
                      aria-pressed={activeEdgeTypes.has(type)}
                      onClick={() =>
                        setActiveEdgeTypes((previous) => {
                          const next = new Set(previous);
                          next.has(type) ? next.delete(type) : next.add(type);
                          return next;
                        })
                      }
                    >
                      {type}
                    </button>
                  ))}
                </section>
              )}
            </div>
          </details>
        </div>
      </header>

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
          onPickFrom={(e) => setPathFrom({ id: e.id, title: e.title })}
          onResetFrom={() => setPathFrom(null)}
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
              title="Couldn't draw the map"
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
          nodes={data?.nodes ?? view?.nodes ?? []}
          onClose={() => setSearchOpen(false)}
          onPick={(n) => {
            const visibleNode = view?.nodes.find((node) => node.id === n.id);
            if (visibleNode) selectAndFly(visibleNode);
            else makeFocus(n);
            // In path mode, clicking a node on the canvas set the target but
            // picking the same node from ⌘F did not, so the only route that
            // works without a mouse was the one that could not finish a path.
            if (mode === 'path' && !n.isSelf) setPathTo({ id: n.id, title: n.title });
          }}
        />

        {selected && selected.kind !== 'community' && (
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
                .catch(() => flash("Couldn't reach the clipboard.", { variant: 'error' }));
            }}
          />
        )}

        <GraphDiscoveryPanel
          open={discoveryOpen}
          tab={discoveryTab}
          discovery={discoveryQuery.data}
          loading={discoveryQuery.isLoading}
          failed={discoveryQuery.isError}
          selectedCommunityId={selectedCommunityId}
          selectedBridgeId={selectedBridgeId}
          communityDetail={communityQuery.data}
          connectionDetail={connectionQuery.data}
          onClose={() => {
            setDiscoveryOpen(false);
            updateDiscovery({ community: null, bridge: null, connection: null });
          }}
          onTab={(tab) => updateDiscovery({ discovery: tab, bridge: null, connection: null })}
          onCommunity={(community) => selectCommunity(community.id)}
          onBridge={(id) => {
            const bridge = discoveryQuery.data?.bridges.find((item) => item.id === id);
            if (!bridge) return;
            updateDiscovery({
              discovery: 'bridges',
              bridge: id,
              community: null,
              connection: null,
            });
            const inScene = view?.nodes.find((node) => node.id === bridge.id);
            if (inScene) selectAndFly(inScene);
            else
              navigate(
                `/explore/graph?focus=${encodeURIComponent(id)}&discovery=bridges&bridge=${encodeURIComponent(id)}`,
              );
          }}
          onConnection={(from, to) =>
            updateDiscovery({
              discovery: 'communities',
              community: from,
              connection: `${from}|${to}`,
            })
          }
          onRecord={(id) =>
            navigate(`/explore/graph?focus=${encodeURIComponent(id)}&discovery=${discoveryTab}`)
          }
          onRetry={() => void discoveryQuery.refetch()}
          onLoadMoreMembers={() => setMemberOffset((offset) => offset + 100)}
        />

        {!discoveryOpen && !selected && view && (
          <div className="lifemap__mapguide" aria-label="Map instructions">
            <span className="lifemap__mapguide-kicker">Current view</span>
            <strong>{focusTitle ?? 'Your connected records'}</strong>
            <span>
              {view.nodes.length}
              {data && !selectedCommunityId && view.nodes.length < data.nodes.length
                ? ` of ${data.nodes.length}`
                : ''}{' '}
              nearby records · {view.links.length} relationships
            </span>
            <p>
              Drag to look around. Hover for a name. Select any record to see its relationships.
            </p>
            {data &&
            !selectedCommunityId &&
            view.nodes.length < data.nodes.length &&
            !showAllNeighbors ? (
              <button type="button" onClick={() => setShowAllNeighbors(true)}>
                Show all nearby records
              </button>
            ) : (
              <button type="button" onClick={() => setDiscoveryOpen(true)}>
                See workspace patterns
              </button>
            )}
          </div>
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
            className="graph__tool graph__tool--zoom"
            onClick={() => zoomMap(-0.35)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button type="button" className="graph__tool" onClick={resetMapView}>
            Center map
          </button>
          <button
            type="button"
            className="graph__tool graph__tool--zoom"
            onClick={() => zoomMap(0.35)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="graph__tool"
            onClick={() => setListOpen((o) => !o)}
            aria-pressed={listOpen}
          >
            {listOpen ? 'Hide list' : 'List'}
          </button>
          <details className="lifemap__canvascontrols">
            <summary>More</summary>
            <div>
              <button
                type="button"
                disabled={depth >= 4}
                onClick={() => setDepth((d) => Math.min(d + 1, 4))}
              >
                Show one more step
              </button>
              <button
                type="button"
                disabled={depth <= 1}
                onClick={() => setDepth((d) => Math.max(d - 1, 1))}
              >
                Show fewer records
              </button>
              {data &&
                view &&
                !selectedCommunityId &&
                view.nodes.length < data.nodes.length &&
                !showAllNeighbors && (
                  <button type="button" onClick={() => setShowAllNeighbors(true)}>
                    Show all nearby records
                  </button>
                )}
              <button type="button" onClick={focusSelection} disabled={!selected}>
                Focus selection
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaused((p) => {
                    const next = !p;
                    if (next) fgRef.current?.pauseAnimation();
                    else fgRef.current?.resumeAnimation();
                    return next;
                  });
                }}
                aria-pressed={paused}
              >
                {paused ? 'Resume layout' : 'Pause layout'}
              </button>
              <button type="button" onClick={exportPng}>
                Export PNG
              </button>
              <button type="button" onClick={() => setSearchOpen(true)}>
                Find a record
              </button>
              {focusParam && <Link to="/explore/graph">Reset focus</Link>}
            </div>
          </details>
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
