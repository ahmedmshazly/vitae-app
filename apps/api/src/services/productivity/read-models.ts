/**
 * Task nodes → TaskReadModel. Placement is computed on read via `placeItem`.
 */
import {
  defaultPlacementContext,
  isOpenStatus,
  placeItem,
  type EdgeRecord,
  type Importance,
  type NodeRecord,
  type Placement,
  type PlacementContext,
  type PlacementGoal,
  type PlacementItem,
  type PlacementProject,
  type PlacementWaitingOn,
  type QuadrantOverride,
  type TaskReadModel,
  type VitaePriority,
  type VitaeTaskStatus,
} from '@vitae/core';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function taskProps(node: NodeRecord): Record<string, unknown> {
  return (node.props ?? {}) as Record<string, unknown>;
}

export function taskStatus(node: NodeRecord): VitaeTaskStatus {
  const status = taskProps(node).status;
  return status === 'inbox' ||
    status === 'next' ||
    status === 'doing' ||
    status === 'waiting' ||
    status === 'done' ||
    status === 'dropped'
    ? status
    : 'inbox';
}

export function sortKeyOf(node: NodeRecord): number | undefined {
  return asNumber(taskProps(node).sort_key);
}

export function placementItemFromNode(node: NodeRecord, edges: readonly EdgeRecord[]): PlacementItem {
  const props = taskProps(node);
  const waiting = edges.find((edge) => edge.type === 'WAITING_ON' && edge.src === node.id);
  const serves = edges.find((edge) => edge.type === 'SERVES_GOAL' && edge.src === node.id);
  return {
    due: asString(props.due) ?? null,
    target: asString(props.target) ?? null,
    follow_up: asString(props.follow_up) ?? null,
    importance: (props.importance as Importance | undefined) ?? null,
    waiting_on: waiting?.dst ?? asString(props.waiting_on) ?? null,
    waiting_since: asString(props.waiting_since) ?? null,
    waiting_patience_days: asNumber(props.waiting_patience_days) ?? null,
    quadrant_override: (props.quadrant_override as QuadrantOverride | undefined) ?? null,
    project_id: asString(props.project_id) ?? null,
    serves_goal_id: serves?.dst ?? asString(props.serves_goal_id) ?? null,
  };
}

export function placementContextFor(
  item: PlacementItem,
  nodesById: ReadonlyMap<string, NodeRecord>,
  now: string,
  timeZone: string,
): PlacementContext {
  const projectNode = item.project_id ? nodesById.get(item.project_id) : undefined;
  const goalNode = item.serves_goal_id ? nodesById.get(item.serves_goal_id) : undefined;
  const waitingNode = item.waiting_on ? nodesById.get(item.waiting_on) : undefined;

  const project: PlacementProject | null =
    projectNode && projectNode.type === 'project'
      ? {
          id: projectNode.id,
          name: projectNode.title,
          default_importance: (taskProps(projectNode).default_importance as Importance | undefined) ?? null,
        }
      : null;

  const goal: PlacementGoal | null =
    goalNode && goalNode.type === 'goal'
      ? {
          id: goalNode.id,
          title: goalNode.title,
          importance: (taskProps(goalNode).importance as Importance | undefined) ?? null,
        }
      : null;

  const waitingOn: PlacementWaitingOn | null = waitingNode
    ? {
        id: waitingNode.id,
        name: waitingNode.title,
        patience_days: asNumber(taskProps(waitingNode).waiting_patience_days) ?? null,
      }
    : null;

  return defaultPlacementContext({ now, timeZone, project, goal, waitingOn });
}

export function placeTask(
  node: NodeRecord,
  edges: readonly EdgeRecord[],
  nodesById: ReadonlyMap<string, NodeRecord>,
  now: string,
  timeZone: string,
): Placement {
  const item = placementItemFromNode(node, edges);
  return placeItem(item, placementContextFor(item, nodesById, now, timeZone));
}

export function toTaskReadModel(node: NodeRecord, placement: Placement): TaskReadModel {
  const props = taskProps(node);
  const status = taskStatus(node);
  const provenance = props.provenance as { source_status?: string } | undefined;
  return {
    id: node.id,
    title: node.title,
    status,
    rev: node.rev,
    due: asString(props.due),
    target: asString(props.target),
    scheduled: asString(props.scheduled),
    follow_up: asString(props.follow_up),
    priority: props.priority as VitaePriority | undefined,
    importance: props.importance as Importance | undefined,
    sensitivity: node.sensitivity,
    project_id: asString(props.project_id),
    quadrant_override: (props.quadrant_override as QuadrantOverride | undefined) ?? null,
    source_status: provenance?.source_status ?? asString(props.source_status),
    open: isOpenStatus(status),
    quadrant: placement.quadrant,
    placement,
  };
}

export function compareTasks(a: NodeRecord, b: NodeRecord): number {
  const ka = sortKeyOf(a);
  const kb = sortKeyOf(b);
  const aHas = ka !== undefined;
  const bHas = kb !== undefined;
  if (aHas && bHas && ka !== kb) return ka - kb;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return b.updated_at.localeCompare(a.updated_at);
}

export function taskReadModels(
  nodes: readonly NodeRecord[],
  edges: readonly EdgeRecord[],
  now: string,
  timeZone: string,
): TaskReadModel[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const tasks = nodes.filter((node) => node.type === 'task' && !node.deleted_at).slice().sort(compareTasks);
  return tasks.map((node) => toTaskReadModel(node, placeTask(node, edges, nodesById, now, timeZone)));
}
