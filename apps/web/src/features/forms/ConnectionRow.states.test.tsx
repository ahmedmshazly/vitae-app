/**
 * Both of this row's writes used to be fire-and-forget, so a failed unlink and
 * a failed property save each did nothing at all: no message, no pending
 * signal, the dialog already closed and the connection still there.
 */
import './../../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { ConnectionRow } from './ConnectionRow.js';
import type * as AuthModule from '../../lib/auth.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));

const NEIGHBORS = { p2: { id: 'p2', type: 'person', title: 'Grace Hopper' } };
const KNOWS = {
  id: 'e1',
  type: 'KNOWS',
  src: 'self-1',
  dst: 'p2',
  props: { relation: 'colleague' },
};
const ROLE_AT = {
  id: 'e2',
  type: 'ROLE_AT',
  src: 'self-1',
  dst: 'p2',
  props: { department: 'Research' },
};

/** A promise this test decides when to settle, for asserting the in-between. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
  // The prop popover holds a suggest-backed field; nothing here is about it.
  mockApi.get.mockResolvedValue({ values: [] });
  mockApi.delete.mockResolvedValue({});
  mockApi.patch.mockResolvedValue({});
  mockApi.post.mockResolvedValue({});
});

function renderKnows() {
  return renderWithApp(<ConnectionRow edge={KNOWS} nodeId="self-1" neighbors={NEIGHBORS} />);
}

async function openUnlink(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
  return screen.findByRole('dialog');
}

describe('a failed unlink stays on screen', () => {
  it('states the reason in the dialog and leaves the connection there', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockRejectedValue(new Error('the server refused it'));
    renderKnows();

    const dialog = await openUnlink(user);
    await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

    expect(await within(dialog).findByText('Not unlinked')).toBeInTheDocument();
    expect(within(dialog).getByText('the server refused it')).toBeInTheDocument();

    // The connection is still there behind the dialog, which is the whole
    // point of saying so rather than closing on the click.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('link', { name: /Grace Hopper/ })).toBeInTheDocument();
  });

  it('says so in its own words when the failure carried none', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockRejectedValue(new Error(''));
    renderKnows();

    const dialog = await openUnlink(user);
    await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

    expect(
      await within(dialog).findByText('Grace Hopper is still connected. Try again.'),
    ).toBeInTheDocument();
  });

  it('does not carry the last failure into the next attempt', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockRejectedValueOnce(new Error('the server refused it'));
    renderKnows();

    const dialog = await openUnlink(user);
    await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    await within(dialog).findByText('Not unlinked');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));

    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByText('Not unlinked')).not.toBeInTheDocument();
  });

  it('reports that it is working, which a dropped click cannot', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    mockApi.delete.mockReturnValue(gate.promise);
    renderKnows();

    const dialog = await openUnlink(user);
    await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

    const busy = await within(dialog).findByRole('button', { name: 'Unlinking...' });
    expect(busy).toBeDisabled();

    gate.resolve({});
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on success, and the Undo puts the connection back', async () => {
    const user = userEvent.setup();
    renderKnows();

    const dialog = await openUnlink(user);
    await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

    expect(await screen.findByText('Unlinked Grace Hopper')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/edges/e1/restore'));
  });
});

describe('a failed property save stays on screen', () => {
  it('preserves an open draft if write access is revoked', async () => {
    const user = userEvent.setup();
    const { rerender } = renderKnows();
    await user.click(screen.getByRole('button', { name: 'Edit Colleague properties' }));
    await user.type(screen.getByRole('combobox', { name: 'Met via' }), 'Research meetup');
    permissions.canWrite = false;
    rerender(<ConnectionRow edge={KNOWS} nodeId="self-1" neighbors={NEIGHBORS} />);
    expect(screen.getByRole('dialog', { name: 'Edit Colleague properties' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Met via' })).toHaveValue('Research meetup');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByText(/Your draft is still here/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
  it('protects edited properties on Escape and retains them after Keep editing', async () => {
    const user = userEvent.setup();
    renderWithApp(<ConnectionRow edge={ROLE_AT} nodeId="self-1" neighbors={NEIGHBORS} />);
    await user.click(screen.getByRole('button', { name: /properties$/ }));
    await user.type(await screen.findByLabelText('Department'), ' and design');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Department')).toHaveValue('Research and design');
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('states the reason beside the button that retries it', async () => {
    const user = userEvent.setup();
    mockApi.patch.mockRejectedValue(new Error('department is unknown'));
    renderWithApp(<ConnectionRow edge={ROLE_AT} nodeId="self-1" neighbors={NEIGHBORS} />);

    await user.click(screen.getByRole('button', { name: /properties$/ }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(screen.getByText('department is unknown')).toBeInTheDocument();
    // Still open, so the edited values are not lost with the message.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('reports that it is saving and closes only once it has', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    mockApi.patch.mockReturnValue(gate.promise);
    renderWithApp(<ConnectionRow edge={ROLE_AT} nodeId="self-1" neighbors={NEIGHBORS} />);

    await user.click(screen.getByRole('button', { name: /properties$/ }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    const busy = await screen.findByRole('button', { name: 'Saving...' });
    expect(busy).toBeDisabled();

    gate.resolve({});
    expect(await screen.findByText('Connection updated')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });
  });

  it('names the connection the unnamed prop controls belong to', async () => {
    const user = userEvent.setup();
    renderWithApp(<ConnectionRow edge={ROLE_AT} nodeId="self-1" neighbors={NEIGHBORS} />);

    await user.click(screen.getByRole('button', { name: /properties$/ }));

    const group = await screen.findByRole('group', { name: /Grace Hopper/ });
    expect(within(group).getByLabelText('Department')).toHaveValue('Research');
  });
});

describe('the row actions are reachable without a pointer', () => {
  it('keeps unlink in the tree with no hover anywhere near it', () => {
    renderKnows();

    expect(screen.getByRole('button', { name: 'Unlink Grace Hopper' })).toBeVisible();
  });

  it('renders as a list item when the caller gives it a list', () => {
    renderWithApp(
      <ul>
        <ConnectionRow edge={KNOWS} nodeId="self-1" neighbors={NEIGHBORS} as="li" />
      </ul>,
    );

    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });
});
