/**
 * Productivity command handler. One transaction writes the record(s),
 * revision(s), and idempotency receipt. Undo is a compensating command with a
 * new operation_id and the observed expected_revision (ADR 0011).
 *
 * Reorder persists `props.sort_key` (optional integer). Tasks without a key
 * still list; they sort after keyed rows, then by `updated_at`. Legacy tasks
 * are unchanged until a reorder names them.
 */
import {
  productivityCommandSchema,
  propsSchemaFor,
  type EdgeCreateInput,
  type EdgeRecord,
  type NodeRecord,
  type ProductivityCommand,
  type Quadrant,
  type QuadrantOverride,
  type VitaeTaskStatus,
} from '@vitae/core';
import {
  NotFoundError,
  RevisionConflictError,
  ValidationError,
  repository,
  type Tx,
  type WriteMeta,
} from '../../db/repository.js';
import { zodIssues, type AutomationRuleWrite, type TimeEntryPatch } from '../../db/productivity-docs.js';
import { todayIso } from '../../db/timezone.js';
import { nowIso } from '../../db/util.js';
import { searchIndex } from '../../db/search-index.js';
import { HttpError } from '../../middleware/error.js';
import { taskProps, taskStatus } from './read-models.js';

export const PRODUCTIVITY_NOT_FOUND_MESSAGE = 'Not found.';

export function productivityNotFound(): never {
  throw new HttpError(404, 'NOT_FOUND', PRODUCTIVITY_NOT_FOUND_MESSAGE);
}

export type CommandOutcome = { replayed: boolean; result: unknown };

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current && typeof current === 'object') {
    if ('code' in current && (current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function metaFrom(actor: string | undefined): WriteMeta {
  return { actor, source: 'manual' };
}

function stampOverride(quadrant: Quadrant): QuadrantOverride {
  return { quadrant, set_at: todayIso() };
}

type TaskFieldPatch = {
  title?: string;
  status?: VitaeTaskStatus;
  due?: string;
  target?: string;
  scheduled?: string;
  follow_up?: string;
  priority?: string;
  importance?: string;
  notes_md?: string;
  sensitivity?: 'normal' | 'sensitive';
  project_id?: string;
  effort_min?: number;
  quadrant_override?: Quadrant;
  provenance?: { source_status?: string; source?: string };
};

function applyTaskFieldPatch(existing: Record<string, unknown>, fields: TaskFieldPatch): Record<string, unknown> {
  const next = { ...existing };
  const assign = (key: string, value: unknown): void => {
    if (value !== undefined) next[key] = value;
  };
  assign('status', fields.status);
  assign('due', fields.due);
  assign('target', fields.target);
  assign('scheduled', fields.scheduled);
  assign('follow_up', fields.follow_up);
  assign('priority', fields.priority);
  assign('importance', fields.importance);
  assign('project_id', fields.project_id);
  assign('effort_min', fields.effort_min);
  if (fields.quadrant_override !== undefined) {
    next.quadrant_override = stampOverride(fields.quadrant_override);
  }
  if (fields.provenance !== undefined) {
    const prior =
      typeof next.provenance === 'object' && next.provenance !== null
        ? (next.provenance as Record<string, unknown>)
        : {};
    next.provenance = { ...prior, ...fields.provenance };
    if (fields.provenance.source_status) next.source_status = fields.provenance.source_status;
  }
  return next;
}

function assertTaskProps(props: Record<string, unknown>): Record<string, unknown> {
  const parsed = propsSchemaFor('task').safeParse(props);
  if (!parsed.success) throw new ValidationError('invalid task', zodIssues(parsed.error.issues));
  return parsed.data as Record<string, unknown>;
}

async function requireTask(
  tx: Tx,
  id: string,
  opts: { includeDeleted?: boolean; forUpdate?: boolean } = {},
): Promise<NodeRecord> {
  const node = await repository.getNode(id, { includeDeleted: opts.includeDeleted, forUpdate: opts.forUpdate }, tx);
  if (!node || node.type !== 'task') productivityNotFound();
  return node;
}

async function stageTaskProps(
  tx: Tx,
  before: NodeRecord,
  props: Record<string, unknown>,
  extra: Record<string, unknown>,
  meta: WriteMeta,
): Promise<NodeRecord> {
  return repository.stageNodeUpdate(tx, before, { ...extra, props: assertTaskProps(props) }, meta);
}

function durationSec(startedAt: string, endedAt?: string): number | undefined {
  if (!endedAt) return undefined;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(0, Math.round(ms / 1000));
}

function liveWaitingOnFrom(edges: readonly EdgeRecord[], src: string): EdgeRecord[] {
  return edges.filter(
    (edge) => edge.type === 'WAITING_ON' && edge.src === src && !edge.deleted_at,
  );
}

async function dropWaitingOnEdges(tx: Tx, src: string, write: WriteMeta): Promise<void> {
  const edges = liveWaitingOnFrom(await repository.edgesForNodeTx(tx, src), src);
  const deletedAt = nowIso();
  for (const edge of edges) {
    await repository.stageEdgeUpdate(tx, edge, { deleted_at: deletedAt }, { ...write, op: 'delete' });
  }
}

async function applyCommand(tx: Tx, command: ProductivityCommand, actor: string | undefined): Promise<unknown> {
  const write = metaFrom(actor);

  switch (command.type) {
    case 'create_task': {
      const fields = command.payload;
      const props = assertTaskProps(
        applyTaskFieldPatch({ status: fields.status ?? 'inbox' }, fields),
      );
      const node = await repository.stageNode(
        tx,
        repository.parseNodeCreate({
          type: 'task',
          title: fields.title,
          notes_md: fields.notes_md,
          sensitivity: fields.sensitivity,
          props,
          source: 'manual',
        }),
        write,
      );
      return { task: node };
    }

    case 'update_task': {
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const fields = command.payload.patch;
      const extra: Record<string, unknown> = {};
      if (fields.title !== undefined) extra.title = fields.title;
      if (fields.notes_md !== undefined) extra.notes_md = fields.notes_md;
      if (fields.sensitivity !== undefined) extra.sensitivity = fields.sensitivity;
      const node = await stageTaskProps(tx, before, applyTaskFieldPatch(taskProps(before), fields), extra, write);
      return { task: node };
    }

    case 'complete_task': {
      // FR-PROD-005: stored recurrence is not spawned on complete.
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const node = await stageTaskProps(
        tx,
        before,
        { ...taskProps(before), status: 'done', completed_at: command.payload.completed_at ?? nowIso() },
        {},
        write,
      );
      return { task: node };
    }

    case 'drop_task': {
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const node = await stageTaskProps(tx, before, { ...taskProps(before), status: 'dropped' }, {}, write);
      return { task: node };
    }

    case 'restore_task': {
      const before = await requireTask(tx, command.payload.id, { includeDeleted: true, forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const status = command.payload.status ?? (taskStatus(before) === 'dropped' ? 'inbox' : taskStatus(before));
      const props: Record<string, unknown> = { ...taskProps(before), status };
      if (command.payload.clear_waiting) {
        delete props.waiting_on;
        delete props.waiting_since;
        delete props.waiting_patience_days;
        await dropWaitingOnEdges(tx, before.id, write);
      }
      const node = await repository.stageNodeUpdate(
        tx,
        before,
        {
          deleted_at: null,
          props: assertTaskProps(props),
        },
        { ...write, op: before.deleted_at ? 'restore' : 'update' },
      );
      return { task: node };
    }

    case 'reorder_tasks': {
      const updated: NodeRecord[] = [];
      for (const [index, id] of command.payload.ordered_ids.entries()) {
        const before = await requireTask(tx, id, { forUpdate: true });
        updated.push(
          await stageTaskProps(
            tx,
            before,
            {
              ...taskProps(before),
              sort_key: index,
              ...(command.payload.scope ? { sort_scope: command.payload.scope } : {}),
            },
            {},
            write,
          ),
        );
      }
      return { tasks: updated, ordered_ids: command.payload.ordered_ids };
    }

    case 'wait_on_task': {
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const target = await repository.getNode(command.payload.waiting_on_id, {}, tx);
      if (!target || (target.type !== 'person' && target.type !== 'organization')) {
        productivityNotFound();
      }
      const waitingSince = command.payload.waiting_since ?? todayIso();
      const props: Record<string, unknown> = {
        ...taskProps(before),
        status: 'waiting',
        waiting_on: target.id,
        waiting_since: waitingSince,
      };
      if (command.payload.waiting_patience_days !== undefined) {
        props.waiting_patience_days = command.payload.waiting_patience_days;
      }
      const node = await stageTaskProps(tx, before, props, {}, write);
      const existing = liveWaitingOnFrom(await repository.edgesForNodeTx(tx, node.id), node.id);
      const [keep, ...extras] = existing;
      const deletedAt = nowIso();
      for (const extra of extras) {
        await repository.stageEdgeUpdate(tx, extra, { deleted_at: deletedAt }, { ...write, op: 'delete' });
      }
      let edge;
      if (!keep) {
        const edgeInput: EdgeCreateInput = repository.parseEdgeCreate({
          type: 'WAITING_ON',
          src: node.id,
          dst: target.id,
          props: {},
          source: 'manual',
        });
        edge = await repository.stageEdge(tx, edgeInput, write);
      } else if (keep.dst !== target.id) {
        edge = await repository.stageEdgeUpdate(tx, keep, { dst: target.id }, write);
      } else {
        edge = keep;
      }
      return { task: node, edge };
    }

    case 'follow_up_task': {
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const node = await stageTaskProps(
        tx,
        before,
        { ...taskProps(before), follow_up: command.payload.follow_up },
        {},
        write,
      );
      return { task: node };
    }

    case 'add_time_entry': {
      const task = await requireTask(tx, command.payload.item_id);
      const entry = await repository.stageTimeEntry(
        tx,
        {
          task_id: task.id,
          started_at: command.payload.started_at,
          ended_at: command.payload.ended_at,
          duration_sec: durationSec(command.payload.started_at, command.payload.ended_at),
          source: command.payload.source,
        },
        write,
      );
      return { time_entry: entry };
    }

    case 'update_time_entry': {
      const before = await repository.getTimeEntry(command.payload.id, { includeDeleted: true }, tx);
      if (!before) productivityNotFound();
      await requireTask(tx, before.task_id);
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const started_at = command.payload.started_at ?? before.started_at;
      const ended_at = command.payload.ended_at ?? before.ended_at;
      const patch: TimeEntryPatch = {
        started_at,
        ended_at,
        duration_sec: durationSec(started_at, ended_at),
      };
      if (command.payload.note !== undefined) patch.note = command.payload.note;
      const entry = await repository.stageTimeEntryUpdate(tx, before, patch, {
        ...write,
        expected_revision: command.expected_revision,
      });
      return { time_entry: entry };
    }

    case 'set_recurrence': {
      const before = await requireTask(tx, command.payload.id, { forUpdate: true });
      repository.assertExpectedRevision(before.rev, command.expected_revision);
      const next = { ...taskProps(before) };
      if (command.payload.recurrence === null) delete next.recurrence;
      else next.recurrence = command.payload.recurrence;
      const node = await stageTaskProps(tx, before, next, {}, write);
      return { task: node };
    }

    case 'upsert_rule': {
      // FR-PROD-005: rules persist; evaluateRule is not called on this write path.
      const payload = command.payload;
      const writeValue: AutomationRuleWrite = {
        id: payload.id,
        name: payload.name,
        statement: payload.statement,
        enabled: payload.enabled,
        condition: payload.condition,
        actions: payload.actions,
        sort_order: payload.sort_order,
      };
      if (payload.id) {
        const existing = await repository.getAutomationRule(payload.id, { includeDeleted: true }, tx);
        if (existing) {
          const rule = await repository.stageAutomationRuleUpdate(
            tx,
            existing,
            {
              name: payload.name,
              statement: payload.statement,
              enabled: payload.enabled,
              condition: payload.condition,
              actions: payload.actions,
              sort_order: payload.sort_order,
            },
            { ...write, expected_revision: command.expected_revision },
          );
          return { rule };
        }
      }
      const rule = await repository.stageAutomationRule(tx, writeValue, write);
      return { rule };
    }

    case 'upsert_template': {
      const template = await repository.stageProductivityTemplate(
        tx,
        {
          id: command.payload.id,
          name: command.payload.name,
          description: command.payload.description,
          kind: command.payload.kind,
          body: command.payload.body,
        },
        { ...write, expected_revision: command.expected_revision },
      );
      return { template };
    }
  }
}

export function parseProductivityCommand(body: unknown): ProductivityCommand {
  const parsed = productivityCommandSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('invalid command', zodIssues(parsed.error.issues));
  return parsed.data;
}

export async function executeProductivityCommand(
  body: unknown,
  actor: string | undefined,
): Promise<CommandOutcome> {
  const command = parseProductivityCommand(body);

  try {
    const outcome = await repository.transaction(async (tx) => {
      const existing = await repository.getProductivityReceiptByOperationId(command.operation_id, tx, {
        forUpdate: true,
      });
      if (existing) return { replayed: true, result: existing.result };

      const result = await applyCommand(tx, command, actor);
      await repository.stageProductivityReceipt(
        tx,
        {
          operation_id: command.operation_id,
          command_type: command.type,
          result,
        },
        metaFrom(actor),
      );
      return { replayed: false, result };
    });

    if (!outcome.replayed) searchIndex.markDirty();
    return outcome;
  } catch (err) {
    if (err instanceof HttpError || err instanceof ValidationError || err instanceof RevisionConflictError || err instanceof NotFoundError) {
      throw err;
    }
    if (isUniqueViolation(err)) {
      const existing = await repository.getProductivityReceiptByOperationId(command.operation_id);
      if (existing) return { replayed: true, result: existing.result };
    }
    throw err;
  }
}
