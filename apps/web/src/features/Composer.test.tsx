/**
 * Outreach composer: draft load, draft failure, send.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Composer } from './Composer.js';

const ctx = {
  personId: 'p1',
  personName: 'Ada',
  kind: 'reconnect' as const,
};

beforeEach(() => {
  resetMockApi();
});

describe('Composer', () => {
  it('fills the draft textarea from a successful preview', async () => {
    mockApi.post.mockResolvedValueOnce({
      body: 'Hello Ada, catching up.',
      facts: ['met via conference'],
    });
    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);

    expect(await screen.findByLabelText('Draft message')).toHaveValue('Hello Ada, catching up.');
    expect(screen.getByText('met via conference')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/composer/draft',
      expect.objectContaining({ personId: 'p1', kind: 'reconnect', tone: 'warm' }),
    );
  });

  it('shows an error state when the draft fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('upstream 502'));
    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);

    expect(await screen.findByText("Couldn't draft that message")).toBeInTheDocument();
    expect(screen.getByText('upstream 502')).toBeInTheDocument();
  });

  it('sends the draft and closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi.post
      .mockResolvedValueOnce({ body: 'Hello Ada.', facts: [] })
      .mockResolvedValueOnce({ interaction: { id: 'i1' }, reminderId: 'r1' });

    renderWithApp(<Composer ctx={ctx} onClose={onClose} />);
    await screen.findByLabelText('Draft message');

    await user.click(
      screen.getByRole('checkbox', { name: 'I have sent this message outside Vitae' }),
    );
    await user.click(screen.getByRole('button', { name: 'Log outreach & follow-up' }));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/composer/send',
        expect.objectContaining({ personId: 'p1', body: 'Hello Ada.', channel: 'email' }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
