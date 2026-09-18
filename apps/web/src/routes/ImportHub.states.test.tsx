/** Destructive import actions keep their recovery story explicit. */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { ImportHub, type Batch } from './ImportHub.js';

const stagedBatch: Batch = {
  id: 'batch-1',
  kind: 'contacts',
  detail: null,
  filename: 'contacts.csv',
  status: 'staged',
  created_at: '2026-08-20T10:00:00.000Z',
  stats: { rows: 1, accepted: 1, dupCandidates: 0 },
};

function arrange(currentBatch: Batch = stagedBatch) {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === '/imports') return { batches: [currentBatch] };
    if (path === '/settings') return { github: { configured: false, lastSyncAt: null } };
    if (path === '/nodes?type=role&limit=100' || path === '/nodes?type=project&limit=100') {
      return { nodes: [] };
    }
    if (path === '/imports/batch-1') {
      return {
        batch: currentBatch,
        rows: [
          {
            id: 'row-1',
            index: 1,
            entity: 'person',
            title: 'Ada Lovelace',
            subtitle: null,
            payload: { title: 'Ada Lovelace' },
            confidence: 1,
            dup: null,
            decision: 'accept',
            status: 'staged',
          },
        ],
      };
    }
    throw new Error(`unexpected GET ${path}`);
  });
  return renderWithApp(<ImportHub />, { route: '/data/imports' });
}

beforeEach(() => resetMockApi());

describe('ImportHub destructive recovery', () => {
  it('requires confirmation before it discards a staged review', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({});
    arrange();

    await user.click(await screen.findByRole('button', { name: /Open contacts import/ }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(
      await screen.findByRole('dialog', { name: 'Discard staged import?' }),
    ).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard staged import' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/imports/batch-1/discard'));
  });

  it('requires confirmation before rolling back a committed batch', async () => {
    const user = userEvent.setup();
    arrange({
      ...stagedBatch,
      status: 'committed',
      stats: { ...stagedBatch.stats, created: 2 },
    });

    await user.click(await screen.findByRole('button', { name: /Roll back contacts import/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Roll back contacts import?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/removes the 2 records this batch created/i)).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
