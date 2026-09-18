/**
 * The relationship editor closes itself on a successful save, so a failed one
 * leaves it open with every edit still in it. Nothing said which had happened.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { KnowsEditor } from './KnowsEditor.js';

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ values: [] });
  mockApi.patch.mockResolvedValue({});
});

/** A promise this test decides when to settle, for asserting the in-between. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderEditor(onDone = vi.fn()) {
  renderWithApp(
    <KnowsEditor
      personId="p1"
      edgeId="e1"
      knowsProps={{ relation: 'colleague', topics: ['robotics'] }}
      onDone={onDone}
    />,
  );
  return onDone;
}

describe('KnowsEditor says when the relationship did not change', () => {
  it('states the reason and keeps the editor open with the edits in it', async () => {
    const user = userEvent.setup();
    mockApi.patch.mockRejectedValue(new Error('the edge is gone'));
    const onDone = renderEditor();

    await user.click(screen.getByRole('radio', { name: '4 of 5' }));
    await user.click(screen.getByRole('button', { name: 'Save relationship' }));

    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(screen.getByText('the edge is gone')).toBeInTheDocument();
    expect(screen.getByLabelText('Reconnect cadence (days)')).toHaveValue(60);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('has words of its own when the failure carried none', async () => {
    const user = userEvent.setup();
    mockApi.patch.mockRejectedValue(new Error(''));
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Save relationship' }));

    expect(
      await screen.findByText('We couldn’t confirm the save. Your edits are still here; try again.'),
    ).toBeInTheDocument();
  });

  it('reports that it is saving, which a dropped click cannot', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    mockApi.patch.mockReturnValue(gate.promise);
    const onDone = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Save relationship' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Met via')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving...' }));
    expect(mockApi.patch).toHaveBeenCalledOnce();

    gate.resolve({});
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });
});

describe('KnowsEditor protects the relationship draft', () => {
  it('keeps an existing cadence when closeness changes and permits an explicit blank target', async () => {
    const user = userEvent.setup();
    renderWithApp(<KnowsEditor personId="p1" edgeId="e1" knowsProps={{ cadence_target_days: 14, last_interaction_at: null, favors: [{ id: 'f1' }] }} onDone={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: '4 of 5' }));
    expect(screen.getByLabelText('Reconnect cadence (days)')).toHaveValue(14);
    await user.clear(screen.getByLabelText('Reconnect cadence (days)'));
    await user.click(screen.getByRole('button', { name: 'Save relationship' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/edges/e1', { props: expect.objectContaining({ cadence_target_days: null, last_interaction_at: undefined, favors: [{ id: 'f1' }] }) }));
  });

  it('rejects fractional and zero cadence without losing the input', async () => {
    const user = userEvent.setup();
    renderEditor();
    const cadence = screen.getByLabelText('Reconnect cadence (days)');
    await user.type(cadence, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save relationship' }));
    expect(await screen.findByText('Enter a whole number of days greater than zero, or leave cadence blank.')).toBeVisible();
    expect(cadence).toHaveValue(1.5);
    await user.clear(cadence);
    await user.type(cadence, '0');
    await user.click(screen.getByRole('button', { name: 'Save relationship' }));
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('asks before abandoning a changed relationship', async () => {
    const user = userEvent.setup();
    const onDone = renderEditor();
    await user.type(screen.getByLabelText('Met via'), 'Shared research');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Met via')).toHaveValue('Shared research');
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('blocks an observed conflicting update without replacing the draft', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const view = renderWithApp(<KnowsEditor personId="p1" edgeId="e1" knowsProps={{ met_via: 'Original' }} onDone={onDone} />);
    await user.type(screen.getByLabelText('Met via'), ' draft');
    view.rerender(<KnowsEditor personId="p1" edgeId="e1" knowsProps={{ met_via: 'Updated elsewhere' }} onDone={onDone} />);
    expect(screen.getByText('Relationship changed')).toBeVisible();
    expect(screen.getByLabelText('Met via')).toHaveValue('Original draft');
    expect(screen.getByRole('button', { name: 'Save relationship' })).toBeDisabled();
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
});

describe('KnowsEditor names the controls a label cannot reach', () => {
  it('says the field the relation select belongs to, and what is in it', () => {
    renderEditor();

    expect(screen.getByRole('combobox', { name: 'Relation: Colleague' })).toBeInTheDocument();
  });

  it('says so when nothing is chosen yet', () => {
    renderWithApp(<KnowsEditor personId="p1" edgeId="e1" knowsProps={{}} onDone={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Relation: not chosen' })).toBeInTheDocument();
  });
});

describe('KnowsEditor stays inside the panel it sits in', () => {
  it('gives both footer buttons a type, so neither submits a surrounding form', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Save relationship' })).toHaveAttribute(
      'type',
      'button',
    );
  });
});
