/**
 * Screen-facing writes. Remembers the last successful command so Undo can
 * send a compensating command with `expected_revision` from the canonical result.
 */
import { useCallback, useRef, useState } from 'react';
import type { ProductivityCommand, TaskReadModel } from '@vitae/core';
import { useQueryClient } from '@tanstack/react-query';
import { useProductivityCommand } from './api.js';
import { ApiError } from '../../lib/api.js';
import {
  addTimeEntryCommand,
  captureRecurrence,
  captureToCreateCommand,
  completeTaskCommand,
  dropTaskCommand,
  followUpTaskCommand,
  setRecurrenceCommand,
  templateToCreateCommand,
  updateTaskCommand,
  updateTimeEntryCommand,
  upsertRuleCommand,
  upsertTemplateCommand,
  waitOnTaskCommand,
} from './commands.js';
import { productivityKeys } from './query-keys.js';

export type UndoSpec = Pick<ProductivityCommand, 'type' | 'payload'>;

export function useProductivityActions() {
  const command = useProductivityCommand();
  const qc = useQueryClient();
  const [lastUndo, setLastUndo] = useState<{ taskId?: string; spec: UndoSpec } | null>(null);
  const inFlight = useRef(false);
  const retry = useRef<{ signature: string; command: ProductivityCommand } | null>(null);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);

  const run = useCallback(
    async (next: ProductivityCommand, undo?: { taskId?: string; spec: UndoSpec }) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      const signature = JSON.stringify({
        type: next.type,
        payload: next.payload,
        expected_revision: next.expected_revision,
      });
      const attempt = retry.current?.signature === signature ? retry.current.command : next;
      try {
        const outcome = await command.mutateAsync(attempt);
        retry.current = null;
        setLastUndo(undo ?? null);
        return outcome;
      } catch (error) {
        // The response may be lost after commit. Reuse the operation ID for
        // an unchanged retry; a confirmed client rejection is a new attempt.
        retry.current =
          !(error instanceof ApiError) || error.status >= 500
            ? { signature, command: attempt }
            : null;
        // Conflict and write-lock stay on the command hook. A rejected click
        // must not become an unhandled promise.
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [command],
  );

  const complete = useCallback(
    (task: TaskReadModel) =>
      run(completeTaskCommand(task.id, task.rev), {
        taskId: task.id,
        spec: { type: 'restore_task', payload: { id: task.id, status: task.status } },
      }),
    [run],
  );

  const drop = useCallback(
    (task: TaskReadModel) =>
      run(dropTaskCommand(task.id, task.rev), {
        taskId: task.id,
        spec: { type: 'restore_task', payload: { id: task.id, status: task.status } },
      }),
    [run],
  );

  const waitOn = useCallback(
    (task: TaskReadModel, waitingOnId: string) =>
      run(waitOnTaskCommand(task.id, waitingOnId, task.rev), {
        taskId: task.id,
        spec: {
          type: 'restore_task',
          payload: { id: task.id, status: task.status, clear_waiting: true },
        },
      }),
    [run],
  );

  const followUp = useCallback(
    (task: TaskReadModel, follow_up: string) =>
      run(
        followUpTaskCommand(task.id, follow_up, task.rev),
        task.follow_up
          ? {
              taskId: task.id,
              spec: {
                type: 'update_task',
                payload: { id: task.id, patch: { follow_up: task.follow_up } },
              },
            }
          : undefined,
      ),
    [run],
  );

  const createFromCapture = useCallback(
    async (text: string) => {
      setCaptureWarning(null);
      const create = captureToCreateCommand(text);
      if (!create) return null;
      const outcome = await run(create);
      if (!outcome) return null;
      const createdId = outcome.result.task?.id;
      const recurrence = captureRecurrence(text);
      if (createdId && recurrence) {
        const node = outcome.result.task;
        const rev = typeof node?.rev === 'number' ? node.rev : 0;
        const repeated = await run(setRecurrenceCommand(createdId, recurrence, rev));
        if (!repeated)
          setCaptureWarning(
            'Task created, but its repeat rule could not be saved. Open the task to add the rule; do not capture it again.',
          );
      }
      await qc.invalidateQueries({ queryKey: productivityKeys.tasks() });
      if (createdId) {
        setLastUndo({
          taskId: createdId,
          spec: { type: 'drop_task', payload: { id: createdId } },
        });
      }
      return outcome;
    },
    [qc, run],
  );

  const applyTemplate = useCallback(
    async (body: Record<string, unknown>, fallbackTitle: string) => {
      const create = templateToCreateCommand(body, fallbackTitle);
      if (!create) return null;
      const outcome = await run(create);
      if (!outcome) return null;
      await qc.invalidateQueries({ queryKey: productivityKeys.tasks() });
      return outcome;
    },
    [qc, run],
  );

  const update = useCallback(
    (
      task: TaskReadModel,
      patch: Extract<ProductivityCommand, { type: 'update_task' }>['payload']['patch'],
    ) => {
      const previous = {
        title: task.title,
        due: task.due,
        target: task.target,
        priority: task.priority,
        importance: task.importance,
        follow_up: task.follow_up,
      };
      // Optional fields cannot be cleared by update_task. Do not promise an
      // inverse if any newly supplied value had no stored value to restore.
      const reversible = Object.entries(patch).every(
        ([key, value]) =>
          value === undefined ||
          (key in previous && previous[key as keyof typeof previous] !== undefined),
      );
      return run(
        updateTaskCommand(task.id, patch, task.rev),
        reversible
          ? {
              taskId: task.id,
              spec: {
                type: 'update_task',
                payload: {
                  id: task.id,
                  patch: previous,
                },
              },
            }
          : undefined,
      );
    },
    [run],
  );

  const setRecurrence = useCallback(
    (
      task: TaskReadModel,
      recurrence: Parameters<typeof setRecurrenceCommand>[1],
      expected_revision?: number,
    ) => run(setRecurrenceCommand(task.id, recurrence, expected_revision ?? task.rev)),
    [run],
  );

  const addTimeEntry = useCallback(
    (taskId: string, startedAt: string, endedAt?: string) =>
      run(addTimeEntryCommand(taskId, startedAt, endedAt)),
    [run],
  );

  const updateTimeEntry = useCallback(
    (entryId: string, endedAt: string) => run(updateTimeEntryCommand(entryId, endedAt)),
    [run],
  );

  const upsertRule = useCallback(
    (
      payload: Extract<ProductivityCommand, { type: 'upsert_rule' }>['payload'],
      expected_revision?: number,
    ) => run(upsertRuleCommand(payload, expected_revision)),
    [run],
  );

  const upsertTemplate = useCallback(
    (
      payload: Extract<ProductivityCommand, { type: 'upsert_template' }>['payload'],
      expected_revision?: number,
    ) => run(upsertTemplateCommand(payload, expected_revision)),
    [run],
  );

  const undoLast = useCallback(async () => {
    if (!lastUndo || inFlight.current) return;
    inFlight.current = true;
    const spec = lastUndo.spec;
    try {
      await command.undo({
        version: 1,
        operation_id: crypto.randomUUID?.() ?? `undo-${Date.now()}`,
        ...spec,
      } as ProductivityCommand);
      setLastUndo(null);
    } catch {
      return;
    } finally {
      inFlight.current = false;
    }
  }, [command, lastUndo]);

  const locked = Boolean(command.writeLock) || command.isPending;

  return {
    ...command,
    captureWarning,
    locked,
    lastUndo,
    complete,
    drop,
    waitOn,
    followUp,
    createFromCapture,
    applyTemplate,
    update,
    setRecurrence,
    addTimeEntry,
    updateTimeEntry,
    upsertRule,
    upsertTemplate,
    undoLast,
  };
}
