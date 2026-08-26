/**
 * Interaction logger: what it posts, what it says while posting, and what it
 * says when the post fails. The last of those used to say nothing at all.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { InteractionLogger } from './InteractionLogger.js';

beforeEach(() => {
  resetMockApi();
});

function renderLogger(onClose = vi.fn()) {
  renderWithApp(<InteractionLogger personId="p1" personName="Ada" onClose={onClose} />);
  return onClose;
}

describe('InteractionLogger', () => {
  it('posts an interaction and closes on save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolvePost: (value: unknown) => void = () => {};
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    renderLogger(onClose);

    await user.click(screen.getByRole('button', { name: 'call' }));
    await user.type(screen.getByLabelText(/What happened\?/), 'Quick sync');
    const save = screen.getByRole('button', { name: 'Save' });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent('Saving…');

    resolvePost({ interaction: { id: 'i1' }, strength: { strength: 0.4 } });
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ personId: 'p1', kind: 'call', note: 'Quick sync', initiatedBy: 'me' }),
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('sends the stated initiator when the operator flips it', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({ interaction: { id: 'i2' }, strength: { strength: 0.4 } });
    renderLogger();

    expect(screen.getByRole('group', { name: 'Who reached out' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'they did' }));
    await user.type(screen.getByLabelText(/What happened\?/), 'They pinged me');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ initiatedBy: 'them' }),
      );
    });
  });

  it('states the selected kind in the accessibility tree, not only in a border colour', async () => {
    const user = userEvent.setup();
    renderLogger();

    const group = screen.getByRole('group', { name: 'Kind' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'coffee', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'call', pressed: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'call' }));
    expect(screen.getByRole('button', { name: 'call', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'coffee', pressed: false })).toBeInTheDocument();
  });

  it('reports a failed save in the overlay and lets the user try again', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi.post.mockRejectedValue(new Error('interaction service unavailable'));
    renderLogger(onClose);

    await user.type(screen.getByLabelText(/What happened\?/), 'Coffee at Tahrir');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This interaction was not logged');
    expect(alert).toHaveTextContent('interaction service unavailable');
    // The overlay stays open with the typed note intact, and Save is live again.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByLabelText(/What happened\?/)).toHaveValue('Coffee at Tahrir');
  });

  it('saves on Enter in the note field', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({ interaction: { id: 'i2' }, strength: { strength: 0.5 } });
    renderLogger();

    await user.type(screen.getByLabelText(/What happened\?/), 'Called about the offer{Enter}');
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ kind: 'coffee', note: 'Called about the offer' }),
      );
    });
  });
});
