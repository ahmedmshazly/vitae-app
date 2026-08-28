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
      await screen.findByText('The relationship is unchanged. Your edits are still here; try again.'),
    ).toBeInTheDocument();
  });

  it('reports that it is saving, which a dropped click cannot', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    mockApi.patch.mockReturnValue(gate.promise);
    const onDone = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Save relationship' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();

    gate.resolve({});
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
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
