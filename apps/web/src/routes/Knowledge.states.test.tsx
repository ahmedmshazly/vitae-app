/**
 * Knowledge review is a custody surface: an evidence decision must be written
 * once, then the refreshed ledger can truthfully describe the result.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Knowledge } from './Knowledge.js';

const knowledge = {
  summary: {
    sources: 1,
    runs: 1,
    records: 1,
    pending: 1,
    conflicts: 0,
    linked_entities: 1,
  },
  sources: [],
  runs: [
    {
      id: 'run-1',
      status: 'review',
      started_at: '2026-09-12T08:00:00.000Z',
      coverage: { examined: 1, extracted: 1, skipped: 0, complete: true },
      limitations: [],
    },
  ],
  assertions: [
    {
      id: 'assertion-1',
      run_id: 'run-1',
      subject_id: 'person-1',
      subject_kind: 'node',
      field: 'title',
      value: 'Director',
      current_value: 'Manager',
      basis: 'explicit',
      confidence: 0.96,
      status: 'proposed',
      reason: 'Signature line',
      observed_at: '2026-09-12T08:00:00.000Z',
      valid_from: null,
      citation: { locator: 'gmail://message/1', record_id: 'record-1' },
    },
  ],
  subjects: { 'person-1': { id: 'person-1', type: 'person', title: 'Ada Lovelace' } },
};

function serveKnowledge() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === '/knowledge') return knowledge;
    if (path.startsWith('/knowledge/records')) return { records: [], total: 0 };
    throw new Error(`Unexpected GET ${path}`);
  });
}

beforeEach(() => {
  resetMockApi();
});

describe('Knowledge review states', () => {
  it('writes one reject decision for one explicit user action', async () => {
    const user = userEvent.setup();
    serveKnowledge();
    mockApi.post.mockResolvedValue({});
    renderWithApp(<Knowledge />, { route: '/data/knowledge' });

    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/knowledge/assertions/assertion-1/decision', {
        choice: 'reject',
      }),
    );
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it('keeps the evidence retryable when the ledger cannot load', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValue(new Error('Offline'));
    renderWithApp(<Knowledge />, { route: '/data/knowledge' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load knowledge evidence");
    serveKnowledge();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: /Assertions/ })).toBeInTheDocument();
  });

  it('names a source-record failure and retries that ledger without hiding reviewed evidence', async () => {
    const user = userEvent.setup();
    mockApi.get.mockImplementation(async (path: string) => {
      if (path === '/knowledge') return knowledge;
      if (path.startsWith('/knowledge/records')) throw new Error('Mailbox unavailable');
      throw new Error(`Unexpected GET ${path}`);
    });
    renderWithApp(<Knowledge />, { route: '/data/knowledge' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load source records");
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();

    serveKnowledge();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/full message bodies stay in Gmail/)).toBeInTheDocument();
  });
});
