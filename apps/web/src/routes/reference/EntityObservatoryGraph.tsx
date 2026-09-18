import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CanvasEvent,
  Graph,
  NodeEvent,
  type GraphData,
  type IElementEvent,
} from '@antv/g6';
import {
  OBSERVATORY_GROUP_COLORS,
  OBSERVATORY_GROUP_SLOTS,
  type ObservatoryScene,
  type ObservatorySceneNode,
  type ObservatoryWorkspaceState,
} from './entityObservatoryModel.js';
import { Button, ErrorState, StatusTrace, useTheme } from '@vitae/ui';
import { readGraphPalette, withAlpha, type GraphPalette } from '../../lib/graph-palette.js';

export interface EntityObservatoryGraphHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focus: (ids: string[]) => void;
}

interface EntityObservatoryGraphProps {
  scene: ObservatoryScene;
  state: ObservatoryWorkspaceState;
  onSelect: (id: string, compare: boolean) => void;
  onHover: (id: string | null) => void;
  onPin: (id: string, x: number, y: number) => void;
  onClear: () => void;
  /** The Matrix lens reads the same scene without a canvas, so it is the
   * offer to make when this one cannot draw. */
  onRequestMatrix: () => void;
}

interface GraphRuntime {
  graph: Graph;
  disposed: boolean;
  ready: boolean;
  renderChain: Promise<void>;
}

function groupFill(palette: GraphPalette, group: string | undefined): string {
  if (!group) return palette.muted;
  const slot = OBSERVATORY_GROUP_SLOTS[group as keyof typeof OBSERVATORY_GROUP_SLOTS];
  if (slot) return palette.slots[slot - 1] ?? palette.muted;
  return (
    OBSERVATORY_GROUP_COLORS[group as keyof typeof OBSERVATORY_GROUP_COLORS] ?? palette.muted
  );
}

/**
 * A second channel for schema group, because five hues on their own are not a
 * signal anyone with a colour-vision deficiency can read, and the Focus lens
 * draws no group hulls to label the clusters. Selected, compared and pinned
 * nodes keep their own dash: those three already carry a 3px accent stroke,
 * so the group texture is the one that gives way.
 */
const GROUP_DASH: Record<string, number[] | undefined> = {
  Career: undefined,
  Content: [6, 3],
  'Job search': [2, 3],
  Life: [9, 3, 2, 3],
  'Long tail': [1, 3],
};

function nodeColor(palette: GraphPalette, node: ObservatorySceneNode): string {
  if (node.kind === 'relation') return palette.accentSoft;
  if (node.kind === 'any') return palette.accent;
  return groupFill(palette, node.group);
}

function graphData(
  scene: ObservatoryScene,
  state: ObservatoryWorkspaceState,
  palette: GraphPalette,
): GraphData {
  const compareStroke = palette.slots[6] ?? palette.accentSoft;
  return {
    nodes: scene.nodes.map((node) => {
      const color = nodeColor(palette, node);
      const isGroup = node.kind === 'group';
      const isRelation = node.kind === 'relation';
      const isAny = node.kind === 'any';
      const size: number | [number, number] = isGroup
        ? [118, 52]
        : isRelation
          ? 26
          : isAny
            ? 34
            : [76, 28];
      return {
        id: node.id,
        type: isRelation ? 'diamond' : isGroup ? 'rect' : isAny ? 'hexagon' : 'rect',
        data: {
          selectionId: node.selectionId,
          kind: node.kind,
          label: node.label,
          active: node.active,
        },
        style: {
          x: node.x,
          y: node.y,
          size,
          radius: isGroup ? 18 : 8,
          fill: isGroup ? withAlpha(color, 0.32) : color,
          fillOpacity: isGroup ? 0.32 : node.active || node.selected || node.compared ? 0.95 : 0.72,
          stroke: node.selected ? palette.accent : node.compared ? compareStroke : color,
          strokeOpacity: isGroup ? 0.55 : 0.9,
          lineWidth: node.selected || node.compared ? 3 : isGroup ? 1.2 : 1.5,
          lineDash: node.compared
            ? [5, 4]
            : node.pinned
              ? [4, 3]
              : isGroup || isRelation || isAny
                ? undefined
                : GROUP_DASH[node.group ?? ''],
          cursor: node.selectionId ? 'pointer' : 'default',
          label: node.showLabel,
          labelText: node.showLabel ? node.label : '',
          labelPlacement: isGroup ? 'center' : 'bottom',
          labelOffsetY: isGroup ? 0 : 5,
          labelFill: node.selected ? palette.accent : isGroup ? color : palette.fg,
          labelFontFamily: palette.fontMono,
          labelFontSize: isGroup ? 13 : isRelation ? 9 : 10.5,
          labelFontWeight: isGroup || node.selected ? 600 : 500,
          labelBackground: !isGroup && node.showLabel,
          labelBackgroundFill: palette.bg,
          labelBackgroundFillOpacity: 0.88,
          labelPadding: [2, 4],
          // Quiet: selection is stroke weight + dash, never a glow halo.
          halo: false,
          zIndex: node.selected || node.compared ? 20 : isGroup ? 0 : 5,
        },
      };
    }),
    edges: scene.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.bundled ? 'cubic-radial' : 'cubic',
      data: {
        relationId: edge.relationId,
        role: edge.role,
        count: edge.count,
      },
      style: {
        stroke: edge.active
          ? palette.accentSoft
          : edge.role === 'source'
            ? palette.dim
            : palette.muted,
        strokeOpacity: edge.active
          ? Math.min(1, state.display.routeOpacity + 0.18)
          : state.display.routeOpacity * (edge.bundled ? 0.54 : 0.35),
        lineWidth:
          state.display.routeThickness *
          (edge.active ? 2.2 : edge.bundled ? 1.1 + Math.log2(edge.count + 1) : 0.85),
        endArrow: true,
        endArrowType: 'simple',
        endArrowSize: edge.active ? 8 : 5,
        endArrowFill: edge.active ? palette.accent : palette.faint,
        label: edge.bundled && edge.count > 1,
        labelText: edge.bundled && edge.count > 1 ? String(edge.count) : '',
        labelFill: palette.fg,
        labelFontFamily: palette.fontMono,
        labelFontSize: 9,
        labelBackground: true,
        labelBackgroundFill: palette.bg,
        labelPadding: [2, 4],
        zIndex: edge.active ? 12 : 1,
      },
    })),
  };
}

export const EntityObservatoryGraph = forwardRef<
  EntityObservatoryGraphHandle,
  EntityObservatoryGraphProps
>(function EntityObservatoryGraph(
  { scene, state, onSelect, onHover, onPin, onClear, onRequestMatrix },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const runtimeRef = useRef<GraphRuntime | null>(null);
  const callbacksRef = useRef({ onSelect, onHover, onPin, onClear });
  callbacksRef.current = { onSelect, onHover, onPin, onClear };
  const { resolvedTheme } = useTheme();
  const palette = useMemo(() => readGraphPalette(), [resolvedTheme]);
  const data = useMemo(() => graphData(scene, state, palette), [scene, state, palette]);
  // Creation is deferred by a microtask and both render() and fitView() are
  // async, so between mount and the first paint the container is an empty
  // black box. The parent's Suspense covers the dynamic import, not the draw,
  // and every plugin toggle tears the canvas down again long after Suspense
  // has resolved.
  const [ready, setReady] = useState(false);
  const [renderError, setRenderError] = useState<Error | null>(null);
  // Bumping this recreates the graph from scratch, which is what Retry means
  // once a canvas has failed.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    setReady(false);

    // Deferring creation by one microtask prevents React StrictMode's development-only
    // setup/cleanup probe from starting a canvas render that it immediately destroys.
    void Promise.resolve().then(() => {
      if (cancelled || !container.isConnected) return;
      const graph = new Graph({
        container,
        data,
        autoResize: true,
        autoFit: 'view',
        zoomRange: [0.22, 3.5],
        background: palette.bg,
        animation: state.display.motion
          ? { duration: Math.round(520 / Math.max(state.display.pulseSpeed, 0.25)) }
          : false,
        behaviors: [
          'drag-canvas',
          'zoom-canvas',
          {
            type: 'drag-element',
            key: 'drag-element',
            hideEdge: 'both',
            enable: (event: { target?: { id?: string } }) =>
              !String(event.target?.id ?? '').startsWith('group:'),
            onFinish: (ids: string[]) => {
              for (const id of ids) {
                const node = graph.getNodeData(id);
                const x = Number(node.style?.x);
                const y = Number(node.style?.y);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                  callbacksRef.current.onPin(id, x, y);
                }
              }
            },
          },
          {
            type: 'lasso-select',
            key: 'lasso-select',
            trigger: ['Shift'],
            state: 'selected',
          },
          {
            type: 'auto-adapt-label',
            key: 'auto-adapt-label',
            enable: state.display.labelDensity !== 'full',
            padding: 6,
          },
        ],
        plugins: [
          ...(state.display.minimap
            ? [
                {
                  type: 'minimap',
                  key: 'observatory-minimap',
                  size: [150, 96] as [number, number],
                  position: 'right-bottom',
                  className: 'ec-observatory-minimap',
                  delay: 80,
                },
              ]
            : []),
          ...(state.display.fisheye
            ? [
                {
                  type: 'fisheye',
                  key: 'observatory-fisheye',
                  trigger: 'pointermove',
                  r: 130,
                  d: 1.9,
                  showDPercent: false,
                  style: { stroke: palette.borderStrong, strokeOpacity: 0.7 },
                },
              ]
            : []),
          ...(state.display.edgeMode === 'all'
            ? [
                {
                  type: 'edge-bundling',
                  key: 'observatory-edge-bundling',
                  bundleThreshold: 0.7,
                  cycles: 3,
                  iterations: 45,
                },
              ]
            : []),
        ],
      });
      const runtime: GraphRuntime = {
        graph,
        disposed: false,
        ready: false,
        renderChain: Promise.resolve(),
      };
      runtimeRef.current = runtime;
      graphRef.current = graph;

      graph.on(NodeEvent.CLICK, (event: IElementEvent) => {
        const datum = graph.getNodeData(event.target.id);
        const selectionId = datum.data?.selectionId;
        if (typeof selectionId === 'string') {
          const compare = Boolean(event.shiftKey);
          callbacksRef.current.onSelect(selectionId, compare);
        }
      });
      graph.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => {
        const datum = graph.getNodeData(event.target.id);
        const selectionId = datum.data?.selectionId;
        callbacksRef.current.onHover(typeof selectionId === 'string' ? selectionId : null);
      });
      graph.on(NodeEvent.POINTER_LEAVE, () => callbacksRef.current.onHover(null));
      graph.on(CanvasEvent.CLICK, () => callbacksRef.current.onClear());

      runtime.renderChain = graph
        .render()
        .then(async () => {
          if (runtime.disposed) return;
          runtime.ready = true;
          await graph.fitView({ when: 'overflow', direction: 'both' }, false);
          setReady(true);
        })
        // Re-throwing here left a rejected promise on runtime.renderChain that
        // only the cleanup's `finally` ever touched, which re-raised it as an
        // unhandled rejection. No boundary above this route could have caught
        // it either, so a dead renderer showed as a black rectangle forever.
        .catch((error: unknown) => {
          if (runtime.disposed) return;
          setRenderError(error instanceof Error ? error : new Error(String(error)));
        });
    });

    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.disposed = true;
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      if (graphRef.current === runtime.graph) graphRef.current = null;
      void runtime.renderChain.finally(() => runtime.graph.destroy());
    };
    // The graph instance owns its plugins and event handlers. Recreate only when plugin shape changes.
  }, [
    attempt,
    state.display.edgeMode,
    state.display.fisheye,
    state.display.labelDensity,
    state.display.minimap,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.ready || runtime.disposed) return;
    runtime.renderChain = runtime.renderChain.then(async () => {
      if (runtime.disposed) return;
      runtime.graph.setData(data);
      runtime.graph.setOptions({
        animation: state.display.motion
          ? { duration: Math.round(520 / Math.max(state.display.pulseSpeed, 0.25)) }
          : false,
      });
      await runtime.graph.render();
    })
    // Without this the chain stayed rejected: every later control change
    // short-circuited, so the canvas silently froze on a scene that no longer
    // matched the filters the cockpit said were applied. Resolving the chain
    // and starting a clean one keeps the next change recoverable.
    .catch((error: unknown) => {
      if (runtime.disposed) return;
      runtime.renderChain = Promise.resolve();
      setRenderError(error instanceof Error ? error : new Error(String(error)));
    });
  }, [data, state.display.motion, state.display.pulseSpeed]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      fit: () => {
        void graphRef.current?.fitView({ when: 'always', direction: 'both' }, { duration: 420 });
      },
      zoomIn: () => {
        void graphRef.current?.zoomBy(1.22, { duration: 220 });
      },
      zoomOut: () => {
        void graphRef.current?.zoomBy(0.82, { duration: 220 });
      },
      focus: (ids: string[]) => {
        if (ids.length > 0) void graphRef.current?.focusElement(ids, { duration: 420 });
      },
    }),
    [],
  );

  if (renderError) {
    return (
      <div className="ec-observatory-loading">
        <ErrorState
          title="The observatory canvas could not draw"
          detail={renderError.message}
          onRetry={() => {
            setRenderError(null);
            setAttempt((n) => n + 1);
          }}
          action={
            <Button size="sm" onClick={onRequestMatrix}>
              Read it as a matrix
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="ec-observatory-graph"
        role="application"
        aria-busy={!ready}
        aria-label="Interactive schema observatory. Select an item, drag to pin it, or hold Shift and drag to lasso."
        data-route-count={scene.routeCount}
      />
      {ready ? null : (
        <div className="ec-observatory-loading ec-observatory-loading--overlay">
          <StatusTrace
            tone="live"
            label="Drawing the schema"
            detail={`${scene.nodes.length} nodes`}
          />
        </div>
      )}
    </>
  );
});
