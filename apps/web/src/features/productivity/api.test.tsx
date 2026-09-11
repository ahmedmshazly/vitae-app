/**
 * Productivity command mutation: optimistic patch rolls back on 409 and
 * does not overwrite the cache with the conflicting payload.
 */
import '../../test/api-mock.js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import {
  compensatingCommand,
  revisionFromResult,
  useProductivityCommand,
  type ProductivityCommandResult,
  type ProductivityTasksPage,
} from './api.js';
import { productivityKeys } from './query-keys.js';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../lib/productivity-flag.js', () => ({
  isProductivityEnabled: () => flag.enabled,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

const task = {
  id: 'task-1',
  title: 'Write the brief',
  status: 'next' as const,
  rev: 1,
};

function wrapper() {
  // `gcTime: 0` (the shared test client) collects unobserved `setQueryData`
  // rows as soon as the mutation settles, which is exactly the cache this
  // rollback assertion has to read.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  flag.enabled = true;
  resetMockApi();
});

describe('useProductivityCommand', () => {
  it('rolls the optimistic patch back on 409 and leaves the stored title', async () => {
    const { queryClient, Wrapper } = wrapper();
    queryClient.setQueryData<ProductivityTasksPage>(productivityKeys.tasks(), { tasks: [task] });
    queryClient.setQueryData(productivityKeys.task(task.id), { task });

    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'revision conflict'));

    const { result } = renderHook(() => useProductivityCommand(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          version: 1,
          operation_id: 'op-stale',
          expected_revision: 1,
          type: 'update_task',
          payload: { id: task.id, patch: { title: 'Should not stick' } },
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.conflict).toBe('revision conflict');
    });

    const list = queryClient.getQueryData<ProductivityTasksPage>(productivityKeys.tasks());
    expect(list?.tasks[0]?.title).toBe('Write the brief');
    expect(list?.tasks[0]?.rev).toBe(1);
    const detail = queryClient.getQueryData<{ task: typeof task }>(productivityKeys.task(task.id));
    expect(detail?.task.title).toBe('Write the brief');
  });

  it('replaces the cache with the canonical result on success', async () => {
    const { queryClient, Wrapper } = wrapper();
    queryClient.setQueryData<ProductivityTasksPage>(productivityKeys.tasks(), { tasks: [task] });

    mockApi.post.mockResolvedValueOnce({
      replayed: false,
      result: {
        task: {
          id: task.id,
          type: 'task',
          title: 'Canonical title',
          props: { status: 'done' },
          rev: 2,
        },
      },
    });

    const { result } = renderHook(() => useProductivityCommand(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        version: 1,
        operation_id: 'op-ok',
        expected_revision: 1,
        type: 'complete_task',
        payload: { id: task.id },
      });
    });

    const list = queryClient.getQueryData<ProductivityTasksPage>(productivityKeys.tasks());
    expect(list?.tasks[0]?.title).toBe('Canonical title');
    expect(list?.tasks[0]?.status).toBe('done');
    expect(list?.tasks[0]?.rev).toBe(2);
    expect(result.current.conflict).toBeNull();
  });

  it('refuses to keep an optimistic write when the server returns 402', async () => {
    // useCanWrite is true outside AuthProvider; the 402 path is the server
    // envelope. A locked workspace still rolls the optimistic patch back.
    const { queryClient, Wrapper } = wrapper();
    queryClient.setQueryData<ProductivityTasksPage>(productivityKeys.tasks(), { tasks: [task] });
    mockApi.post.mockRejectedValueOnce(
      new ApiError(402, 'PAYMENT_REQUIRED', 'Read-only workspace: saving is paused.'),
    );

    const { result } = renderHook(() => useProductivityCommand(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          version: 1,
          operation_id: 'op-lock',
          type: 'complete_task',
          payload: { id: task.id },
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<ProductivityTasksPage>(productivityKeys.tasks())?.tasks[0]?.status).toBe(
        'next',
      );
    });
    expect(result.current.conflict).toBeNull();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toMatchObject({ status: 402, code: 'PAYMENT_REQUIRED' });
  });
});

describe('compensatingCommand', () => {
  it('stamps expected_revision from the last canonical result', () => {
    const last: ProductivityCommandResult = {
      task: { id: 'task-1', type: 'task', title: 'A', props: {}, rev: 4 } as never,
    };
    const undo = compensatingCommand(
      {
        version: 1,
        operation_id: 'op-undo',
        type: 'restore_task',
        payload: { id: 'task-1' },
      },
      last,
    );
    expect(undo.expected_revision).toBe(4);
    expect(undo.operation_id).toBe('op-undo');
    expect(revisionFromResult(last)).toBe(4);
  });

  it('reads a number from a reorder-shaped result that only has tasks', () => {
    const last: ProductivityCommandResult = {
      ordered_ids: ['task-a', 'task-b'],
      tasks: [
        { id: 'task-a', type: 'task', title: 'A', props: {}, rev: 2 } as never,
        { id: 'task-b', type: 'task', title: 'B', props: {}, rev: 5 } as never,
      ],
    };
    expect(revisionFromResult(last)).toBe(5);
    const undo = compensatingCommand(
      {
        version: 1,
        operation_id: 'op-unreorder',
        type: 'reorder_tasks',
        payload: { ordered_ids: ['task-b', 'task-a'] },
      },
      last,
    );
    expect(undo.expected_revision).toBe(5);
  });
});
