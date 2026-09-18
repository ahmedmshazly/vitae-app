/**
 * A bulk delete is the most destructive act a list page offers, and this one
 * used to report the same way whether every record moved or half of them
 * failed. These are the states it now has to state.
 */
import './../test/api-mock.js';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../lib/api.js';
import { bulkBarIsDetached } from '../components/BulkBar.js';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestQueryClient, renderWithApp } from '../test/render.js';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './Toast.js';
import {
  BulkDeleteBar,
  BulkDeleteConfirm,
  SelectCheckbox,
  titlesForSelection,
  useBulkNodeDelete,
  useVisibleSelection,
} from './BulkNodeDelete.js';

const PEOPLE = [
  { id: 'p1', title: 'Ada Lovelace' },
  { id: 'p2', title: 'Grace Hopper' },
];
const IDS = PEOPLE.map((p) => p.id);

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ nodes: [] });
  mockApi.delete.mockResolvedValue({});
});

/**
 * The bar goes inside a page header on purpose: that is where every caller
 * puts it, and the portal is what has to make that harmless.
 */
function Harness() {
  const bulk = useBulkNodeDelete({ noun: 'person', nouns: 'people' });
  const { allVisibleSelected } = useVisibleSelection(IDS, bulk.selected);
  // A query no row delete touches. It is here to be left alone.
  useQuery({ queryKey: ['graph'], queryFn: () => api.get('/graph') });

  return (
    <div>
      <header className="vt-pagehead">
        <h1>People</h1>
        <BulkDeleteBar
          selectedCount={bulk.selectedCount}
          onClear={bulk.clear}
          onDelete={() => bulk.setConfirmDelete(true)}
          noun="person"
          nouns="people"
          allSelected={allVisibleSelected}
          onToggleAll={() => bulk.toggleAll(IDS, allVisibleSelected)}
        />
      </header>
      <ul>
        {PEOPLE.map((p) => (
          <li key={p.id}>
            <SelectCheckbox
              checked={bulk.isSelected(p.id)}
              label={`Select ${p.title}`}
              onToggle={() => bulk.toggleOne(p.id)}
            />
            <span>{p.title}</span>
          </li>
        ))}
      </ul>
      <BulkDeleteConfirm
        open={bulk.confirmDelete}
        onOpenChange={bulk.setConfirmDelete}
        selectedCount={bulk.selectedCount}
        titles={titlesForSelection(PEOPLE, bulk.selected)}
        noun="person"
        nouns="people"
        busy={bulk.deleting}
        onConfirm={() => void bulk.deleteSelected()}
      />
    </div>
  );
}

async function selectBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select Grace Hopper' }));
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /Move .* to trash|Move to trash/ }));
}

describe('bulk delete says which records did not move', () => {
  it('serializes requests and freezes the selected snapshot and confirmation until completion', async () => {
    let finish!: () => void;
    mockApi.delete.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBulkNodeDelete(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      ),
    });
    act(() => {
      result.current.toggleOne('p1');
      result.current.setConfirmDelete(true);
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.deleteSelected();
      void result.current.deleteSelected();
      result.current.toggleOne('p2');
      result.current.clear();
      result.current.setConfirmDelete(false);
    });
    expect(mockApi.delete).toHaveBeenCalledTimes(1);
    expect([...result.current.selected]).toEqual(['p1']);
    expect(result.current.confirmDelete).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.confirmDelete).toBe(false);
  });
  it('keeps the failures staged and marks the report an error', async () => {
    const user = userEvent.setup();
    mockApi.delete.mockImplementation((path: string) =>
      path === '/nodes/p2' ? Promise.reject(new Error('locked')) : Promise.resolve({}),
    );
    renderWithApp(<Harness />);

    await selectBoth(user);
    await confirmDelete(user);

    const report = await screen.findByText('Moved 1 to trash · 1 still selected and not deleted');
    expect(within(report.closest('li') as HTMLElement).getByText('Error')).toBeInTheDocument();

    // The one that failed is the one still staged, so the retry is one click.
    expect(screen.getByRole('checkbox', { name: 'Select Grace Hopper' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' })).not.toBeChecked();
  });

  it('clears the selection and counts the records when every delete lands', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await selectBoth(user);
    await confirmDelete(user);

    expect(await screen.findByText('Moved 2 people to trash')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' })).not.toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: 'Select Grace Hopper' })).not.toBeChecked();
  });

  it('leaves queries a row delete cannot affect alone', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/graph'));
    const callsBefore = mockApi.get.mock.calls.length;

    await selectBoth(user);
    await confirmDelete(user);
    await screen.findByText('Moved 2 people to trash');

    expect(mockApi.get.mock.calls.length).toBe(callsBefore);
  });
});

describe('the selection bar is reachable and out of the way', () => {
  it('lands outside the header the caller mounted it in', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }));

    const bar = await screen.findByRole('group', { name: 'Bulk actions' });
    expect(bulkBarIsDetached(bar)).toBe(true);
  });

  it('announces the count from a region that was already mounted', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }));
    await waitFor(() => expect(region).toHaveTextContent('1 person selected'));

    await user.click(screen.getByRole('checkbox', { name: 'Select Grace Hopper' }));
    await waitFor(() => expect(region).toHaveTextContent('2 people selected'));
  });

  it('offers a way out of a selection nobody meant to make', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }));
    const bar = await screen.findByRole('group', { name: 'Bulk actions' });

    within(bar).getByRole('button', { name: 'Clear' }).focus();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' })).not.toBeChecked();
  });

  it('selects the whole visible page from the bar', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }));
    const bar = await screen.findByRole('group', { name: 'Bulk actions' });

    await user.click(within(bar).getByRole('checkbox', { name: 'Select all' }));

    expect(screen.getByRole('checkbox', { name: 'Select Grace Hopper' })).toBeChecked();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 people selected'));
  });
});

describe('the row control is a checkbox everywhere it appears', () => {
  it('carries the record name as its own accessible name', () => {
    renderWithApp(<Harness />);

    const box = screen.getByRole('checkbox', { name: 'Select Ada Lovelace' });
    expect(box).not.toBeChecked();
    // Not a toggle button wearing the checkbox class, which is what it was.
    expect(box).not.toHaveAttribute('aria-pressed');
  });
});
