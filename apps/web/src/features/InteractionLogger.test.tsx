/**
 * Interaction logger: what it posts, what it says while posting, and what it
 * says when the post fails. The last of those used to say nothing at all.
 */
import './../test/api-mock.js';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { InteractionLogger } from './InteractionLogger.js';
import { ApiError } from '../lib/api.js';

const access = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/auth.js')>(),
  useCanWrite: () => access.canWrite,
}));

beforeEach(() => {
  access.canWrite = true;
  resetMockApi();
});

function renderLogger(onClose = vi.fn()) {
  renderWithApp(<InteractionLogger personId="p1" personName="Ada" onClose={onClose} />);
  return onClose;
}

describe('InteractionLogger', () => {
  it('makes the existing reminder-retention behavior explicit before and after saving', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({ interaction: { id: 'i1' }, strength: null });
    renderLogger();
    await user.type(screen.getByLabelText(/What happened\?/), 'Send the notes');
    fireEvent.change(screen.getByLabelText(/Follow-up reminder/), { target: { value: '2030-12-01' } });
    expect(screen.getByText('Undoing the interaction keeps this reminder. Manage it from Reminders.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Follow-up reminder added. Undo removes only the interaction./)).toBeInTheDocument();
  });
  it('explains read-only access and disables every write field', () => {
    access.canWrite = false;
    renderLogger();
    expect(screen.getByText('This workspace is read-only')).toBeInTheDocument();
    expect(screen.getByLabelText(/What happened\?/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'call' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
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
    expect(screen.getByLabelText(/What happened\?/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(save);
    expect(mockApi.post).toHaveBeenCalledTimes(1);

    resolvePost({ interaction: { id: 'i1' }, strength: { strength: 0.4 } });
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ personId: 'p1', kind: 'call', note: 'Quick sync' }),
      );
    });
    const body = mockApi.post.mock.calls.find((call) => call[0] === '/interactions')?.[1] as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('initiatedBy');
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

  it('posts initiatedBy me only when the operator chooses it', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({ interaction: { id: 'i3' }, strength: { strength: 0.4 } });
    renderLogger();

    expect(screen.getByRole('button', { name: 'unstated', pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I did' }));
    await user.type(screen.getByLabelText(/What happened\?/), 'I reached out');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ initiatedBy: 'me' }),
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
    expect(alert).toHaveTextContent('Save not confirmed');
    expect(alert).toHaveTextContent('interaction service unavailable');
    // The overlay stays open with the typed note intact, and Save is live again.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled();
    expect(screen.getByLabelText(/What happened\?/)).toHaveValue('Coffee at Tahrir');
    expect(screen.getByLabelText(/What happened\?/)).toBeDisabled();
    const first = mockApi.post.mock.calls[0][1];
    mockApi.post.mockResolvedValue({ interaction: { id: 'i1' }, strength: { strength: 0.4 } });
    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(mockApi.post.mock.calls[1][1]).toEqual(first);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('clears a failed-save message when the interaction draft changes', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new ApiError(422, 'VALIDATION', 'Please revise the note'));
    renderLogger();

    const note = screen.getByLabelText(/What happened\?/);
    await user.type(note, 'Coffee at Tahrir');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the interaction details');

    await user.type(note, ' with follow-up');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(note).toHaveValue('Coffee at Tahrir with follow-up');
  });

  it('allows new lines and saves with Ctrl+Enter in the note field', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({ interaction: { id: 'i2' }, strength: { strength: 0.5 } });
    renderLogger();

    await user.type(screen.getByLabelText(/What happened\?/), 'Called about the offer{Enter}Next steps agreed');
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ kind: 'coffee', note: 'Called about the offer\nNext steps agreed' }),
      );
    });
  });

  it('protects a draft on Cancel and returns it unchanged when kept', async () => {
    const user = userEvent.setup();
    const onClose = renderLogger();
    await user.type(screen.getByLabelText(/What happened\?/), 'Discussed the research plan');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/What happened\?/)).toHaveValue('Discussed the research plan');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not let Escape abandon an in-flight save', async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    mockApi.post.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const onClose = renderLogger();
    await user.type(screen.getByLabelText(/What happened\?/), 'Discussed the plan');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve({ interaction: { id: 'i1' }, strength: { strength: 0.4 } }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
