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
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { AddConnection } from './AddConnection.js';

// jsdom implements neither, and Radix Select calls both when it opens.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({
    results: [{ id: 'r9', type: 'role', title: 'Staff Engineer' }],
  });
  mockApi.post.mockResolvedValue({ edge: { id: 'e-new' } });
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
    <AddConnection
      open={open}
      onOpenChange={setOpen}
      nodeId="p1"
      nodeType="person"
      nodeTitle="Ada"
    />
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
  it('states the reason in the dialog and keeps the dialog open', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error('those two cannot be linked'));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Not linked')).toBeInTheDocument();
    expect(screen.getByText('those two cannot be linked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeEnabled();
  });

  it('says it once, not once per channel', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error('those two cannot be linked'));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByText('Not linked');

    expect(screen.getAllByText('those two cannot be linked')).toHaveLength(1);
  });

  it('has words of its own when the failure carried none', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error(''));
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Nothing was created. Try again.')).toBeInTheDocument();
  });

  it('reports that it is linking, which a dropped click cannot', async () => {
    const user = userEvent.setup();
    const gate = deferred<{ edge: { id: string } }>();
    mockApi.post.mockReturnValue(gate.promise);
    renderDialog();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByRole('button', { name: 'Linking…' })).toBeDisabled();

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

    expect(await screen.findByRole('combobox', { name: 'Relationship: not chosen' })).toBeInTheDocument();
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
