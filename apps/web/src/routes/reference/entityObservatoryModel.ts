import type { EdgeType } from '@vitae/core';
import {
  ANY_ENTITY,
  CATALOG_ENTITIES,
  CATALOG_GRAPH,
  CATALOG_RELATIONS,
  ENTITY_GROUPS,
  type CatalogGraphLink,
  type CatalogGroup,
  type CatalogEntity,
  type CatalogGraphNode,
  type CatalogRelation,
  type CatalogSelection,
} from './entityCatalogModel.js';

export type ObservatoryLens = 'orbit' | 'focus' | 'matrix';
export type ObservatoryEdgeMode = 'on-demand' | 'bundled' | 'all';
export type ObservatoryDirection = 'both' | 'in' | 'out';
export type ObservatoryLabelDensity = 'auto' | 'sparse' | 'full';
export type ObservatorySort = 'group' | 'alpha' | 'degree';
export type ObservatorySelectionId = CatalogSelection['id'];

export interface ObservatoryFilters {
  groups: CatalogGroup[];
  relations: EdgeType[];
  direction: ObservatoryDirection;
  fieldQuery: string;
  minDegree: number;
  maxDegree: number;
  showWildcard: boolean;
}

export interface ObservatoryDisplay {
  edgeMode: ObservatoryEdgeMode;
  labelDensity: ObservatoryLabelDensity;
  motion: boolean;
  routeOpacity: number;
  routeThickness: number;
  pulseSpeed: number;
  hopDepth: 1 | 2 | 3;
  minimap: boolean;
  fisheye: boolean;
  panelWidth: number;
  sort: ObservatorySort;
  transpose: boolean;
}

export interface ObservatoryPinnedPosition {
  x: number;
  y: number;
}

export interface ObservatoryWorkspaceState {
  version: 1;
  lens: ObservatoryLens;
  selectedIds: ObservatorySelectionId[];
  compareIds: ObservatorySelectionId[];
  hiddenIds: ObservatorySelectionId[];
  filters: ObservatoryFilters;
  display: ObservatoryDisplay;
  pinnedPositions: Record<string, ObservatoryPinnedPosition>;
}

export interface SavedObservatoryWorkspace {
  id: string;
  name: string;
  updatedAt: string;
  state: ObservatoryWorkspaceState;
}

export type ObservatoryNodeKind = CatalogSelection['kind'] | 'group';

export interface ObservatorySceneNode {
  id: string;
  selectionId: ObservatorySelectionId | null;
  label: string;
  kind: ObservatoryNodeKind;
  group: CatalogGroup | 'Relations' | 'Universal';
  x: number;
  y: number;
  degree: number;
  selected: boolean;
  compared: boolean;
  active: boolean;
  showLabel: boolean;
  pinned: boolean;
}

export interface ObservatorySceneEdge {
  id: string;
  source: string;
  target: string;
  relationId: `relation:${EdgeType}`;
  role: CatalogGraphLink['role'];
  count: number;
  bundled: boolean;
  active: boolean;
}

export interface ObservatoryScene {
  nodes: ObservatorySceneNode[];
  edges: ObservatorySceneEdge[];
  visibleRelationIds: Set<string>;
  routeCount: number;
}

export interface ObservatoryMatrixCell {
  sourceId: ObservatorySelectionId;
  targetId: ObservatorySelectionId;
  relations: CatalogRelation[];
}

export interface ObservatoryMatrix {
  entities: Array<{
    id: ObservatorySelectionId;
    label: string;
    group: CatalogGroup | 'Universal';
    degree: number;
  }>;
  cells: Map<string, ObservatoryMatrixCell>;
  relationCount: number;
}

export const OBSERVATORY_STORAGE_KEY = 'vitae.entity-observatory.v1';
/**
 * Categorical group fills: Quiet viz slots, aligned with print `--ec-*`
 * (Career→1, Content→2, Life→3, Job search→4, Long tail→6). Fallbacks match
 * `tokens.css`; runtime graph code prefers `readGraphPalette().slots`.
 */
export const OBSERVATORY_GROUP_COLORS: Record<CatalogGroup, string> = {
  Career: '#1f9c86',
  Content: '#b08a18',
  'Job search': '#c8503f',
  Life: '#6e8fd0',
  'Long tail': '#7e9b3a',
};

/** Slot index (1-based) for each catalog group, fixed, never cycled. */
export const OBSERVATORY_GROUP_SLOTS: Record<CatalogGroup, number> = {
  Career: 1,
  Content: 2,
  Life: 3,
  'Job search': 4,
  'Long tail': 6,
};

const ALL_GROUPS = ENTITY_GROUPS.map((group) => group.label);
const ALL_RELATIONS = CATALOG_RELATIONS.map((relation) => relation.type);
const RELATION_BY_ID = new Map<string, CatalogRelation>(
  CATALOG_RELATIONS.map((relation) => [relation.id, relation]),
);
const ENTITY_BY_ID = new Map<string, CatalogEntity>(
  CATALOG_ENTITIES.map((entity) => [entity.id, entity]),
);
const NODE_BY_ID = new Map<string, CatalogGraphNode>(
  CATALOG_GRAPH.nodes.map((node) => [node.id, node]),
);
const ENTITY_ORDER = new Map<string, number>(
  CATALOG_ENTITIES.map((entity, index) => [entity.id, index]),
);

const ORBIT_GROUP_CENTERS: Record<CatalogGroup, readonly [number, number]> = {
  Career: [-520, -245],
  Content: [-500, 245],
  'Job search': [520, -255],
  Life: [530, 220],
  'Long tail': [0, 390],
};

function cloneDefaultState(): ObservatoryWorkspaceState {
  return {
    version: 1,
    lens: 'orbit',
    selectedIds: [],
    compareIds: [],
    hiddenIds: [],
    filters: {
      groups: [...ALL_GROUPS],
      relations: [...ALL_RELATIONS],
      direction: 'both',
      fieldQuery: '',
      minDegree: 0,
      maxDegree: 99,
      showWildcard: true,
    },
    display: {
      edgeMode: 'on-demand',
      labelDensity: 'auto',
      motion: true,
      routeOpacity: 0.72,
      routeThickness: 1,
      pulseSpeed: 1,
      hopDepth: 1,
      minimap: true,
      fisheye: false,
      panelWidth: 320,
      sort: 'group',
      transpose: false,
    },
    pinnedPositions: {},
  };
}

export const DEFAULT_OBSERVATORY_STATE = cloneDefaultState();

function endpointId(value: CatalogGraphLink['source'] | CatalogGraphLink['target']): string {
  return value;
}

export const OBSERVATORY_DEGREES = (() => {
  const result = new Map<string, number>();
  for (const link of CATALOG_GRAPH.links) {
    result.set(link.source, (result.get(link.source) ?? 0) + 1);
    result.set(link.target, (result.get(link.target) ?? 0) + 1);
  }
  return result;
})();

function relationMatchesFieldQuery(relation: CatalogRelation, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return (
    relation.type.toLocaleLowerCase().includes(normalized) ||
    relation.label.toLocaleLowerCase().includes(normalized) ||
    relation.description.toLocaleLowerCase().includes(normalized) ||
    relation.fields.some(
      (field) =>
        field.key.toLocaleLowerCase().includes(normalized) ||
        field.label.toLocaleLowerCase().includes(normalized),
    )
  );
}

function visibleEntityIds(state: ObservatoryWorkspaceState): Set<string> {
  const groups = new Set(state.filters.groups);
  const hidden = new Set(state.hiddenIds);
  return new Set(
    CATALOG_ENTITIES.filter((entity) => {
      const degree = OBSERVATORY_DEGREES.get(entity.id) ?? 0;
      return (
        groups.has(entity.group) &&
        !hidden.has(entity.id) &&
        degree >= state.filters.minDegree &&
        degree <= state.filters.maxDegree
      );
    }).map((entity) => entity.id),
  );
}

function visibleRelationIds(state: ObservatoryWorkspaceState): Set<string> {
  const types = new Set(state.filters.relations);
  const hidden = new Set(state.hiddenIds);
  const query = state.filters.fieldQuery.trim();
  return new Set(
    CATALOG_RELATIONS.filter(
      (relation) =>
        types.has(relation.type) &&
        !hidden.has(relation.id) &&
        relationMatchesFieldQuery(relation, query),
    ).map((relation) => relation.id),
  );
}

function filteredLinks(state: ObservatoryWorkspaceState): CatalogGraphLink[] {
  const entities = visibleEntityIds(state);
  const relations = visibleRelationIds(state);
  const visibleEndpoints = new Set<string>([
    ...entities,
    ...(state.filters.showWildcard && !state.hiddenIds.includes(ANY_ENTITY.id)
      ? [ANY_ENTITY.id]
      : []),
  ]);
  return CATALOG_GRAPH.links.filter(
    (link) =>
      relations.has(link.relationId) &&
      visibleEndpoints.has(link.role === 'source' ? link.source : link.target),
  );
}

function relationsTouchingIds(
  links: CatalogGraphLink[],
  ids: Iterable<string>,
  direction: ObservatoryDirection,
): Set<string> {
  const idSet = new Set(ids);
  const result = new Set<string>();
  for (const link of links) {
    if (idSet.has(link.relationId)) {
      result.add(link.relationId);
      continue;
    }
    const endpoint = link.role === 'source' ? link.source : link.target;
    if (!idSet.has(endpoint)) continue;
    if (
      direction === 'both' ||
      (direction === 'out' && link.role === 'source') ||
      (direction === 'in' && link.role === 'target')
    ) {
      result.add(link.relationId);
    }
  }
  return result;
}

function selectionIds(state: ObservatoryWorkspaceState, hoveredId?: string | null): string[] {
  return [
    ...state.selectedIds,
    ...state.compareIds,
    ...(hoveredId ? [hoveredId] : []),
  ];
}

function showNodeLabel(
  state: ObservatoryWorkspaceState,
  nodeId: string,
  kind: ObservatoryNodeKind,
  active: boolean,
): boolean {
  if (kind === 'group' || kind === 'any') return true;
  if (state.display.labelDensity === 'full') return true;
  if (state.display.labelDensity === 'sparse') return active;
  return kind === 'entity' || active;
}

function pinnedPosition(
  state: ObservatoryWorkspaceState,
  id: string,
  fallback: readonly [number, number],
): readonly [number, number] {
  const position = state.pinnedPositions[id];
  return position ? [position.x, position.y] : fallback;
}

function orbitNodes(
  state: ObservatoryWorkspaceState,
  activeRelations: Set<string>,
): ObservatorySceneNode[] {
  const entityIds = visibleEntityIds(state);
  const relationIds = visibleRelationIds(state);
  const selected = new Set<string>(state.selectedIds);
  const compared = new Set<string>(state.compareIds);
  const nodes: ObservatorySceneNode[] = [];

  for (const group of ENTITY_GROUPS) {
    const entities = CATALOG_ENTITIES.filter(
      (entity) => entity.group === group.label && entityIds.has(entity.id),
    );
    if (entities.length === 0) continue;
    const center = ORBIT_GROUP_CENTERS[group.label];
    nodes.push({
      id: `group:${group.label}`,
      selectionId: null,
      label: group.label,
      kind: 'group',
      group: group.label,
      x: center[0],
      y: center[1],
      degree: entities.length,
      selected: false,
      compared: false,
      active: true,
      showLabel: true,
      pinned: false,
    });
    const radiusX = entities.length > 7 ? 158 : 132;
    const radiusY = entities.length > 7 ? 104 : 94;
    entities.forEach((entity, index) => {
      const angle = -Math.PI / 2 + (index / entities.length) * Math.PI * 2;
      const fallback = [
        center[0] + Math.cos(angle) * radiusX,
        center[1] + Math.sin(angle) * radiusY,
      ] as const;
      const [x, y] = pinnedPosition(state, entity.id, fallback);
      const active =
        selected.has(entity.id) ||
        compared.has(entity.id) ||
        CATALOG_GRAPH.links.some(
          (link) =>
            activeRelations.has(link.relationId) &&
            (link.source === entity.id || link.target === entity.id),
        );
      nodes.push({
        id: entity.id,
        selectionId: entity.id,
        label: entity.type,
        kind: entity.kind,
        group: entity.group,
        x,
        y,
        degree: OBSERVATORY_DEGREES.get(entity.id) ?? 0,
        selected: selected.has(entity.id),
        compared: compared.has(entity.id),
        active,
        showLabel: showNodeLabel(state, entity.id, entity.kind, active),
        pinned: Boolean(state.pinnedPositions[entity.id]),
      });
    });
  }

  const relations = CATALOG_RELATIONS.filter((relation) => relationIds.has(relation.id));
  relations.forEach((relation, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(relations.length, 1)) * Math.PI * 2;
    const fallback = [Math.cos(angle) * 235, Math.sin(angle) * 185] as const;
    const [x, y] = pinnedPosition(state, relation.id, fallback);
    const active =
      activeRelations.has(relation.id) ||
      selected.has(relation.id) ||
      compared.has(relation.id);
    nodes.push({
      id: relation.id,
      selectionId: relation.id,
      label: relation.type,
      kind: relation.kind,
      group: 'Relations',
      x,
      y,
      degree: OBSERVATORY_DEGREES.get(relation.id) ?? 0,
      selected: selected.has(relation.id),
      compared: compared.has(relation.id),
      active,
      showLabel: showNodeLabel(state, relation.id, relation.kind, active),
      pinned: Boolean(state.pinnedPositions[relation.id]),
    });
  });

  if (state.filters.showWildcard && !state.hiddenIds.includes(ANY_ENTITY.id)) {
    const active = selected.has('any') || compared.has('any');
    nodes.push({
      id: 'any',
      selectionId: 'any',
      label: 'Any',
      kind: 'any',
      group: 'Universal',
      x: 0,
      y: 0,
      degree: OBSERVATORY_DEGREES.get('any') ?? 0,
      selected: selected.has('any'),
      compared: compared.has('any'),
      active,
      showLabel: true,
      pinned: false,
    });
  }
  return nodes;
}

function directSceneEdges(
  links: CatalogGraphLink[],
  activeRelations: Set<string>,
  state: ObservatoryWorkspaceState,
): ObservatorySceneEdge[] {
  const shouldShowAll = state.display.edgeMode === 'all';
  const shouldShowActive = activeRelations.size > 0;
  if (!shouldShowAll && !shouldShowActive) return [];
  return links
    .filter((link) => shouldShowAll || activeRelations.has(link.relationId))
    .map((link, index) => ({
      id: `${link.relationId}:${link.role}:${index}:${link.source}:${link.target}`,
      source: endpointId(link.source),
      target: endpointId(link.target),
      relationId: link.relationId,
      role: link.role,
      count: 1,
      bundled: false,
      active: activeRelations.has(link.relationId),
    }));
}

function bundledSceneEdges(
  links: CatalogGraphLink[],
  activeRelations: Set<string>,
): ObservatorySceneEdge[] {
  if (activeRelations.size > 0) {
    return links
      .filter((link) => activeRelations.has(link.relationId))
      .map((link, index) => ({
        id: `${link.relationId}:${link.role}:active:${index}`,
        source: link.source,
        target: link.target,
        relationId: link.relationId,
        role: link.role,
        count: 1,
        bundled: false,
        active: true,
      }));
  }
  const bundles = new Map<string, ObservatorySceneEdge>();
  for (const link of links) {
    const endpoint = link.role === 'source' ? link.source : link.target;
    const entity = ENTITY_BY_ID.get(endpoint);
    const groupKey = entity?.group ?? 'Universal';
    const hub = entity ? `group:${groupKey}` : endpoint;
    const source = link.role === 'source' ? hub : link.relationId;
    const target = link.role === 'source' ? link.relationId : hub;
    const key = `${source}|${target}|${link.relationId}|${link.role}`;
    const existing = bundles.get(key);
    if (existing) existing.count += 1;
    else {
      bundles.set(key, {
        id: `bundle:${key}`,
        source,
        target,
        relationId: link.relationId,
        role: link.role,
        count: 1,
        bundled: true,
        active: false,
      });
    }
  }
  return [...bundles.values()];
}

export function buildOrbitScene(
  state: ObservatoryWorkspaceState,
  hoveredId: string | null = null,
): ObservatoryScene {
  const links = filteredLinks(state);
  const activeRelations = relationsTouchingIds(
    links,
    selectionIds(state, hoveredId),
    state.filters.direction,
  );
  const nodes = orbitNodes(state, activeRelations);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges =
    state.display.edgeMode === 'bundled'
      ? bundledSceneEdges(links, activeRelations)
      : directSceneEdges(links, activeRelations, state);
  const visibleEdges = edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  return {
    nodes,
    edges: visibleEdges,
    visibleRelationIds: activeRelations,
    routeCount: visibleEdges.reduce((total, edge) => total + edge.count, 0),
  };
}

function adjacency(links: CatalogGraphLink[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const link of links) {
    if (!result.has(link.source)) result.set(link.source, new Set());
    if (!result.has(link.target)) result.set(link.target, new Set());
    result.get(link.source)?.add(link.target);
    result.get(link.target)?.add(link.source);
  }
  return result;
}

function bfsLevels(
  graph: Map<string, Set<string>>,
  starts: string[],
  maxLevel: number,
): Map<string, number> {
  const levels = new Map<string, number>();
  const queue: string[] = [];
  for (const start of starts) {
    levels.set(start, 0);
    queue.push(start);
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const level = levels.get(current) ?? 0;
    if (level >= maxLevel) continue;
    for (const next of graph.get(current) ?? []) {
      if (levels.has(next)) continue;
      levels.set(next, level + 1);
      queue.push(next);
    }
  }
  return levels;
}

export function buildFocusScene(state: ObservatoryWorkspaceState): ObservatoryScene {
  const selectedIds: string[] = [...state.selectedIds, ...state.compareIds].filter((id) =>
    NODE_BY_ID.has(id),
  );
  if (selectedIds.length === 0) {
    return { nodes: [], edges: [], visibleRelationIds: new Set(), routeCount: 0 };
  }
  const links = filteredLinks(state);
  const levels = bfsLevels(adjacency(links), selectedIds, state.display.hopDepth * 2);
  const nodeIds = new Set(levels.keys());
  const selected = new Set<string>(state.selectedIds);
  const compared = new Set<string>(state.compareIds);
  const visibleLinks = links.filter(
    (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
  );
  const relationIds = new Set(visibleLinks.map((link) => link.relationId));
  const levelBuckets = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!levelBuckets.has(level)) levelBuckets.set(level, []);
    levelBuckets.get(level)?.push(id);
  }

  const nodes: ObservatorySceneNode[] = [];
  for (const [id, level] of levels) {
    const node = NODE_BY_ID.get(id);
    if (!node) continue;
    const peers = levelBuckets.get(level) ?? [id];
    const index = peers.indexOf(id);
    let fallback: readonly [number, number];
    if (level === 0 && selectedIds.length > 1) {
      const selectedIndex = selectedIds.indexOf(id);
      fallback = [selectedIndex === 0 ? -190 : 190, 0];
    } else if (level === 0) {
      fallback = [0, 0];
    } else {
      const radiusX = 170 + level * 150;
      const radiusY = 115 + level * 88;
      const angle = -Math.PI / 2 + (index / Math.max(peers.length, 1)) * Math.PI * 2;
      fallback = [Math.cos(angle) * radiusX, Math.sin(angle) * radiusY];
    }
    const [x, y] = pinnedPosition(state, id, fallback);
    nodes.push({
      id,
      selectionId: id as ObservatorySelectionId,
      label: node.label,
      kind: node.kind,
      group: node.group,
      x,
      y,
      degree: OBSERVATORY_DEGREES.get(id) ?? 0,
      selected: selected.has(id),
      compared: compared.has(id),
      active: true,
      showLabel: true,
      pinned: Boolean(state.pinnedPositions[id]),
    });
  }

  const edges = visibleLinks.map((link, index) => ({
    id: `focus:${link.relationId}:${link.role}:${index}`,
    source: link.source,
    target: link.target,
    relationId: link.relationId,
    role: link.role,
    count: 1,
    bundled: false,
    active: true,
  }));
  return {
    nodes,
    edges,
    visibleRelationIds: relationIds,
    routeCount: edges.length,
  };
}

function relationPairs(relation: CatalogRelation): Array<[ObservatorySelectionId, ObservatorySelectionId]> {
  if (relation.allowedPairs.length > 0) {
    return relation.allowedPairs.map(([source, target]) => [
      `entity:${source}`,
      `entity:${target}`,
    ]);
  }
  const sources =
    relation.sources === '*'
      ? (['any'] as ObservatorySelectionId[])
      : relation.sources.map((type) => `entity:${type}` as ObservatorySelectionId);
  const targets =
    relation.targets === '*'
      ? (['any'] as ObservatorySelectionId[])
      : relation.targets.map((type) => `entity:${type}` as ObservatorySelectionId);
  return sources.flatMap((source) =>
    targets.map((target): [ObservatorySelectionId, ObservatorySelectionId] => [source, target]),
  );
}

export function buildObservatoryMatrix(state: ObservatoryWorkspaceState): ObservatoryMatrix {
  const entityIds = visibleEntityIds(state);
  const relationIds = visibleRelationIds(state);
  const entities: ObservatoryMatrix['entities'] = CATALOG_ENTITIES.filter((entity) =>
    entityIds.has(entity.id),
  ).map((entity) => ({
    id: entity.id,
    label: entity.type,
    group: entity.group,
    degree: OBSERVATORY_DEGREES.get(entity.id) ?? 0,
  }));
  if (state.filters.showWildcard && !state.hiddenIds.includes(ANY_ENTITY.id)) {
    entities.push({
      id: 'any',
      label: 'Any',
      group: 'Universal',
      degree: OBSERVATORY_DEGREES.get('any') ?? 0,
    });
  }
  entities.sort((a, b) => {
    if (state.display.sort === 'alpha') return a.label.localeCompare(b.label);
    if (state.display.sort === 'degree') return b.degree - a.degree || a.label.localeCompare(b.label);
    const left = a.id === 'any' ? Number.MAX_SAFE_INTEGER : (ENTITY_ORDER.get(a.id) ?? 0);
    const right = b.id === 'any' ? Number.MAX_SAFE_INTEGER : (ENTITY_ORDER.get(b.id) ?? 0);
    return left - right;
  });
  const allowedIds = new Set(entities.map((entity) => entity.id));
  const cells = new Map<string, ObservatoryMatrixCell>();
  let relationCount = 0;
  for (const relation of CATALOG_RELATIONS) {
    if (!relationIds.has(relation.id)) continue;
    for (const [sourceId, targetId] of relationPairs(relation)) {
      if (!allowedIds.has(sourceId) || !allowedIds.has(targetId)) continue;
      const key = `${sourceId}|${targetId}`;
      const existing = cells.get(key);
      if (existing) existing.relations.push(relation);
      else cells.set(key, { sourceId, targetId, relations: [relation] });
      relationCount += 1;
    }
  }
  return { entities, cells, relationCount };
}

export function observatorySelectionConnections(id: string): {
  incoming: CatalogRelation[];
  outgoing: CatalogRelation[];
} {
  const incoming = new Set<CatalogRelation>();
  const outgoing = new Set<CatalogRelation>();
  for (const link of CATALOG_GRAPH.links) {
    const relation = RELATION_BY_ID.get(link.relationId);
    if (!relation) continue;
    if (link.role === 'source' && link.source === id) outgoing.add(relation);
    if (link.role === 'target' && link.target === id) incoming.add(relation);
  }
  return { incoming: [...incoming], outgoing: [...outgoing] };
}

export function cloneObservatoryState(
  state: ObservatoryWorkspaceState = DEFAULT_OBSERVATORY_STATE,
): ObservatoryWorkspaceState {
  return JSON.parse(JSON.stringify(state)) as ObservatoryWorkspaceState;
}

export function loadSavedObservatoryWorkspaces(): SavedObservatoryWorkspace[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(OBSERVATORY_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((workspace): SavedObservatoryWorkspace[] => {
      const valid =
        typeof workspace === 'object' &&
        workspace !== null &&
        typeof (workspace as SavedObservatoryWorkspace).id === 'string' &&
        typeof (workspace as SavedObservatoryWorkspace).name === 'string' &&
        (workspace as SavedObservatoryWorkspace).state?.version === 1;
      if (!valid) return [];
      const candidate = workspace as SavedObservatoryWorkspace;
      const state = normalizeObservatoryWorkspace(candidate.state);
      return state ? [{ ...candidate, state }] : [];
    });
  } catch {
    return [];
  }
}

export function saveObservatoryWorkspaces(workspaces: SavedObservatoryWorkspace[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OBSERVATORY_STORAGE_KEY, JSON.stringify(workspaces));
}

export function parseObservatoryWorkspace(value: string): ObservatoryWorkspaceState | null {
  try {
    const parsed = JSON.parse(value) as ObservatoryWorkspaceState;
    return normalizeObservatoryWorkspace(parsed);
  } catch {
    return null;
  }
}

function normalizeObservatoryWorkspace(
  parsed: ObservatoryWorkspaceState,
): ObservatoryWorkspaceState | null {
  if (
    parsed.version !== 1 ||
    !['orbit', 'focus', 'matrix'].includes(parsed.lens) ||
    !Array.isArray(parsed.selectedIds) ||
    !Array.isArray(parsed.compareIds)
  ) {
    return null;
  }
  const defaults = cloneDefaultState();
  return {
    ...defaults,
    ...parsed,
    selectedIds: parsed.selectedIds.filter((id) => NODE_BY_ID.has(id)),
    compareIds: parsed.compareIds.filter((id) => NODE_BY_ID.has(id)),
    hiddenIds: Array.isArray(parsed.hiddenIds)
      ? parsed.hiddenIds.filter((id) => NODE_BY_ID.has(id))
      : [],
    filters: { ...defaults.filters, ...parsed.filters },
    display: { ...defaults.display, ...parsed.display },
    pinnedPositions: parsed.pinnedPositions ?? {},
  };
}

export function observatoryStateFromSearchParams(
  params: URLSearchParams,
  base: ObservatoryWorkspaceState = DEFAULT_OBSERVATORY_STATE,
): ObservatoryWorkspaceState {
  const state = cloneObservatoryState(base);
  const lens = params.get('lens');
  if (lens === 'orbit' || lens === 'focus' || lens === 'matrix') state.lens = lens;
  else if (params.get('layout')) state.lens = 'orbit';
  const select = params.get('select');
  if (select && NODE_BY_ID.has(select)) state.selectedIds = [select as ObservatorySelectionId];
  const compare = params.get('compare');
  if (compare && NODE_BY_ID.has(compare)) state.compareIds = [compare as ObservatorySelectionId];
  const hidden = params
    .get('hidden')
    ?.split(',')
    .filter((id) => NODE_BY_ID.has(id)) as ObservatorySelectionId[] | undefined;
  if (hidden?.length) state.hiddenIds = hidden;
  const groups = params.get('groups')?.split(',').filter((group) => ALL_GROUPS.includes(group));
  if (groups?.length) state.filters.groups = groups as CatalogGroup[];
  const relations = params
    .get('relations')
    ?.split(',')
    .filter((relation) => ALL_RELATIONS.includes(relation as EdgeType));
  if (relations?.length) state.filters.relations = relations as EdgeType[];
  const direction = params.get('direction');
  if (direction === 'in' || direction === 'out' || direction === 'both') {
    state.filters.direction = direction;
  }
  const hops = Number(params.get('hops'));
  if (hops === 1 || hops === 2 || hops === 3) state.display.hopDepth = hops;
  const edges = params.get('edges');
  if (edges === 'on-demand' || edges === 'bundled' || edges === 'all') {
    state.display.edgeMode = edges;
  }
  const labels = params.get('labels');
  if (labels === 'auto' || labels === 'sparse' || labels === 'full') {
    state.display.labelDensity = labels;
  }
  const sort = params.get('sort');
  if (sort === 'group' || sort === 'alpha' || sort === 'degree') state.display.sort = sort;
  state.display.transpose = params.get('transpose') === '1';
  return state;
}

export function observatorySearchParams(
  state: ObservatoryWorkspaceState,
  existing = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(existing);
  params.delete('layout');
  params.set('lens', state.lens);
  const selected = state.selectedIds[0];
  const compare = state.compareIds[0];
  if (selected) params.set('select', selected);
  else params.delete('select');
  if (compare) params.set('compare', compare);
  else params.delete('compare');
  if (state.hiddenIds.length) params.set('hidden', state.hiddenIds.join(','));
  else params.delete('hidden');
  if (state.filters.groups.length === ALL_GROUPS.length) params.delete('groups');
  else params.set('groups', state.filters.groups.join(','));
  if (state.filters.relations.length === ALL_RELATIONS.length) params.delete('relations');
  else params.set('relations', state.filters.relations.join(','));
  if (state.filters.direction === 'both') params.delete('direction');
  else params.set('direction', state.filters.direction);
  if (state.display.hopDepth === 1) params.delete('hops');
  else params.set('hops', String(state.display.hopDepth));
  if (state.display.edgeMode === 'on-demand') params.delete('edges');
  else params.set('edges', state.display.edgeMode);
  if (state.display.labelDensity === 'auto') params.delete('labels');
  else params.set('labels', state.display.labelDensity);
  if (state.display.sort === 'group') params.delete('sort');
  else params.set('sort', state.display.sort);
  if (state.display.transpose) params.set('transpose', '1');
  else params.delete('transpose');
  return params;
}
