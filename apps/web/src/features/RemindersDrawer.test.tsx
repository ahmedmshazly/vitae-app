/**
 * Reminders drawer: empty, error, list, and Done mutation.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { RemindersDrawer } from './RemindersDrawer.js';

beforeEach(() => {
  resetMockApi();
});

function renderOpen(onOpenChange = vi.fn()) {
  return renderWithApp(
    <RemindersDrawer
      open
      onOpenChange={onOpenChange}
      trigger={<button type="button">Reminders</button>}
    />,
  );
}

describe('RemindersDrawer', () => {
  it('shows the empty state when nothing is due', async () => {
    mockApi.get.mockResolvedValue({ reminders: [] });
    renderOpen();
    expect(await screen.findByText(/Nothing due/)).toBeInTheDocument();
  });

  it('shows an error with retry when the list fails', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('timeout'));
    renderOpen();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load reminders');
    expect(alert).toHaveTextContent('timeout');

    mockApi.get.mockResolvedValueOnce({ reminders: [] });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Nothing due/)).toBeInTheDocument();
  });

  it('lists reminders and marks one done', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      reminders: [{ id: 'r1', note: 'Follow up with Ada', due_on: '2020-01-01' }],
    });
    mockApi.post.mockResolvedValue({});
    renderOpen();

    expect(await screen.findByText('Follow up with Ada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/reminders/r1/done', {});
    });
  });
});
