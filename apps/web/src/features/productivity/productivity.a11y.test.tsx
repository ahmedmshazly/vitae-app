/**
 * Empty and error states for the productivity screens must stay named and operable.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { runAxe } from '../../test/a11y.js';
import { createTestAuth, renderWithApp } from '../../test/render.js';
import { TasksScreen } from './TasksScreen.js';
import { WaitingScreen } from './WaitingScreen.js';

vi.mock('../../lib/productivity-flag.js', () => ({
  isProductivityEnabled: () => true,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

vi.mock('../../lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => createTestAuth(),
  hasSessionHint: () => false,
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace: saving is paused.',
}));

beforeEach(() => {
  resetMockApi();
});

describe('productivity a11y', () => {
  it('has no serious axe violations in the empty tasks state', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/tasks')) return { tasks: [] };
      return { views: [], nodes: [], time_entries: [] };
    });
    const { container } = renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    await screen.findByText('No tasks yet');
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('exposes a failed task load as an alert with retry', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/tasks')) throw new Error('offline');
      return { views: [], nodes: [] };
    });
    const { container } = renderWithApp(<TasksScreen />, { route: '/today/tasks' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('has no serious axe violations in the empty waiting state', async () => {
    mockApi.get.mockResolvedValue({ tasks: [] });
    const { container } = renderWithApp(<WaitingScreen />, { route: '/today/waiting' });
    await screen.findByText('Nothing is waiting');
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
