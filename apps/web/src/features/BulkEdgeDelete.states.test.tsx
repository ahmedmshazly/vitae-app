/**
 * Unlinking in bulk is soft-deleting relationships, and relationships are
 * records here. Every outcome below used to read the same: a neutral line and
 * a cleared selection.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { bulkBarIsDetached } from '../components/BulkBar.js';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { SelectCheckbox } from './BulkNodeDelete.js';
import { BulkUnlinkBar, BulkUnlinkConfirm, useBulkEdgeDelete } from './BulkEdgeDelete.js';

const EDGES = [
  { id: 'e1', title: 'works at Kestrel' },
  { id: 'e2', title: 'knows Grace Hopper' },
];
const IDS = EDGES.map((e) => e.id);

beforeEach(() => {
  resetMockApi();
  mockApi.delete.mockResolvedValue({});
  mockApi.post.mockResolvedValue({});
});

function Harness() {
  const bulk = useBulkEdgeDelete();
  const allSelected = IDS.every((id) => bulk.isSelected(id));

  return (
    <section>
      <h2>Connections</h2>
      <BulkUnlinkBar
        selectedCount={bulk.selectedCount}
        onClear={bulk.clear}
        onUnlink={() => bulk.setConfirmUnlink(true)}
        allSelected={allSelected}
        onToggleAll={() => bulk.toggleAll(IDS, allSelected)}
      />
      <ul>
        {EDGES.map((e) => (
          <li key={e.id}>
            <SelectCheckbox
              checked={bulk.isSelected(e.id)}
              label={`Select ${e.title}`}
              onToggle={() => bulk.toggleOne(e.id)}
            />
            <span>{e.title}</span>
          </li>
        ))}
      </ul>
      <BulkUnlinkConfirm
        open={bulk.confirmUnlink}
        onOpenChange={bulk.setConfirmUnlink}
        selectedCount={bulk.selectedCount}
        busy={bulk.busy}
        onConfirm={() => void bulk.unlinkSelected()}
      />
    </section>
  );
}

async function selectBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: 'Select works at Kestrel' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select knows Grace Hopper' }));
}

async function confirmUnlink(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Unlink' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /^Unlink( \d+)?$/ }));
}

describe('bulk unlink says which connections survived', () => {
  it('keeps the failures staged and marks the report an error', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockImplementation((path: string) =>
      path === '/edges/e2' ? Promise.reject(new Error('nope')) : Promise.resolve({}),
    );
    renderWithApp(<Harness />);

    await selectBoth(user);
    await confirmUnlink(user);

    const report = await screen.findByText('Unlinked 1 · 1 still selected and not unlinked');
    expect(within(report.closest('li') as HTMLElement).getByText('Error')).toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: 'Select knows Grace Hopper' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select works at Kestrel' })).not.toBeChecked();
  });

  it('offers a way back from a half-finished unlink, for the half that moved', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockImplementation((path: string) =>
      path === '/edges/e2' ? Promise.reject(new Error('nope')) : Promise.resolve({}),
    );
    renderWithApp(<Harness />);

    await selectBoth(user);
    await confirmUnlink(user);
    await screen.findByText('Unlinked 1 · 1 still selected and not unlinked');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/edges/e1/restore'));
    expect(mockApi.post).not.toHaveBeenCalledWith('/edges/e2/restore');
  });

  it('restores every connection it unlinked when nothing failed', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await selectBoth(user);
    await confirmUnlink(user);

    expect(await screen.findByText('Unlinked 2 connections')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/edges/e1/restore'));
    expect(mockApi.post).toHaveBeenCalledWith('/edges/e2/restore');
  });
});

describe('the unlink bar behaves like the delete bar', () => {
  it('lands in its own layer, not in the section that mounted it', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Select works at Kestrel' }));

    const bar = await screen.findByRole('group', { name: 'Connection bulk actions' });
    expect(bulkBarIsDetached(bar)).toBe(true);
  });

  it('counts connections in a region mounted before the first selection', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');

    await user.click(screen.getByRole('checkbox', { name: 'Select works at Kestrel' }));
    await waitFor(() => expect(region).toHaveTextContent('1 connection selected'));

    await user.click(screen.getByRole('checkbox', { name: 'Select knows Grace Hopper' }));
    await waitFor(() => expect(region).toHaveTextContent('2 connections selected'));
  });

  it('clears the selection on Escape from inside the bar', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Select works at Kestrel' }));
    const bar = await screen.findByRole('group', { name: 'Connection bulk actions' });

    within(bar).getByRole('button', { name: 'Clear' }).focus();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Connection bulk actions' })).not.toBeInTheDocument();
    });
  });
});
