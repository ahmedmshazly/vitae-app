import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Record } from './Record.js';

const node = {
  id: 'habit-1',
  type: 'habit',
  title: 'Morning walk',
  props: {},
  notes_md: '',
  source: 'manual',
  confidence: 1,
  pinned: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  deleted_at: null,
};

function renderRecord() {
  return renderWithApp(
    <Routes>
      <Route path="/records/:id" element={<Record />} />
      <Route path="/data/trash" element={<div>Trash</div>} />
    </Routes>,
    { route: '/records/habit-1' },
  );
}

describe('record deletion recovery', () => {
  it('keeps the generic entity confirmation open with a retryable, named failure', async () => {
    resetMockApi();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/nodes/habit-1') return Promise.resolve({ node, edges: [], neighbors: {} });
      if (path === '/nodes/habit-1/revisions') return Promise.resolve({ revisions: [] });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    mockApi.del.mockRejectedValue(new Error('Trash is temporarily unavailable'));
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Move to trash' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t move this record to Trash. Trash is temporarily unavailable',
    );
    expect(within(dialog).getByRole('button', { name: 'Move to trash' })).toBeEnabled();
  });
});
