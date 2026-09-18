/**
 * Matrix, waiting, rules, templates, undo, conflict, and read-only writes.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
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
import { productivityKeys } from './query-keys.js';

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

function serve(
  replies: {
    tasks?: TaskReadModel[];
    waiting?: TaskReadModel[];
    rules?: unknown[];
    templates?: unknown[];
    time_entries?: Array<{
      id: string;
      task_id: string;
      started_at: string;
      ended_at?: string;
      rev: number;
      updated_at: string;
    }>;
    node?: { props?: Record<string, unknown> };
  } = {},
) {
  mockApi.get.mockImplementation(async (path: string) => {
    const url = String(path);
    if (url.startsWith('/productivity/tasks')) return { tasks: replies.tasks ?? [] };
    if (url.startsWith('/productivity/waiting')) return { tasks: replies.waiting ?? [] };
    if (url.startsWith('/productivity/rules')) return { rules: replies.rules ?? [] };
    if (url.startsWith('/productivity/templates')) return { templates: replies.templates ?? [] };
    if (url.startsWith('/productivity/time-entries'))
      return { time_entries: replies.time_entries ?? [] };
    if (url.startsWith('/views')) return { views: [] };
    if (url.startsWith('/search/switch'))
      return { results: [{ id: 'person-sam', title: 'Sam', type: 'person' }] };
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
        task({
          id: 'a',
          title: 'Call Ada',
          placement: { quadrant: 'do', reason: 'due_past', params: { due: '2026-09-01' } },
        }),
        task({
          id: 'b',
          title: 'Plan the week',
          placement: {
            quadrant: 'schedule',
            reason: 'target_within_window',
            params: { target: '2026-09-14' },
          },
        }),
        task({
          id: 'c',
          title: 'Ask Sam',
          placement: {
            quadrant: 'delegate',
            reason: 'importance_asserted',
            params: { importance: 'important' },
          },
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
    mockApi.post.mockImplementation(
      async (_path: string, body: { type: string; payload: { id: string } }) => {
        if (body.type === 'complete_task') {
          return {
            replayed: false,
            result: { task: nodeResult(body.payload.id, 'Write the brief', 'done', 2) },
          };
        }
        return {
          replayed: false,
          result: { task: nodeResult(body.payload.id, 'Write the brief', 'next', 3) },
        };
      },
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('Write the brief');
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(2);
    });
    const undo = mockApi.post.mock.calls[1]?.[1] as {
      type: string;
      expected_revision?: number;
      payload: { id: string };
    };
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
    await waitFor(() => expect(row.closest('li')).toHaveTextContent('Waiting'));
    expect(row.closest('li')).toHaveTextContent('Follow-up 2026-09-20');
  });

  it('wait then undo sends restore with clear_waiting', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockImplementation(
      async (_path: string, body: { type: string; payload: { id: string } }) => {
        if (body.type === 'wait_on_task') {
          return {
            replayed: false,
            result: { task: nodeResult(body.payload.id, 'Write the brief', 'waiting', 2) },
          };
        }
        return {
          replayed: false,
          result: { task: nodeResult(body.payload.id, 'Write the brief', 'next', 3) },
        };
      },
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('Write the brief');
    await userEvent.click(screen.getByRole('button', { name: 'Wait' }));
    await userEvent.type(screen.getByRole('combobox'), 'Sam');
    await userEvent.click(await screen.findByRole('option', { name: /Sam person/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm wait' }));
    await waitFor(() => expect(screen.getByText('Waiting')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(2);
    });
    const undo = mockApi.post.mock.calls[1]?.[1] as {
      type: string;
      expected_revision?: number;
      payload: { id: string; clear_waiting?: boolean; status?: string };
    };
    expect(undo.type).toBe('restore_task');
    expect(undo.expected_revision).toBe(2);
    expect(undo.payload).toMatchObject({ id: 'task-1', status: 'next', clear_waiting: true });
  });

  it('keeps the wait draft open after a rejected command so it can be retried', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'Someone else changed this task.'),
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Wait' }));
    await userEvent.type(screen.getByRole('combobox'), 'Sam');
    await userEvent.click(await screen.findByRole('option', { name: /Sam person/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm wait' }));

    expect(
      await within(screen.getByRole('dialog', { name: 'Wait on someone' })).findByText(
        'Someone else changed this task.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Wait on someone' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Wait on someone' })).getByText('Sam'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm wait' })).toBeEnabled();
  });
});

describe('rules and templates', () => {
  const storedRule = {
    id: 'rule-complex',
    name: 'Research workflow',
    statement: 'Keep complex conditions intact.',
    enabled: true,
    rev: 4,
    sort_order: 7,
    condition: {
      kind: 'all',
      conditions: [{ kind: 'predicate', field: 'title', operator: 'contains', value: 'research' }],
    },
    actions: [
      { field: 'status', value: 'next' },
      { field: 'importance', value: 'important' },
    ],
    updated_at: '2026-09-14T00:00:00Z',
  };

  it('edits metadata without replacing a complex definition or its order', async () => {
    serve({ rules: [storedRule] });
    mockApi.post.mockResolvedValue({ result: { rule: { ...storedRule, rev: 5 } } });
    const { queryClient } = renderWithApp(<AutomationScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Research workflow' }));
    await userEvent.clear(screen.getByLabelText('Rule name'));
    await userEvent.type(screen.getByLabelText('Rule name'), 'Updated research workflow');
    await act(async () => {
      queryClient.setQueryData(productivityKeys.rules(), {
        rules: [{ ...storedRule, name: 'Changed elsewhere', rev: 5 }],
      });
    });
    expect(screen.getByLabelText('Rule name')).toHaveValue('Updated research workflow');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    expect(mockApi.post.mock.calls[0]?.[1]).toMatchObject({
      expected_revision: 4,
      payload: {
        name: 'Updated research workflow',
        condition: storedRule.condition,
        actions: storedRule.actions,
        sort_order: 7,
      },
    });
  });

  it('validates advanced JSON and guards unsaved dismissal', async () => {
    serve({ rules: [storedRule] });
    renderWithApp(<AutomationScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Research workflow' }));
    await userEvent.clear(screen.getByLabelText('Condition JSON'));
    await userEvent.type(screen.getByLabelText('Condition JSON'), 'not JSON');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/definition must be valid JSON/)).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Condition JSON')).toHaveValue('not JSON');
  });

  it('reuses the operation ID for an unconfirmed rule save and retains its draft', async () => {
    serve({ rules: [storedRule] });
    mockApi.post
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ result: { rule: { ...storedRule, rev: 5 } } });
    renderWithApp(<AutomationScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Research workflow' }));
    await userEvent.type(screen.getByLabelText('Rule name'), ' revised');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Rule was not saved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    expect(mockApi.post.mock.calls[0]?.[1]).toEqual(mockApi.post.mock.calls[1]?.[1]);
  });

  it('preserves a stored definition while toggling and blocks duplicate clicks', async () => {
    serve({ rules: [storedRule] });
    let resolve!: (value: unknown) => void;
    mockApi.post.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderWithApp(<AutomationScreen />);
    const button = await screen.findByRole('button', { name: 'Disable Research workflow' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post.mock.calls[0]?.[1]).toMatchObject({
      expected_revision: 4,
      payload: {
        enabled: false,
        condition: storedRule.condition,
        actions: storedRule.actions,
        sort_order: 7,
      },
    });
    await act(async () => resolve({ result: { rule: { ...storedRule, enabled: false, rev: 5 } } }));
    expect(await screen.findByText(/Research workflow disabled/)).toBeInTheDocument();
  });

  it('allows read-only inspection but no rule changes', async () => {
    write.canWrite = false;
    serve({ rules: [storedRule] });
    renderWithApp(<AutomationScreen />);
    expect(await screen.findByRole('button', { name: 'Disable Research workflow' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New rule' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Research workflow' }));
    expect(screen.getByLabelText('Condition JSON')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

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
    await userEvent.click(screen.getByRole('button', { name: 'New rule' }));
    await userEvent.type(screen.getByLabelText('Rule name'), 'Promote brief');
    await userEvent.type(screen.getByLabelText('When the title contains'), 'brief');
    await userEvent.type(
      screen.getByLabelText('Statement'),
      'When the title mentions brief, move it to next.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit advanced definition' }));
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Condition JSON')).toHaveValue(
      JSON.stringify(
        { kind: 'predicate', field: 'title', operator: 'contains', value: 'brief' },
        null,
        2,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    const body = mockApi.post.mock.calls[0]?.[1] as {
      type: string;
      payload: { name: string; condition: unknown; actions: unknown };
    };
    expect(body.type).toBe('upsert_rule');
    expect(body.payload.name).toBe('Promote brief');
    expect(body.payload.condition).toEqual({
      kind: 'predicate',
      field: 'title',
      operator: 'contains',
      value: 'brief',
    });
    expect(body.payload.actions).toEqual([{ field: 'status', value: 'next' }]);
    expect(screen.getByText(/Enabling a rule does not execute it/)).toBeInTheDocument();
  });

  it('keeps an automation draft available after a failed create', async () => {
    serve({ rules: [] });
    mockApi.post.mockRejectedValueOnce(new Error('offline'));
    renderWithApp(<AutomationScreen />, { route: '/today/automation' });
    await screen.findByText('No rules yet');
    await userEvent.click(screen.getByRole('button', { name: 'New rule' }));
    await userEvent.type(screen.getByLabelText('Rule name'), 'Promote brief');
    await userEvent.type(screen.getByLabelText('When the title contains'), 'brief');
    await userEvent.type(screen.getByLabelText('Statement'), 'Move brief work to next.');
    await userEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    expect(screen.getByLabelText('Rule name')).toHaveValue('Promote brief');
    expect(screen.getByLabelText('Statement')).toHaveValue('Move brief work to next.');
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
    await userEvent.click(screen.getByRole('button', { name: 'New template' }));
    await userEvent.type(screen.getByLabelText('Template name'), 'Weekly review');
    await userEvent.click(screen.getByRole('button', { name: 'Create template' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    const body = mockApi.post.mock.calls[0]?.[1] as { type: string; payload: { name: string } };
    expect(body.type).toBe('upsert_template');
    expect(body.payload.name).toBe('Weekly review');
  });
});

describe('template repair safeguards', () => {
  const template = {
    id: 'tpl-stored',
    name: 'Weekly research',
    description: 'Coordinate findings',
    kind: 'project',
    body: {
      title: 'Review research',
      status: 'next',
      priority: 'p2',
      notes_md: 'Preserve these notes',
      extra: { steps: ['Discuss', 'Summarize'] },
    },
    rev: 3,
  };

  it('preserves the stored body and revision during metadata edits and cache refreshes', async () => {
    serve({ templates: [template] });
    const { queryClient } = renderWithApp(<TemplatesScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Weekly research' }));
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.type(screen.getByLabelText('Description'), 'My draft');
    act(() =>
      queryClient.setQueryData(productivityKeys.templates(), {
        templates: [{ ...template, description: 'Newer server data', rev: 4 }],
      }),
    );
    expect(screen.getByLabelText('Description')).toHaveValue('My draft');
    mockApi.post.mockResolvedValue({ result: { template: { ...template, rev: 4 } } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    expect(mockApi.post.mock.calls[0]?.[1]).toMatchObject({
      type: 'upsert_template',
      expected_revision: 3,
      payload: { body: template.body, description: 'My draft', kind: 'project' },
    });
  });

  it('retains a failed create and retries the same operation', async () => {
    renderWithApp(<TemplatesScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'New template' }));
    await userEvent.type(screen.getByLabelText('Template name'), 'Interview');
    mockApi.post
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ result: { template: { id: 'tpl-created' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Create template' }));
    await screen.findByText('Template was not saved');
    expect(screen.getByLabelText('Template name')).toHaveValue('Interview');
    await userEvent.click(screen.getByRole('button', { name: 'Create template' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    expect(mockApi.post.mock.calls[0]?.[1]).toEqual(mockApi.post.mock.calls[1]?.[1]);
  });

  it('validates advanced bodies and guards dirty dismissal', async () => {
    serve({ templates: [template] });
    renderWithApp(<TemplatesScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Weekly research' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit advanced body' }));
    await userEvent.clear(screen.getByLabelText('Task body JSON'));
    await userEvent.type(screen.getByLabelText('Task body JSON'), 'null');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Enter a name and a JSON object for the task body.');
    expect(mockApi.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Task body JSON')).toHaveValue('null');
  });

  it('previews only applied fields and prevents duplicate task creation', async () => {
    serve({ templates: [template] });
    renderWithApp(<TemplatesScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use Weekly research' }));
    const dialog = screen.getByRole('dialog', { name: 'Create task from template' });
    expect(within(dialog).getByText('Review research')).toBeVisible();
    expect(within(dialog).queryByText('Preserve these notes')).not.toBeInTheDocument();
    let finish!: (value: unknown) => void;
    mockApi.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Create task' }));
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(mockApi.post.mock.calls[0]?.[1]).toMatchObject({
      type: 'create_task',
      payload: { title: 'Review research', status: 'next', priority: 'p2' },
    });
    await act(async () => finish({ result: { task: { id: 'task-created' } } }));
    expect(await screen.findByRole('link', { name: 'Open created task' })).toHaveAttribute(
      'href',
      '/n/task-created',
    );
  });

  it('blocks malformed applied dates while keeping the stored definition editable', async () => {
    serve({ templates: [{ ...template, body: { title: 'Review', due: 'yesterday' } }] });
    renderWithApp(<TemplatesScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use Weekly research' }));
    await screen.findByText('This task body needs repair');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('allows read-only inspection but blocks template and task writes', async () => {
    write.canWrite = false;
    serve({ templates: [template] });
    renderWithApp(<TemplatesScreen />);
    expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Use Weekly research' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Weekly research' }));
    expect(screen.getByLabelText('Template name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
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

describe('waiting follow-up repairs', () => {
  it('keeps draft dates when filters hide and reveal a task', async () => {
    serve({ waiting: [task({ status: 'waiting', follow_up: '2020-01-01' })] });
    renderWithApp(<WaitingScreen />, { route: '/today/waiting' });
    const input = await screen.findByLabelText('Follow-up date for Write the brief');
    await userEvent.clear(input);
    await userEvent.type(input, '2030-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.getByText('No matching waiting tasks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All waiting' }));
    expect(screen.getByLabelText('Follow-up date for Write the brief')).toHaveValue('2030-01-01');
  });

  it('shows contact lookup failure separately and retries it', async () => {
    serve({ waiting: [task({ status: 'waiting' })] });
    const original = mockApi.get.getMockImplementation()!;
    let failed = true;
    mockApi.get.mockImplementation((path: string) =>
      path === '/nodes/task-1'
        ? failed
          ? Promise.reject(new Error('Offline'))
          : Promise.resolve({
              edges: [{ type: 'WAITING_ON', src: 'task-1', dst: 'person-1' }],
              neighbors: { 'person-1': { id: 'person-1', title: 'Sam Rivera', type: 'person' } },
            })
        : original(path),
    );
    renderWithApp(<WaitingScreen />, { route: '/today/waiting' });
    expect(await screen.findByText(/Couldn't load who you're waiting on/)).toBeInTheDocument();
    expect(screen.queryByText(/No person or organization linked/)).not.toBeInTheDocument();
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry contact' }));
    expect(await screen.findByRole('link', { name: 'Sam Rivera' })).toHaveAttribute(
      'href',
      '/network/people/person-1',
    );
  });

  it('preserves an unconfirmed follow-up and uses the same operation on retry', async () => {
    serve({ waiting: [task({ status: 'waiting', follow_up: '2020-01-01' })] });
    mockApi.post.mockRejectedValueOnce(new TypeError('Connection lost')).mockResolvedValueOnce({
      replayed: true,
      result: {
        task: {
          ...nodeResult('task-1', 'Write the brief', 'waiting', 2),
          props: { status: 'waiting', follow_up: '2030-01-01' },
        },
      },
    });
    renderWithApp(<WaitingScreen />, { route: '/today/waiting?followup=due' });
    const input = await screen.findByLabelText('Follow-up date for Write the brief');
    await userEvent.clear(input);
    await userEvent.type(input, '2030-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Set follow-up' }));
    await screen.findByText('Follow-up was not confirmed');
    expect(await screen.findByLabelText('Follow-up date for Write the brief')).toHaveValue(
      '2030-01-01',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set follow-up' }));
    expect(await screen.findByText(/Follow-up saved for 2030-01-01/)).toBeInTheDocument();
    expect(screen.getByText('No matching waiting tasks')).toBeInTheDocument();
    expect(mockApi.post.mock.calls[0]?.[1]).toEqual(mockApi.post.mock.calls[1]?.[1]);
  });

  it('limits contact lookups to visible rows and loads more on demand', async () => {
    serve({
      waiting: Array.from({ length: 21 }, (_, index) =>
        task({ id: `wait-${index}`, title: `Waiting ${index}`, status: 'waiting' }),
      ),
    });
    renderWithApp(<WaitingScreen />, { route: '/today/waiting' });
    await screen.findByRole('button', { name: 'Show more waiting tasks (1 remaining)' });
    expect(screen.getAllByRole('button', { name: 'Set follow-up' })).toHaveLength(20);
    await waitFor(() =>
      expect(
        mockApi.get.mock.calls.filter((call) => String(call[0]).startsWith('/nodes/')),
      ).toHaveLength(20),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Show more waiting tasks (1 remaining)' }),
    );
    expect(screen.getAllByRole('button', { name: 'Set follow-up' })).toHaveLength(21);
  });
});

describe('task detail save recurrence and focus', () => {
  it('saves title plus rrule without posting set_recurrence at the stale rev', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockImplementation(
      async (
        _path: string,
        body: { type: string; payload: { id?: string; patch?: { title?: string } } },
      ) => {
        if (body.type === 'update_task') {
          return {
            replayed: false,
            result: {
              task: nodeResult(
                body.payload.id ?? 'task-1',
                body.payload.patch?.title ?? 'Renamed',
                'next',
                2,
              ),
            },
          };
        }
        return {
          replayed: false,
          result: { task: nodeResult('task-1', 'Renamed', 'next', 3) },
        };
      },
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    const titleField = await screen.findByLabelText('Title');
    await userEvent.clear(titleField);
    await userEvent.type(titleField, 'Renamed');
    await userEvent.type(screen.getByLabelText('Recurrence (rrule)'), 'FREQ=WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.post.mock.calls.length).toBeGreaterThanOrEqual(2));
    const posted = mockApi.post.mock.calls.map(
      (call) => call[1] as { type: string; expected_revision?: number },
    );
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
    await waitFor(() =>
      expect(screen.getByLabelText('Recurrence (rrule)')).toHaveValue('FREQ=DAILY'),
    );
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
          id: 'open-1',
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
    const stop = mockApi.post.mock.calls[0]?.[1] as {
      type: string;
      payload: { id: string; ended_at?: string };
    };
    expect(stop.type).toBe('update_time_entry');
    expect(stop.payload.id).toBe('open-1');
    expect(stop.payload.ended_at).toBeTruthy();
  });
});

describe('unused within helper', () => {
  it('keeps the matrix region named by its word', async () => {
    serve({ tasks: [task()] });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Matrix' }));
    expect(
      within(screen.getByRole('region', { name: 'Do' })).getByText('Write the brief'),
    ).toBeInTheDocument();
  });
});

describe('task repair safeguards', () => {
  it('does not offer an impossible Undo when setting a previously unset date', async () => {
    serve({ tasks: [task()] });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: {
        task: {
          ...nodeResult('task-1', 'Write the brief', 'next', 2),
          props: { status: 'next', due: '2026-09-20' },
        },
      },
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    const input = screen.getByLabelText('Due');
    await userEvent.type(input, '2026-09-20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Task saved.');
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Close', { exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
  it('preserves the next capture draft and blocks duplicate submissions while saving', async () => {
    let resolve!: (value: unknown) => void;
    mockApi.post.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    const input = screen.getByLabelText('Capture a task');
    await userEvent.type(input, 'First task');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Second task');
    await act(async () =>
      resolve({ replayed: false, result: { task: nodeResult('new', 'First task', 'inbox', 1) } }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled());
    expect(input).toHaveValue('Second task');
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it('reuses the operation ID after an unconfirmed capture response', async () => {
    mockApi.post.mockRejectedValueOnce(new TypeError('Connection lost')).mockResolvedValueOnce({
      replayed: true,
      result: { task: nodeResult('new', 'Only once', 'inbox', 1) },
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.type(screen.getByLabelText('Capture a task'), 'Only once');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText(/Change couldn't be confirmed/);
    expect(screen.getByLabelText('Capture a task')).toHaveValue('Only once');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    expect(mockApi.post.mock.calls[0]?.[1]).toEqual(mockApi.post.mock.calls[1]?.[1]);
  });

  it('does not overwrite an inspector draft when the cached task refreshes', async () => {
    serve({ tasks: [task()] });
    const { queryClient } = renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'My unsaved draft');
    act(() =>
      queryClient.setQueryData(productivityKeys.tasks(), {
        tasks: [task({ title: 'Changed elsewhere', rev: 8 })],
      }),
    );
    expect(screen.getByLabelText('Title')).toHaveValue('My unsaved draft');
    expect(await screen.findByText('This task changed')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Close', { exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('blocks unsupported date clearing rather than claiming a successful save', async () => {
    serve({ tasks: [task({ due: '2026-09-15' })] });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    await userEvent.clear(screen.getByLabelText('Due'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot clear stored dates');
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('preserves recurrence exceptions and can explicitly remove the rule', async () => {
    serve({
      tasks: [task()],
      node: {
        props: { recurrence: { rrule: 'FREQ=DAILY', mode: 'fixed', exceptions: ['2026-09-18'] } },
      },
    });
    mockApi.post.mockResolvedValue({
      replayed: false,
      result: { task: nodeResult('task-1', 'Write the brief', 'next', 2) },
    });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    const input = screen.getByLabelText('Recurrence (rrule)');
    await waitFor(() => expect(input).toHaveValue('FREQ=DAILY'));
    await userEvent.clear(input);
    await userEvent.type(input, 'FREQ=WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Task saved.');
    expect(mockApi.post.mock.calls[0]?.[1]).toMatchObject({
      type: 'set_recurrence',
      expected_revision: 1,
      payload: { recurrence: { rrule: 'FREQ=WEEKLY', exceptions: ['2026-09-18'] } },
    });
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    expect(mockApi.post.mock.calls[1]?.[1]).toMatchObject({
      type: 'set_recurrence',
      expected_revision: 2,
      payload: { recurrence: null },
    });
  });

  it('keeps a partial recurrence save and retries only its unsaved step', async () => {
    serve({ tasks: [task()] });
    mockApi.post
      .mockResolvedValueOnce({
        replayed: false,
        result: { task: nodeResult('task-1', 'Renamed', 'next', 2) },
      })
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce({
        replayed: true,
        result: { task: nodeResult('task-1', 'Renamed', 'next', 3) },
      });
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    await waitFor(() => expect(screen.getByLabelText('Recurrence (rrule)')).toBeEnabled());
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Renamed');
    await userEvent.type(screen.getByLabelText('Recurrence (rrule)'), 'FREQ=WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Task details saved. Recurrence is still unsaved/);
    expect(screen.getByLabelText('Recurrence (rrule)')).toHaveValue('FREQ=WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Task saved.');
    expect(mockApi.post.mock.calls.map((call) => call[1].type)).toEqual([
      'update_task',
      'set_recurrence',
      'set_recurrence',
    ]);
    expect(mockApi.post.mock.calls[1]?.[1]).toEqual(mockApi.post.mock.calls[2]?.[1]);
  });

  it('distinguishes filtered results and refuses unsupported saved-view clauses', async () => {
    serve({ tasks: [task()] });
    const original = mockApi.get.getMockImplementation()!;
    mockApi.get.mockImplementation((path: string) =>
      path === '/views'
        ? Promise.resolve({
            views: [{ id: 'unsupported', name: 'Recurrence', query: 'type:task has:recurrence' }],
          })
        : original(path),
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks?view=unsupported' });
    expect(
      await screen.findByText(/This saved view uses filters Tasks cannot apply/),
    ).toBeInTheDocument();
    expect(screen.getByText('No matching tasks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('button', { name: 'Write the brief' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'missing');
    expect(screen.getByText('No matching tasks')).toBeInTheDocument();
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument();
  });

  it('does not offer an empty timer state when its request failed', async () => {
    serve({ tasks: [task()] });
    const original = mockApi.get.getMockImplementation()!;
    mockApi.get.mockImplementation((path: string) =>
      path.startsWith('/productivity/time-entries')
        ? Promise.reject(new Error('offline'))
        : original(path),
    );
    renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await userEvent.click(await screen.findByRole('button', { name: 'Write the brief' }));
    expect(await screen.findByText(/Couldn't check the timer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeDisabled();
    expect(screen.queryByText('Timer stopped.')).not.toBeInTheDocument();
  });
});
