/**
 * Display words and factual placement copy. Quadrant colour is a hint;
 * the word and the reason sentence carry the meaning.
 */
import type { Quadrant, ReasonKey, ReasonParams, TaskReadModel, VitaeTaskStatus } from '@vitae/core';

export const QUADRANT_ORDER = ['do', 'schedule', 'delegate', 'eliminate'] as const satisfies readonly Quadrant[];

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  do: 'Do',
  schedule: 'Schedule',
  delegate: 'Delegate',
  eliminate: 'Eliminate',
};

export const STATUS_LABEL: Record<VitaeTaskStatus, string> = {
  inbox: 'Inbox',
  next: 'Next',
  doing: 'Doing',
  waiting: 'Waiting',
  done: 'Done',
  dropped: 'Dropped',
};

function paramText(params: ReasonParams, key: string): string | undefined {
  const value = params[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Short factual sentence for a ReasonKey. Params are interpolated only when
 * they are already on the placement; no scores are invented.
 */
export function reasonSentence(reason: ReasonKey, params: ReasonParams = {}): string {
  switch (reason) {
    case 'due_within_window': {
      const due = paramText(params, 'due');
      return due
        ? `Due on ${due}, which is inside the urgency window.`
        : 'The due date is inside the urgency window.';
    }
    case 'due_past': {
      const due = paramText(params, 'due');
      return due ? `The due date ${due} has passed.` : 'The due date has passed.';
    }
    case 'target_within_window': {
      const target = paramText(params, 'target');
      return target
        ? `Target ${target} is inside the urgency window.`
        : 'The target date is inside the urgency window.';
    }
    case 'target_past': {
      const target = paramText(params, 'target');
      return target ? `The target date ${target} has passed.` : 'The target date has passed.';
    }
    case 'follow_up_due': {
      const followUp = paramText(params, 'follow_up');
      return followUp
        ? `The follow-up date ${followUp} has been reached.`
        : 'The follow-up date has been reached.';
    }
    case 'waiting_patience_exceeded': {
      const person = paramText(params, 'person');
      return person
        ? `Waiting on ${person} has exceeded the patience window.`
        : 'Waiting has exceeded the patience window.';
    }
    case 'stage_patience_exceeded':
      return 'Time in this stage has exceeded the patience window.';
    case 'importance_asserted': {
      const importance = paramText(params, 'importance');
      return importance
        ? `Importance is set to ${importance}.`
        : 'Importance is asserted on this item.';
    }
    case 'project_default': {
      const project = paramText(params, 'project');
      return project
        ? `Project ${project} places this item here by default.`
        : 'The project places this item here by default.';
    }
    case 'serves_goal': {
      const goal = paramText(params, 'goal');
      return goal ? `This item serves the goal ${goal}.` : 'This item serves a goal.';
    }
    case 'placed_by_you':
      return 'You placed this item here.';
    case 'no_signal':
      return 'No date or importance signal placed this item.';
  }
}

export function quadrantOf(task: TaskReadModel): Quadrant {
  return task.placement?.quadrant ?? task.quadrant ?? 'eliminate';
}

export function reasonOf(task: TaskReadModel): { reason: ReasonKey; params: ReasonParams } {
  if (task.placement) {
    return { reason: task.placement.reason, params: task.placement.params ?? {} };
  }
  return { reason: 'no_signal', params: {} };
}

export function placementCopy(task: TaskReadModel): string {
  const { reason, params } = reasonOf(task);
  return reasonSentence(reason, params);
}

export function todayDateOnly(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
