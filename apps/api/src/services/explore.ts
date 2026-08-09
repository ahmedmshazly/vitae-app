/**
 * Exploration views over the life graph (SRS P: graph / timeline / map).
 * Pure read-model assembly: BFS neighborhoods for the graph explorer,
 * date-bearing nodes bucketed into lanes for the timeline, and city
 * aggregation (props.city + LOCATED_IN/VISITED edges) for the map.
 */
import type { NodeRecord } from '@vitae/core';
import { isSubjectBearing } from '@vitae/core';
import { loadGraph, type Graph } from './crm.js';
import { getSelf } from './self.js';
import { buildOwnerIndex, ownableFrom, ownedIdsFor } from './subjects.js';
import { getPlaceRegistry, resolvePlaceLabel, type PlaceRegistry } from './places.js';

const ELEMENT_CAP = 1500;

export interface GraphViewNode {
  id: string;
  type: string;
  title: string;
  isSelf: boolean;
  degree: number;
  hop: number;
}

export interface GraphViewEdge {
  src: string;
  dst: string;
  type: string;
  /** Present on KNOWS when persisted strength is available. */
  strength?: number;
  /** KNOWS.relation when set. */
  relation?: string;
  /** ORG_RELATED.kind when set. */
  kind?: string;
}

export interface GraphViewResult {
  focus: string | null;
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  truncated: boolean;
}

function adjacency(graph: Graph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    (adj.get(e.src) ?? adj.set(e.src, new Set()).get(e.src)!).add(e.dst);
    (adj.get(e.dst) ?? adj.set(e.dst, new Set()).get(e.dst)!).add(e.src);
  }
  return adj;
}

/** BFS neighborhood around `focus` (default: self), capped at 1.5k elements. */
export async function graphView(options: {
  focus?: string;
  depth?: number;
  types?: string[];
} = {}): Promise<GraphViewResult> {
  const graph = await loadGraph();
  const self = await getSelf();
  const focusId = options.focus && graph.nodes.has(options.focus) ? options.focus : self?.id ?? null;
  const depth = Math.min(Math.max(options.depth ?? 2, 1), 4);
  const typeFilter = options.types?.length ? new Set(options.types) : null;

  if (!focusId) return { focus: null, nodes: [], edges: [], truncated: false };

  const adj = adjacency(graph);
  const hop = new Map<string, number>([[focusId, 0]]);
  const queue = [focusId];
  let truncated = false;

  while (queue.length > 0) {
    const id = queue.shift()!;
    const h = hop.get(id)!;
    if (h >= depth) continue;
    for (const next of adj.get(id) ?? []) {
      if (hop.has(next)) continue;
      const node = graph.nodes.get(next);
      if (!node) continue;
      // The focus is always kept; other nodes must pass the type filter.
      if (typeFilter && !typeFilter.has(node.type)) continue;
      if (hop.size >= ELEMENT_CAP / 2) {
        truncated = true;
        break;
      }
      hop.set(next, h + 1);
      queue.push(next);
    }
    if (truncated) break;
  }

  const included = new Set(hop.keys());
  const edges: GraphViewEdge[] = [];
  for (const e of graph.edges) {
    if (!included.has(e.src) || !included.has(e.dst)) continue;
    if (edges.length + included.size >= ELEMENT_CAP) {
      truncated = true;
      break;
    }
    const props = (e.props ?? {}) as Record<string, unknown>;
    edges.push({
      src: e.src,
      dst: e.dst,
      type: e.type,
      ...(e.type === 'KNOWS' && typeof props.strength === 'number' ? { strength: props.strength as number } : {}),
      ...(e.type === 'KNOWS' && typeof props.relation === 'string' ? { relation: props.relation } : {}),
      ...(e.type === 'ORG_RELATED' && typeof props.kind === 'string' ? { kind: props.kind } : {}),
    });
  }

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }

  const nodes: GraphViewNode[] = [...included].map((id) => {
    const n = graph.nodes.get(id)!;
    return {
      id,
      type: n.type,
      title: n.title,
      isSelf: id === self?.id,
      degree: degree.get(id) ?? 0,
      hop: hop.get(id) ?? 0,
    };
  });

  return { focus: focusId, nodes, edges, truncated };
}

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
  current: boolean;
  /** span = lasting bar; moment = point diamond on the rail. */
  kind: 'span' | 'moment';
}

export interface TimelineLane {
  name: string;
  items: TimelineItem[];
}

const LANES: Array<{ name: string; types: string[] }> = [
  { name: 'Roles', types: ['role'] },
  { name: 'Projects', types: ['project'] },
  { name: 'Education', types: ['education', 'certification', 'course'] },
  { name: 'Events', types: ['event', 'talk', 'publication', 'award'] },
  { name: 'Trips', types: ['trip'] },
];

const MOMENT_TYPES = new Set(['talk', 'publication', 'award', 'certification']);

function itemKind(
  type: string,
  start: string,
  end: string | null,
  current: boolean,
): 'span' | 'moment' {
  if (MOMENT_TYPES.has(type)) return 'moment';
  if (!end && !current) return 'moment';
  if (end) {
    const days = (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60 * 24);
    if (Number.isFinite(days) && days <= 14) return 'moment';
  }
  return 'span';
}

function nodeStart(n: NodeRecord): string | null {
  if (n.start_date) return n.start_date;
  const props = n.props as Record<string, unknown>;
  const p = (props.start as string) ?? (props.date as string) ?? (props.occurred_at as string);
  return typeof p === 'string' && p.length >= 4 ? p.slice(0, 10) : null;
}

function nodeEnd(n: NodeRecord): string | null {
  if (n.end_date) return n.end_date;
  const props = n.props as Record<string, unknown>;
  const p = props.end as string;
  return typeof p === 'string' && p.length >= 4 ? p.slice(0, 10) : null;
}

function overlapsRange(
  start: string,
  end: string | null,
  current: boolean,
  from: string,
  to: string,
): boolean {
  const s = start.slice(0, 10);
  const e = (end ?? (current ? to : start)).slice(0, 10);
  return s <= to && e >= from;
}

/** Date-bearing nodes bucketed into reference lanes, plus the year span. */
export async function timelineView(): Promise<{ years: number[]; lanes: TimelineLane[] }> {
  const graph = await loadGraph();
  const self = await getSelf();
  const lanes: TimelineLane[] = LANES.map((l) => ({ name: l.name, items: [] }));
  let minYear = Infinity;
  let maxYear = -Infinity;

  // Ownership via the canonical index so every subject-bearing type is scoped
  // (certs, courses, awards, publications), not only role/education/project.
  const ownerIndex = buildOwnerIndex(ownableFrom(graph));
  const mine = self ? ownedIdsFor(self.id, ownerIndex) : new Set<string>();

  for (const node of graph.nodes.values()) {
    const lane = LANES.findIndex((l) => l.types.includes(node.type));
    if (lane === -1) continue;
    // Any record that declares an owner must be mine to appear here.
    if (self && isSubjectBearing(node.type) && !mine.has(node.id)) continue;
    const start = nodeStart(node);
    if (!start) continue;
    const end = nodeEnd(node);
    const current = !end && (node.status === 'active' || node.type === 'role');
    minYear = Math.min(minYear, Number(start.slice(0, 4)));
    maxYear = Math.max(maxYear, Number((end ?? start).slice(0, 4)));
    lanes[lane]!.items.push({
      id: node.id,
      type: node.type,
      title: node.title,
      subtitle: node.subtitle ?? null,
      start,
      end,
      current,
      kind: itemKind(node.type, start, end, current),
    });
  }

  if (!Number.isFinite(minYear)) {
    const y = new Date().getFullYear();
    minYear = y - 1;
    maxYear = y;
  }
  maxYear = Math.max(maxYear, new Date().getFullYear());

  for (const lane of lanes) lane.items.sort((a, b) => a.start.localeCompare(b.start));
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);
  return { years, lanes: lanes.filter((l) => l.items.length > 0) };
}

export interface TimelineReviewItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
}

export interface TimelineReviewSection {
  key: string;
  title: string;
  count: number;
  items: TimelineReviewItem[];
}

export interface TimelineReviewResult {
  from: string;
  to: string;
  label: string;
  summary: Record<string, number>;
  sections: TimelineReviewSection[];
}

function reviewLabel(from: string, to: string): string {
  const fy = from.slice(0, 4);
  const ty = to.slice(0, 4);
  const fm = Number(from.slice(5, 7));
  const tm = Number(to.slice(5, 7));
  if (from === to) return from;
  if (fy === ty && fm === 1 && tm === 3 && to.endsWith('-31')) return `Q1 ${fy}`;
  if (fy === ty && fm === 4 && tm === 6 && (to.endsWith('-30') || to.endsWith('-31'))) return `Q2 ${fy}`;
  if (fy === ty && fm === 7 && tm === 9 && (to.endsWith('-30') || to.endsWith('-31'))) return `Q3 ${fy}`;
  if (fy === ty && fm === 10 && tm === 12 && to.endsWith('-31')) return `Q4 ${fy}`;
  if (fy === ty && from.endsWith('-01-01') && to.endsWith('-12-31')) return fy;
  return `${from} → ${to}`;
}

/** Digest for a brushed period (deterministic, no AI). */
export async function timelineReview(options: {
  from: string;
  to: string;
}): Promise<TimelineReviewResult> {
  const from = options.from.slice(0, 10);
  const to = options.to.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { from, to, label: reviewLabel(from, to), summary: {}, sections: [] };
  }

  const graph = await loadGraph();
  const self = await getSelf();
  // Ownership via the canonical index so every subject-bearing type is scoped
  // (certs, courses, awards, publications), not only role/education/project.
  const ownerIndex = buildOwnerIndex(ownableFrom(graph));
  const mine = self ? ownedIdsFor(self.id, ownerIndex) : new Set<string>();

  const byKey = new Map<string, TimelineReviewItem[]>();
  const push = (key: string, item: TimelineReviewItem) => {
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(item);
  };

  for (const node of graph.nodes.values()) {
    const lane = LANES.find((l) => l.types.includes(node.type));
    if (!lane) continue;
    // Any record that declares an owner must be mine to appear here.
    if (self && isSubjectBearing(node.type) && !mine.has(node.id)) continue;
    const start = nodeStart(node);
    if (!start) continue;
    const end = nodeEnd(node);
    const current = !end && (node.status === 'active' || node.type === 'role');
    if (!overlapsRange(start, end, current, from, to)) continue;
    const key =
      lane.name === 'Roles'
        ? 'roles'
        : lane.name === 'Projects'
          ? 'projects'
          : lane.name === 'Education'
            ? 'education'
            : lane.name === 'Events'
              ? 'events'
              : 'trips';
    push(key, {
      id: node.id,
      type: node.type,
      title: node.title,
      subtitle: node.subtitle ?? null,
      start,
      end,
    });
  }

  const interactionItems: TimelineReviewItem[] = [];
  const peopleTouched = new Map<string, TimelineReviewItem>();
  for (const node of graph.nodes.values()) {
    if (node.type !== 'interaction') continue;
    const start = nodeStart(node);
    if (!start || start < from || start > to) continue;
    interactionItems.push({
      id: node.id,
      type: node.type,
      title: node.title,
      subtitle: node.subtitle ?? null,
      start,
      end: null,
    });
    for (const e of graph.bySrc.get(node.id) ?? []) {
      if (e.type !== 'WITH') continue;
      const person = graph.nodes.get(e.dst);
      if (!person || person.type !== 'person') continue;
      if (!peopleTouched.has(person.id)) {
        peopleTouched.set(person.id, {
          id: person.id,
          type: person.type,
          title: person.title,
          subtitle: person.subtitle ?? null,
          start,
          end: null,
        });
      }
    }
  }

  const sectionMeta: Array<{ key: string; title: string }> = [
    { key: 'roles', title: 'Roles active' },
    { key: 'projects', title: 'Projects' },
    { key: 'education', title: 'Education & credentials' },
    { key: 'events', title: 'Events & talks' },
    { key: 'trips', title: 'Trips' },
    { key: 'people', title: 'People met' },
    { key: 'interactions', title: 'Interactions' },
  ];

  byKey.set('people', [...peopleTouched.values()].sort((a, b) => a.title.localeCompare(b.title)));
  byKey.set(
    'interactions',
    interactionItems.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)),
  );

  const sections: TimelineReviewSection[] = [];
  const summary: Record<string, number> = {};
  for (const meta of sectionMeta) {
    const items = (byKey.get(meta.key) ?? []).sort(
      (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
    );
    summary[meta.key] = items.length;
    if (items.length === 0) continue;
    sections.push({
      key: meta.key,
      title: meta.title,
      count: items.length,
      items: items.slice(0, 40),
    });
  }

  return { from, to, label: reviewLabel(from, to), summary, sections };
}

export interface MapRecord {
  id: string;
  type: string;
  title: string;
  date?: string;
  link: 'city' | 'LOCATED_IN' | 'VISITED';
}

export interface MapCity {
  city: string;
  count: number;
  types: Record<string, number>;
  records: MapRecord[];
  /** From location node props when available. */
  lat?: number;
  lng?: number;
}

export interface MapTripStop {
  city: string;
  nights?: number;
  date?: string;
  lat?: number;
  lng?: number;
}

export interface MapTrip {
  id: string;
  title: string;
  stops: MapTripStop[];
  companionIds: string[];
  start?: string;
  end?: string;
}

export interface MapViewResult {
  cities: MapCity[];
  trips: MapTrip[];
}

function cityOf(n: NodeRecord): string | null {
  const props = n.props as Record<string, unknown>;
  const c = props.city;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (n.type === 'location') return n.title;
  return null;
}

function locationCoords(n: NodeRecord): { lat?: number; lng?: number } {
  const props = n.props as Record<string, unknown>;
  const lat = typeof props.lat === 'number' ? props.lat : typeof props.latitude === 'number' ? props.latitude : undefined;
  const lng =
    typeof props.lng === 'number'
      ? props.lng
      : typeof props.lon === 'number'
        ? props.lon
        : typeof props.longitude === 'number'
          ? props.longitude
          : undefined;
  return { lat, lng };
}

function recordDate(n: NodeRecord, edgeProps?: Record<string, unknown>): string | undefined {
  if (n.start_date && n.start_date.length >= 4) return n.start_date.slice(0, 10);
  const props = n.props as Record<string, unknown>;
  for (const key of ['date', 'occurred_at', 'starts_at', 'start'] as const) {
    const v = props[key];
    if (typeof v === 'string' && v.length >= 4) return v.slice(0, 10);
  }
  if (edgeProps) {
    const d = edgeProps.date ?? edgeProps.start;
    if (typeof d === 'string' && d.length >= 4) return d.slice(0, 10);
  }
  if (n.end_date && n.end_date.length >= 4) return n.end_date.slice(0, 10);
  return undefined;
}

function inPeriod(date: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!date) return true; // undated kept unless both bounds set strictly, keep visible
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** City aggregation + trips with VISITED stops (Atlas). Optional period filter. */
export async function mapView(options: { from?: string; to?: string } = {}): Promise<MapViewResult> {
  const from = options.from?.slice(0, 10);
  const to = options.to?.slice(0, 10);
  const graph = await loadGraph();
  const registry: PlaceRegistry = await getPlaceRegistry();
  const byCity = new Map<string, MapCity>();

  const ensureCity = (rawCity: string, coords?: { lat?: number; lng?: number }) => {
    const resolved = resolvePlaceLabel(rawCity, registry);
    const key = resolved.placeId ?? resolved.label.toLowerCase();
    let entry = byCity.get(key);
    if (!entry) {
      entry = {
        city: resolved.label,
        count: 0,
        types: {},
        records: [],
        ...(resolved.lat != null ? { lat: resolved.lat } : {}),
        ...(resolved.lng != null ? { lng: resolved.lng } : {}),
      };
      byCity.set(key, entry);
    }
    if (coords?.lat != null && entry.lat == null) entry.lat = coords.lat;
    if (coords?.lng != null && entry.lng == null) entry.lng = coords.lng;
    if (resolved.lat != null && entry.lat == null) entry.lat = resolved.lat;
    if (resolved.lng != null && entry.lng == null) entry.lng = resolved.lng;
    return entry;
  };

  const add = (
    city: string,
    n: NodeRecord,
    link: MapRecord['link'],
    edgeProps?: Record<string, unknown>,
    coords?: { lat?: number; lng?: number },
  ) => {
    const date = recordDate(n, edgeProps);
    if (!inPeriod(date, from, to)) return;
    const entry = ensureCity(city, coords);
    if (entry.records.some((r) => r.id === n.id)) return;
    entry.count += 1;
    entry.types[n.type] = (entry.types[n.type] ?? 0) + 1;
    if (entry.records.length < 50) {
      entry.records.push({
        id: n.id,
        type: n.type,
        title: n.title,
        ...(date ? { date } : {}),
        link,
      });
    }
  };

  for (const node of graph.nodes.values()) {
    if (node.type === 'location') {
      const city = cityOf(node);
      if (city) ensureCity(city, locationCoords(node));
      continue;
    }
    const city = cityOf(node);
    if (city) add(city, node, 'city');
  }

  for (const e of graph.edges) {
    if (e.type !== 'LOCATED_IN' && e.type !== 'VISITED') continue;
    const place = graph.nodes.get(e.dst);
    const subject = graph.nodes.get(e.src);
    if (!place || !subject) continue;
    const city = cityOf(place);
    if (!city) continue;
    add(city, subject, e.type, e.props as Record<string, unknown>, locationCoords(place));
  }

  // Trips: ordered VISITED stops + WITH companions.
  const trips: MapTrip[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'trip') continue;
    const stops: MapTripStop[] = [];
    const companionIds: string[] = [];
    for (const e of graph.bySrc.get(node.id) ?? []) {
      if (e.type === 'WITH') {
        companionIds.push(e.dst);
        continue;
      }
      if (e.type !== 'VISITED') continue;
      const place = graph.nodes.get(e.dst);
      if (!place) continue;
      const city = cityOf(place);
      if (!city) continue;
      const props = e.props as Record<string, unknown>;
      const nights = typeof props.nights === 'number' ? props.nights : undefined;
      const date = recordDate(node, props);
      const coords = locationCoords(place);
      const resolved = resolvePlaceLabel(city, registry);
      stops.push({
        city: resolved.label,
        ...(nights != null ? { nights } : {}),
        ...(date ? { date } : {}),
        ...(resolved.lat != null ? { lat: resolved.lat } : coords.lat != null ? { lat: coords.lat } : {}),
        ...(resolved.lng != null ? { lng: resolved.lng } : coords.lng != null ? { lng: coords.lng } : {}),
      });
    }
    if (stops.length === 0) continue;
    stops.sort((a, b) => {
      const da = a.date ?? '';
      const db = b.date ?? '';
      if (da !== db) return da.localeCompare(db);
      return a.city.localeCompare(b.city);
    });
    const start = node.start_date?.slice(0, 10);
    const end = node.end_date?.slice(0, 10);
    const tripDates = [start, end, ...stops.map((s) => s.date)].filter(Boolean) as string[];
    if (from || to) {
      if (!tripDates.length || !tripDates.some((d) => inPeriod(d, from, to))) continue;
    }
    trips.push({
      id: node.id,
      title: node.title,
      stops,
      companionIds: [...new Set(companionIds)].sort(),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    });
  }
  trips.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || a.title.localeCompare(b.title));

  const cities = [...byCity.values()]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  return { cities, trips };
}

export interface GraphPathHop {
  nodeId: string;
  title: string;
  type: string;
  viaEdgeType?: string;
  viaEdgeId?: string;
}

export interface GraphPathResult {
  from: string;
  to: string;
  hops: GraphPathHop[];
  edges: Array<{ id: string; src: string; dst: string; type: string }>;
  found: boolean;
}

/**
 * Shortest untyped path between any two nodes (BFS), for the life-map Path mode.
 * Cap depth so runaway graphs stay snappy.
 */
export async function findGraphPath(options: {
  from: string;
  to: string;
  maxDepth?: number;
}): Promise<GraphPathResult> {
  const graph = await loadGraph();
  const from = options.from;
  const to = options.to;
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 6, 1), 8);

  const empty = (): GraphPathResult => ({ from, to, hops: [], edges: [], found: false });
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return empty();
  if (from === to) {
    const n = graph.nodes.get(from)!;
    return {
      from,
      to,
      found: true,
      hops: [{ nodeId: n.id, title: n.title, type: n.type }],
      edges: [],
    };
  }

  // Undirected adjacency with edge metadata for reconstruction.
  type Step = { peer: string; edgeId: string; edgeType: string; src: string; dst: string };
  const adj = new Map<string, Step[]>();
  const add = (a: string, step: Step) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(step);
  };
  for (const e of graph.edges) {
    add(e.src, { peer: e.dst, edgeId: e.id, edgeType: e.type, src: e.src, dst: e.dst });
    add(e.dst, { peer: e.src, edgeId: e.id, edgeType: e.type, src: e.src, dst: e.dst });
  }
  for (const list of adj.values()) {
    list.sort((a, b) => a.peer.localeCompare(b.peer) || a.edgeType.localeCompare(b.edgeType));
  }

  const prev = new Map<string, { from: string; step: Step }>();
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  let found = false;

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    if (d >= maxDepth) continue;
    for (const step of adj.get(id) ?? []) {
      if (dist.has(step.peer)) continue;
      dist.set(step.peer, d + 1);
      prev.set(step.peer, { from: id, step });
      if (step.peer === to) {
        found = true;
        break;
      }
      queue.push(step.peer);
    }
    if (found) break;
  }

  if (!found) return empty();

  const nodeIds: string[] = [];
  let cur = to;
  for (;;) {
    nodeIds.push(cur);
    if (cur === from) break;
    cur = prev.get(cur)!.from;
  }
  nodeIds.reverse();

  const hops: GraphPathHop[] = [];
  const edges: GraphPathResult['edges'] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i]!;
    const n = graph.nodes.get(nodeId)!;
    const into = i === 0 ? undefined : prev.get(nodeId)!.step;
    hops.push({
      nodeId,
      title: n.title,
      type: n.type,
      ...(into ? { viaEdgeType: into.edgeType, viaEdgeId: into.edgeId } : {}),
    });
    if (into) {
      edges.push({ id: into.edgeId, src: into.src, dst: into.dst, type: into.edgeType });
    }
  }

  return { from, to, hops, edges, found: true };
}

