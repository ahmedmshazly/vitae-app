/**
 * Trash route: loading, error, empty, and restore mutation.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Trash } from './Trash.js';

function mockTrashGets(nodes: unknown[], preview: { nodes: number } = { nodes: 0 }) {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/nodes')) return { nodes };
    if (path.startsWith('/retention/preview')) {
      return { retentionDays: 30, cutoff: '2026-07-10', nodes: preview.nodes, edges: 0, revisions: 0, dependents: 0 };
    }
    throw new Error(`unexpected get ${path}`);
  });
}

beforeEach(() => {
  resetMockApi();
});

describe('Trash route states', () => {
  it('shows a loading status while trash fetches', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<Trash />, { route: '/trash' });
    expect(screen.getByRole('status', { name: 'Loading trash' })).toBeInTheDocument();
  });

  it('shows an error with retry that reloads deleted records', async () => {
    const user = userEvent.setup();
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/retention/preview')) {
        return { retentionDays: 30, cutoff: '2026-07-10', nodes: 0, edges: 0, revisions: 0, dependents: 0 };
      }
      throw new Error('offline');
    });
    renderWithApp(<Trash />, { route: '/trash' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t load trash')).toBeInTheDocument();

    mockTrashGets([]);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
  });

  it('lists a deleted record and restores it', async () => {
    const user = userEvent.setup();
    mockTrashGets([
      {
        id: 'n1',
        type: 'person',
        title: 'Deleted Ada',
        deleted_at: '2026-08-01T12:00:00.000Z',
      },
    ]);
    mockApi.post.mockResolvedValue({});
    renderWithApp(<Trash />, { route: '/trash' });

    expect(await screen.findByText('Deleted Ada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore Deleted Ada' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/nodes/n1/restore'));
  });
});
