/**
 * Creating a relationship is creating a record, and a refused POST used to say
 * the same sentence twice, both times behind the dialog the person was still
 * looking at: once from a local onError on the neutral toast channel, once
 * from the query client's MutationCache as an error.
 */
import './../../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { AddConnection } from './AddConnection.js';
import type * as AuthModule from '../../lib/auth.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));

// jsdom implements neither, and Radix Select calls both when it opens.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
  mockApi.get.mockResolvedValue({
    results: [{ id: 'r9', type: 'role', title: 'Staff Engineer' }],
  });
  mockApi.post.mockResolvedValue({ edge: { id: 'e-new' }, fingerprint: 'f', candidates: [] });
});

/** A promise this test decides when to settle, for asserting the in-between. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Controlled, so the dialog can really close and stop trapping the page. */
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open add connection
      </button>
      <AddConnection
        open={open}
        onOpenChange={setOpen}
        nodeId="p1"
        nodeType="person"
        nodeTitle="Ada"
      />
    </>
  );
}

function renderDialog() {
  return renderWithApp(<Harness />);
}

/** Relationship, then the other endpoint: the two the button waits on. */
async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
  await user.click(await screen.findByRole('option', { name: 'Career · Held role' }));

  const search = await screen.findByRole('combobox', { name: /^Search/ });
  await user.type(search, 'Staff');
  await user.click(await screen.findByRole('option', { name: /Staff Engineer/ }));
}

describe('AddConnection reports a refused link where it happened', () => {
  it('explains a read-only workspace and keeps all write controls disabled', async () => {
    permissions.canWrite = false;
    renderDialog();
    expect(await screen.findByRole('combobox', { name: /^Relationship:/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('opens a complete record form instead of posting an invalid role stub', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ results: [] });
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Career · Held role' }));
    await user.type(await screen.findByRole('combobox', { name: /^Search/ }), 'Research role');
    await user.click(await screen.findByRole('option', { name: /Create role.*add details/ }));
    expect(await screen.findByDisplayValue('Research role')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add connection' })).not.toBeInTheDocument();
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/nodes')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('dialog', { name: 'Add connection' })).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Relationship: Career · Held role' }),
    ).toBeInTheDocument();
  });

  it('validates cadence and never offers destructive Undo for a person-pair upsert', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      results: [{ id: 'p2', type: 'person', title: 'Grace Hopper' }],
      values: [],
    });
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Social · Knows' }));
    await user.type(await screen.findByRole('combobox', { name: /^Search/ }), 'Grace');
    await user.click(await screen.findByRole('option', { name: /Grace Hopper/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Reconnect cadence (days)' }), '-1');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByText('Check connection details');
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.clear(screen.getByRole('spinbutton', { name: 'Reconnect cadence (days)' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByText('Linked Grace Hopper');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/edges',
      expect.objectContaining({ props: { cadence_target_days: undefined } }),
    );
  });

  it('retries reading the saved target without recreating its record or existing link', async () => {
    const user = userEvent.setup();
    let reads = 0;
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/nodes/saved-role') {
        reads += 1;
        if (reads === 1) throw new Error('Read unavailable');
        return {
          node: { id: 'saved-role', type: 'role', title: 'Research role' },
          edges: [
            {
              id: 'saved-link',
              type: 'HELD',
              src: 'p1',
              dst: 'saved-role',
              props: { retained: true },
            },
          ],
        };
      }
      return { results: [], values: [], user: null, node: null };
    });
    mockApi.post.mockImplementation(async (path) => {
      if (path === '/nodes') return { node: { id: 'saved-role' } };
      if (path === '/edges') return { edge: { id: 'saved-link' } };
      return { fingerprint: 'f', candidates: [] };
    });
    mockApi.patch.mockResolvedValue({ edge: { id: 'saved-link' } });
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Career · Held role' }));
    await user.type(await screen.findByRole('combobox', { name: /^Search/ }), 'Research role');
    await user.click(await screen.findByRole('option', { name: /Create role.*add details/ }));
    await user.click(screen.getByRole('combobox', { name: 'Employment type' }));
    await user.click(await screen.findByRole('option', { name: 'Full time' }));
    await user.click(screen.getByRole('button', { name: 'Create role' }));
    await screen.findByText('Record saved · details unavailable');
    expect(screen.getByRole('combobox', { name: /^Relationship:/ })).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: /^Search/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/The new record is already saved/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Retry loading record' }));
    await user.click(await screen.findByRole('button', { name: 'Finish connection' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reads).toBe(2);
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/nodes')).toHaveLength(1);
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/edges')).toHaveLength(1);
    expect(mockApi.patch).toHaveBeenCalledWith('/edges/saved-link', { props: { retained: true } });
  });

  it('states the reason in the dialog and keeps the dialog open', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error('those two cannot be linked'));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Link not confirmed')).toBeInTheDocument();
    expect(screen.getByText('those two cannot be linked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeEnabled();
  });

  it('says it once, not once per channel', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error('those two cannot be linked'));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByText('Link not confirmed');

    expect(screen.getAllByText('those two cannot be linked')).toHaveLength(1);
  });

  it('has words of its own when the failure carried none', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error(''));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(
      await screen.findByText('We couldn’t confirm the link. Your draft is still here.'),
    ).toBeInTheDocument();
  });

  it('removes a refusal that no longer describes the edited connection', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error('those two cannot be linked'));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText('Link not confirmed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear target' }));
    expect(screen.queryByText('Link not confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText('those two cannot be linked')).not.toBeInTheDocument();
  });

  it('reports that it is linking, which a dropped click cannot', async () => {
    const user = userEvent.setup();
    const gate = deferred<{ edge: { id: string } }>();
    mockApi.post.mockReturnValue(gate.promise);
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByRole('button', { name: 'Linking...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /^Relationship:/ })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Add connection' })).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledTimes(1);

    gate.resolve({ edge: { id: 'e-new' } });
    expect(await screen.findByText('Linked Staff Engineer')).toBeInTheDocument();
  });

  it('offers the way back out of a link just made', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByText('Linked Staff Engineer');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockApi.del).toHaveBeenCalledWith('/edges/e-new'));
  });
});

describe('AddConnection names its own controls', () => {
  it('says which field the relationship select is', async () => {
    renderDialog();

    expect(
      await screen.findByRole('combobox', { name: 'Relationship: not chosen' }),
    ).toBeInTheDocument();
  });

  it('says which end of the relationship the search is filling in', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Career · Held role' }));

    const group = await screen.findByRole('group', { name: 'To' });
    expect(within(group).getByRole('combobox', { name: /^Search/ })).toBeInTheDocument();
  });

  it('says From when the relationship points the other way', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Career · ← Referred by' }));

    expect(await screen.findByRole('group', { name: 'From' })).toBeInTheDocument();
  });
});

describe('AddConnection closes without retaining an abandoned draft', () => {
  it('clears the relationship and target when Cancel closes the dialog', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open add connection' }));
    expect(
      await screen.findByRole('combobox', { name: 'Relationship: not chosen' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Staff Engineer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  it('keeps the draft when the user declines a relationship switch', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillIn(user);
    await user.click(screen.getByRole('combobox', { name: /^Relationship:/ }));
    await user.click(await screen.findByRole('option', { name: 'Career · ← Referred by' }));
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByText('Staff Engineer')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Relationship: Career · Held role' }),
    ).toBeInTheDocument();
  });
});
