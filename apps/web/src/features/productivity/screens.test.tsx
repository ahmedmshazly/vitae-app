/**
 * Matrix, waiting, rules, templates, undo, conflict, and read-only writes.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaskReadModel } from '@vitae/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api.js';
import { createTestAuth, renderWithApp } from '../../test/render.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { AutomationScreen } from './AutomationScreen.js';
import { TasksScreen } from './TasksScreen.js';
import { TemplatesScreen } from './TemplatesScreen.js';
import { WaitingScreen } from './WaitingScreen.js';

const flag = vi.hoisted(() => ({ enabled: true }));
const write = vi.hoisted(() => ({ canWrite: true }));

vi.mock('../../lib/productivity-flag.js', () => ({
  isProductivityEnabled: () => flag.enabled,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

vi.mock('../../lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => createTestAuth(),
  hasSessionHint: () => false,
  useCanWrite: () => write.canWrite,
  WRITE_LOCK_HINT: 'Read-only workspace: saving is paused.',
}));

function task(over: Partial<TaskReadModel> = {}): TaskReadModel {
  return {
    id: 'task-1',
    title: 'Write the brief',
    status: 'next',
    rev: 1,
    placement: {
      quadrant: 'do',
      reason: 'due_within_window',
      params: { due: '2026-09-12' },
    },
    ...over,
  };
}

function nodeResult(id: string, title: string, status: string, rev: number) {
  return {
    id,
    type: 'task',
    title,
    props: { status },
    rev,
  };
}

function serve(replies: {
  tasks?: TaskReadModel[];
  waiting?: TaskReadModel[];
  rules?: unknown[];
  templates?: unknown[];
  time_entries?: Array<{ id: string; task_id: string; started_at: string; ended_at?: string; rev: number; updated_at: string }>;
  node?: { props?: Record<string, unknown> };
} = {}) {
  mockApi.get.mockImplementation(async (path: string) => {
    const url = String(path);
    if (url.startsWith('/productivity/tasks')) return { tasks: replies.tasks ?? [] };
    if (url.startsWith('/productivity/waiting')) return { tasks: replies.waiting ?? [] };
    if (url.startsWith('/productivity/rules')) return { rules: replies.rules ?? [] };
    if (url.startsWith('/productivity/templates')) return { templates: replies.templates ?? [] };
    if (url.startsWith('/productivity/time-entries')) return { time_entries: replies.time_entries ?? [] };
    if (url.startsWith('/views')) return { views: [] };
    if (url.startsWith('/nodes/')) {
      return { node: { id: 'task-1', props: replies.node?.props ?? {} }, edges: [], neighbors: {} };
    }
    if (url.startsWith('/nodes')) return { nodes: [], edges: [], neighbors: {} };
    return {};
  });
}

beforeEach(() => {
  flag.enabled = true;
  write.canWrite = true;
  resetMockApi();
  serve();
});

describe('tasks matrix and list', () => {
  it('renders four quadrant words and a reason sentence', async () => {
    serve({
      tasks: [
        task({ id: 'a', title: 'Call Ada', placement: { quadrant: 'do', reason: 'due_past', params: { due: '2026-09-01' } } }),
        task({
          id: 'b',
          title: 'Plan the week',
          placement: { quadrant: 'schedule', reason: 'target_within_window', params: { target: '2026-09-14' } },
        }),
        task({
          id: 'c',
          title: 'Ask Sam',
          placement: { quadrant: 'delegate', reason: 'importance_asserted', params: { importance: 'important' } },
        }),
        task({
          id: 'd',
          title: 'Drop the extra tab',
          placement: { quadrant: 'eliminate', reason: 'no_signal', params: {} },
        }),
      ],
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Matrix' }));
    expect(screen.getByRole('region', { name: 'Do' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Delegate' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Eliminate' })).toBeInTheDocument();
    expect(screen.getByText('The due date 2026-09-01 has passed.')).toBeInTheDocument();
    expect(screen.getByText('No date or importance signal placed this item.')).toBeInTheDocument();
  });
});

describe('complete undo and conflict', () => {
  it('complete then undo sends restore with expected_revision', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockImplementation(async (_path: string, body: { type: string; payload: { id: string } }) => {
      if (body.type === 'complete_task') {
        return { replayed: false, result: { task: nodeResult(body.payload.id, 'Write the brief', 'done', 2) } };
      }
      return { replayed: false, result: { task: nodeResult(body.payload.id, 'Write the brief', 'next', 3) } };
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('Write the brief');
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(2);
    });
    const undo = mockApi.post.mock.calls[1]?.[1] as { type: string; expected_revision?: number; payload: { id: string } };
    expect(undo.type).toBe('restore_task');
    expect(undo.expected_revision).toBe(2);
    expect(undo.payload.id).toBe('task-1');
  });

  it('shows a conflict on 409 and does not keep the optimistic complete', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'revision conflict'));
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('Write the brief');
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(await screen.findByText('revision conflict')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it('disables writes on a locked workspace and does not post', async () => {
    write.canWrite = false;
    serve({ tasks: [task()] });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('Write the brief');
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    expect(screen.getByText('Read-only workspace: saving is paused.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});

describe('waiting', () => {
  it('shows waiting status text and the follow-up date', async () => {
    serve({
      waiting: [
        task({
          id: 'wait-1',
          title: 'Hear back from Sam',
          status: 'waiting',
          follow_up: '2026-09-20',
        }),
      ],
    });
    renderWithApp(<WaitingScreen />, { route: '/today/waiting' });
    const row = await screen.findByText('Hear back from Sam');
    expect(row.closest('li')).toHaveTextContent('Waiting');
    expect(row.closest('li')).toHaveTextContent('Follow-up 2026-09-20');
  });
});

describe('rules and templates', () => {
  it('creates a rule through upsert_rule', async () => {
    serve({ rules: [] });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: {
        rule: {
          id: 'rule-1',
          name: 'Promote brief',
          statement: 'When the title mentions brief, move it to next.',
          enabled: true,
          condition: {},
          actions: [],
          rev: 1,
          updated_at: '2026-09-11T00:00:00.000Z',
        },
      },
    });
    renderWithApp(<AutomationScreen />, { route: '/today/automation' });
    await screen.findByText('No rules yet');
    await userEvent.type(screen.getByLabelText('Rule name'), 'Promote brief');
    await userEvent.type(screen.getByLabelText('Statement'), 'When the title mentions brief, move it to next.');
    await userEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    const body = mockApi.post.mock.calls[0]?.[1] as { type: string; payload: { name: string } };
    expect(body.type).toBe('upsert_rule');
    expect(body.payload.name).toBe('Promote brief');
  });

  it('creates a template through upsert_template', async () => {
    serve({ templates: [] });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: {
        template: {
          id: 'tpl-1',
          name: 'Weekly review',
          kind: 'item',
          body: { title: 'Weekly review' },
          rev: 1,
          created_at: '2026-09-11T00:00:00.000Z',
          updated_at: '2026-09-11T00:00:00.000Z',
        },
      },
    });
    renderWithApp(<TemplatesScreen />, { route: '/today/task-templates' });
    await screen.findByText('No templates yet');
    await userEvent.type(screen.getByLabelText('Template name'), 'Weekly review');
    await userEvent.click(screen.getByRole('button', { name: 'Create template' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    const body = mockApi.post.mock.calls[0]?.[1] as { type: string; payload: { name: string } };
    expect(body.type).toBe('upsert_template');
    expect(body.payload.name).toBe('Weekly review');
  });
});

describe('query states', () => {
  it('shows an error state for a failed task list', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/tasks')) throw new Error('offline');
      return { views: [], nodes: [], time_entries: [] };
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load tasks");
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('task detail save recurrence and focus', () => {
  it('saves title plus rrule without posting set_recurrence at the stale rev', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockImplementation(async (_path: string, body: { type: string; payload: { id?: string; patch?: { title?: string } } }) => {
      if (body.type === 'update_task') {
        return {
          replayed: false,
          result: { task: nodeResult(body.payload.id ?? 'task-1', body.payload.patch?.title ?? 'Renamed', 'next', 2) },
        };
      }
      return {
        replayed: false,
        result: { task: nodeResult('task-1', 'Renamed', 'next', 3) },
      };
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    const titleField = await screen.findByLabelText('Title');
    await userEvent.clear(titleField);
    await userEvent.type(titleField, 'Renamed');
    await userEvent.type(screen.getByLabelText('Recurrence (rrule)'), 'FREQ=WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.post.mock.calls.length).toBeGreaterThanOrEqual(2));
    const posted = mockApi.post.mock.calls.map((call) => call[1] as { type: string; expected_revision?: number });
    expect(posted[0]?.type).toBe('update_task');
    expect(posted[0]?.expected_revision).toBe(1);
    const recur = posted.find((row) => row.type === 'set_recurrence');
    expect(recur).toBeDefined();
    expect(recur?.expected_revision).toBe(2);
    expect(recur?.expected_revision).not.toBe(1);
  });

  it('skips set_recurrence when the rrule did not change', async () => {
    serve({
      tasks: [task()],
      node: { props: { recurrence: { rrule: 'FREQ=DAILY', mode: 'fixed', exceptions: [] } } },
    });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: { task: nodeResult('task-1', 'Renamed', 'next', 2) },
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    const titleField = await screen.findByLabelText('Title');
    await waitFor(() => expect(screen.getByLabelText('Recurrence (rrule)')).toHaveValue('FREQ=DAILY'));
    await userEvent.clear(titleField);
    await userEvent.type(titleField, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    const posted = mockApi.post.mock.calls.map((call) => (call[1] as { type: string }).type);
    expect(posted).toEqual(['update_task']);
  });

  it('returns focus to the title button that opened the sheet', async () => {
    serve({ tasks: [task()] });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    const opener = await screen.findByRole('button', { name: 'Write the brief' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Write the brief' });
    await userEvent.click(within(dialog).getByText('Close'));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe('timer list', () => {
  it('does not list a superseded open row after stop', async () => {
    const started = '2026-09-11T08:00:00.000Z';
    serve({
      tasks: [task()],
      time_entries: [
        {
          id: 'open-1',
          task_id: 'task-1',
          started_at: started,
          rev: 1,
          updated_at: started,
        },
      ],
    });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: {
        time_entry: {
          id: 'closed-1',
          task_id: 'task-1',
          started_at: started,
          ended_at: '2026-09-11T08:10:00.000Z',
          rev: 2,
          updated_at: '2026-09-11T08:10:00.000Z',
        },
      },
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    await screen.findByText('Timer running.');
    expect(screen.getByText(/\(open\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop timer' }));
    await waitFor(() => expect(screen.getByText('Timer stopped.')).toBeInTheDocument());
    expect(screen.queryByText(/\(open\)/)).not.toBeInTheDocument();
  });
});

describe('unused within helper', () => {
  it('keeps the matrix region named by its word', async () => {
    serve({ tasks: [task()] });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Matrix' }));
    expect(within(screen.getByRole('region', { name: 'Do' })).getByText('Write the brief')).toBeInTheDocument();
  });
});
