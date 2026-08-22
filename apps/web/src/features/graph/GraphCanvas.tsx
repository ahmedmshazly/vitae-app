import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { colorForType, withAlpha, type GraphPalette } from '../../lib/graph-palette.js';
import { CAREER_SPINE_TYPES } from './constants.js';
import type { GraphDisplayPrefs } from './displayPrefs.js';
import type { FgLink, FgNode, GraphLens, GraphMode } from './types.js';
import { linkEndId } from './types.js';

export interface GraphCanvasProps {
  width: number;
  height: number;
  nodes: FgNode[];
  links: FgLink[];
  neighbors: Map<string, Set<string>>;
  palette: GraphPalette;
  lens: GraphLens;
  mode: GraphMode;
  hoverId: string | null;
  selectedId: string | null;
  pathNodeIds: Set<string>;
  pathEdgeKeys: Set<string>;
  paused: boolean;
  reducedMotion: boolean;
  prefs: GraphDisplayPrefs;
  onHover: (id: string | null) => void;
  onSelect: (node: FgNode) => void;
  onOpen: (node: FgNode) => void;
  onBackground: () => void;
  fgRef: MutableRefObject<ForceGraphMethods<FgNode, FgLink> | undefined>;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}



export function GraphCanvas({
  width,
  height,
  nodes,
  links,
  neighbors,
  palette,
  lens,
  mode,
  hoverId,
  selectedId,
  pathNodeIds,
  pathEdgeKeys,
  paused,
  reducedMotion,
  prefs,
  onHover,
  onSelect,
  onOpen,
  onBackground,
  fgRef,
}: GraphCanvasProps) {
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);
  const hubIds = useMemo(() => {
    if (lens !== 'hubs') return new Set<string>();
    return new Set(
      [...nodes]
        .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
        .slice(0, 8)
        .map((n) => n.id),
    );
  }, [lens, nodes]);

  const hoverNeighbors = hoverId ? (neighbors.get(hoverId) ?? new Set<string>()) : null;
  const pathMode = mode === 'path' && pathNodeIds.size > 0;
  // Neighborhood dim only when enabled and the hovered node has ≥1 visible neighbor.
  const hoverOverlay =
    prefs.dimOnHover &&
    !pathMode &&
    Boolean(hoverId && hoverNeighbors && hoverNeighbors.size > 0);

  // Charge: stronger for hubs; cooler when path-highlighting.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const strength = pathMode ? -40 : lens === 'hubs' ? -110 : -70;
    fg.d3Force('charge')?.strength(strength);
  }, [fgRef, lens, pathMode]);

  // Fit after data settles.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || nodes.length === 0) return;
    const ms = reducedMotion ? 0 : 400;
    const delay = reducedMotion ? 50 : 700;
    const t = setTimeout(() => fg.zoomToFit(ms, 60), delay);
    return () => clearTimeout(t);
  }, [fgRef, nodes, reducedMotion]);

  // Freeze physics briefly after path highlight.
  const [pathFreeze, setPathFreeze] = useState(false);
  useEffect(() => {
    if (!pathMode) {
      setPathFreeze(false);
      return;
    }
    setPathFreeze(true);
    const t = setTimeout(() => setPathFreeze(false), reducedMotion ? 0 : 900);
    return () => clearTimeout(t);
  }, [pathMode, pathNodeIds, reducedMotion]);

  function nodeRadius(n: FgNode): number {
    const base = n.isSelf ? 9 : 4.5 + Math.min(n.degree, 10) * 0.55;
    if (lens === 'hubs') return base * (1 + Math.min(n.degree, 20) * 0.04);
    return base;
  }

  function nodeDimmed(n: FgNode): boolean {
    if (pathMode && prefs.dimOffPath) return !pathNodeIds.has(n.id);
    if (hoverOverlay && hoverId && hoverNeighbors) {
      return n.id !== hoverId && !hoverNeighbors.has(n.id);
    }
    if (lens === 'career') return !CAREER_SPINE_TYPES.has(n.type) && !n.isSelf;
    return false;
  }

  function hopAlpha(n: FgNode): number {
    if (pathMode && prefs.dimOffPath) return pathNodeIds.has(n.id) ? 1 : 0.12;
    if (!prefs.fadeByHop) return 1;
    if (n.isSelf || n.hop === 0) return 1;
    return Math.max(0.35, 1 - n.hop * 0.18);
  }

  function shouldShowLabel(n: FgNode, globalScale: number, onPath: boolean): boolean {
    if (prefs.labels === 'always') return true;
    if (prefs.labels === 'selection') {
      return (
        n.id === hoverId || n.id === selectedId || n.isSelf || onPath
      );
    }
    // auto
    return (
      globalScale > 1.6 ||
      n.id === hoverId ||
      n.id === selectedId ||
      n.isSelf ||
      onPath ||
      (lens === 'hubs' && hubIds.has(n.id)) ||
      n.degree >= 6
    );
  }

  function drawNode(n: FgNode, ctx: CanvasRenderingContext2D, globalScale: number) {
    const r = nodeRadius(n);
    const dimmed = nodeDimmed(n);
    const color = colorForType(palette, n.type);
    const onPath = pathNodeIds.has(n.id);
    ctx.globalAlpha = dimmed ? 0.12 : hopAlpha(n);

    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
    ctx.fillStyle = n.isSelf ? palette.accent : color;
    ctx.fill();
    ctx.lineWidth = 1 / globalScale;
    ctx.strokeStyle =
      n.isSelf || n.id === selectedId || onPath ? palette.accentSoft : palette.border;
    ctx.stroke();

    if (n.id === selectedId) {
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r + 2.5 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = palette.accentSoft;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }
    if (onPath && mode === 'path') {
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r + 4.5 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();
    }

    if (shouldShowLabel(n, globalScale, onPath) && !dimmed) {
      const label = n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title;
      // Names are the one thing here drawn outside the zoom transform. Under it
      // the type size has to shrink as you zoom in to stay 11px on screen, and
      // somewhere below 5px this typeface's glyph advances round to whole units,
      // which the transform then magnifies into gaps inside words: the map read
      // "K uber net es" and "Nile R obot ics". Placing the name in screen space
      // asks for a real 11px, so the spacing is the one the font intended.
      const t = ctx.getTransform();
      const unit = t.a; // one graph unit, in device pixels
      const dpr = globalScale > 0 ? unit / globalScale : 1; // device px per CSS px
      const x = t.a * n.x! + t.c * n.y! + t.e;
      const top = t.b * n.x! + t.d * n.y! + t.f + r * unit + 1.5 * dpr;
      const fontSize = 11 * dpr;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${fontSize}px ${palette.fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const w = ctx.measureText(label).width;
      // The plate is the page's own ground at 78%, not a warm near-black
      // literal that predates the neutral canvas.
      ctx.fillStyle = withAlpha(palette.plate, 0.78);
      ctx.fillRect(x - w / 2 - 2 * dpr, top, w + 4 * dpr, fontSize + 2.5 * dpr);
      ctx.fillStyle =
        n.id === hoverId || n.id === selectedId || onPath ? palette.fg : palette.muted;
      ctx.fillText(label, x, top + 1.3 * dpr);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function linkIsPath(l: FgLink): boolean {
    return pathEdgeKeys.has(edgeKey(linkEndId(l.source), linkEndId(l.target)));
  }

  function linkTouchesHover(l: FgLink): boolean {
    if (!hoverId) return false;
    const s = linkEndId(l.source);
    const t = linkEndId(l.target);
    return s === hoverId || t === hoverId;
  }

  const lastClickRef = useRef<{ id: string; at: number } | null>(null);

  return (
    <ForceGraph2D<FgNode, FgLink>
      ref={fgRef}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor="rgba(0,0,0,0)"
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={(n, color, ctx) => {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, nodeRadius(n) + 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkColor={(l) => {
        if (pathMode) {
          if (linkIsPath(l)) return palette.accent;
          return prefs.dimOffPath ? withAlpha(palette.dim, 0.35) : palette.border;
        }
        if (hoverOverlay) {
          if (linkTouchesHover(l)) {
            return prefs.accentHoverLinks ? palette.accent : palette.borderStrong;
          }
          return withAlpha(palette.dim, 0.45);
        }
        if (prefs.accentHoverLinks && hoverId && linkTouchesHover(l)) return palette.accent;
        if (lens === 'strength') {
          const str = typeof l.strength === 'number' ? l.strength : 0.25;
          if (str < 0.35) return withAlpha(palette.dim, 0.4);
          return palette.borderStrong;
        }
        return palette.border;
      }}
      linkWidth={(l) => {
        if (pathMode && linkIsPath(l)) return 2.4;
        if (prefs.accentHoverLinks && !pathMode && hoverId && linkTouchesHover(l)) return 1.6;
        if (lens === 'strength') {
          const str = typeof l.strength === 'number' ? l.strength : 0.2;
          return 0.6 + str * 2.2;
        }
        return 1;
      }}
      onNodeHover={(n) => onHover(n ? n.id : null)}
      onNodeClick={(n) => {
        const now = Date.now();
        const prev = lastClickRef.current;
        if (prev && prev.id === n.id && now - prev.at < 350) {
          lastClickRef.current = null;
          onOpen(n);
          return;
        }
        lastClickRef.current = { id: n.id, at: now };
        onSelect(n);
      }}
      onBackgroundClick={onBackground}
      cooldownTicks={paused || pathFreeze ? 0 : pathMode ? 40 : 120}
      enableNodeDrag
    />
  );
}

export function flyToNode(
  fg: ForceGraphMethods<FgNode, FgLink> | undefined,
  node: FgNode,
  reducedMotion: boolean,
): void {
  if (!fg || node.x == null || node.y == null) return;
  const ms = reducedMotion ? 0 : 450;
  fg.centerAt(node.x, node.y, ms);
  fg.zoom(Math.max(fg.zoom(), 2.2), ms);
}
