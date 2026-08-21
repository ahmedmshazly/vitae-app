/**
 * The four states, the two empties, the degraded secondary, and the promise
 * that a skeleton never overlaps the content it is standing in for.
 */
import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { Button, EmptyState, SkeletonText } from '@vitae/ui';
import { enter } from '../lib/motion.js';
import { renderWithApp } from '../test/render.js';
import {
  QueryBoundary,
  keepLastResults,
  listQueryOptions,
  type QueryLike,
} from './QueryBoundary.js';

interface PeopleResp {
  people: Array<{ id: string; title: string }>;
}

const LINA = { id: 'p1', title: 'Lina Farouk' };
const DANA = { id: 'p2', title: 'Dana Okafor' };

/** A query result with only the fields the boundary reads. */
function fakeQuery<T>(
  over: Partial<Omit<QueryLike<T>, 'refetch'>> = {},
): QueryLike<T> & { refetch: ReturnType<typeof vi.fn> } {
  const refetch = vi.fn();
  return { data: undefined, isPending: false, isError: false, error: null, ...over, refetch };
}

function peopleList(data: PeopleResp) {
  return (
    <ul aria-label="People">
      {data.people.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  );
}

describe('QueryBoundary states', () => {
  it('renders the default skeleton while the query is pending, and no children', () => {
    const query = fakeQuery<PeopleResp>({ isPending: true });
    renderWithApp(<QueryBoundary query={query}>{peopleList}</QueryBoundary>);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).not.toBeInTheDocument();
  });

  it('renders a shape-matched skeleton instead of the default when one is given', () => {
    const query = fakeQuery<PeopleResp>({ isPending: true });
    renderWithApp(
      <QueryBoundary
        query={query}
        loading={
          <div data-testid="letter-skeleton">
            <SkeletonText lines={4} />
          </div>
        }
        loadingLabel="Loading letter editor"
      >
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByTestId('letter-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading letter editor' })).toBeInTheDocument();
  });

  it('treats a settled query with no data as still loading, which is the isLoading || !data idiom', () => {
    const query = fakeQuery<PeopleResp>({ isPending: false, data: undefined });
    renderWithApp(<QueryBoundary query={query}>{peopleList}</QueryBoundary>);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('trusts isPending over a value sitting in the data slot, so a disabled query never states facts', () => {
    // TanStack only reports pending while it has nothing of its own: a query
    // holding placeholder data reports success. Pending plus a value is a
    // caller who wired the slot by hand, and the honest answer is still
    // "not yet".
    const query = fakeQuery<PeopleResp>({ isPending: true, data: { people: [LINA] } });
    renderWithApp(<QueryBoundary query={query}>{peopleList}</QueryBoundary>);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Lina Farouk')).not.toBeInTheDocument();
  });

  it('renders the error state with the failure message, and never the children', () => {
    const query = fakeQuery<PeopleResp>({ isError: true, error: new Error('graph unreachable') });
    renderWithApp(
      <QueryBoundary query={query} errorTitle="Couldn’t load your people">
        {peopleList}
      </QueryBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load your people');
    expect(alert).toHaveTextContent('graph unreachable');
    expect(screen.queryByRole('list', { name: 'People' })).not.toBeInTheDocument();
  });

  it('keeps truthful cached data visible when a background refresh fails', () => {
    const query = fakeQuery<PeopleResp>({
      data: { people: [LINA] },
      isError: true,
      error: new Error('network offline'),
    });
    renderWithApp(
      <QueryBoundary query={query} className="people-region">
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t refresh this data');
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last available version');
    expect(document.querySelector('.people-region')).toHaveAttribute('data-query-state', 'content');
  });

  it('reports a background refresh without blanking the current view', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [LINA] }, isFetching: true });
    renderWithApp(
      <QueryBoundary query={query} className="people-region" refreshingLabel="Refreshing people">
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.getByText('Refreshing people')).toBeInTheDocument();
    expect(document.querySelector('.people-region')).toHaveAttribute('aria-busy', 'true');
  });

  it('does not offer a dead Retry control when the source cannot refetch', () => {
    const query: QueryLike<PeopleResp> = {
      data: undefined,
      isPending: false,
      isError: true,
      error: 'This source is no longer available',
    };
    renderWithApp(<QueryBoundary query={query}>{peopleList}</QueryBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('This source is no longer available');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('wires the error Retry to refetch on every query it was handed', async () => {
    const user = userEvent.setup();
    const people = fakeQuery<PeopleResp>({ isError: true, error: new Error('graph unreachable') });
    const counts = fakeQuery<number[]>({ data: [1] });
    renderWithApp(<QueryBoundary query={[people, counts]}>{() => <p>rows</p>}</QueryBoundary>);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(people.refetch).toHaveBeenCalledTimes(1);
    expect(counts.refetch).toHaveBeenCalledTimes(1);
  });

  it('calls children with the data once it resolves', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [LINA, DANA] } });
    renderWithApp(<QueryBoundary query={query}>{peopleList}</QueryBoundary>);

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.getByText('Dana Okafor')).toBeInTheDocument();
  });

  it('holds the loading state until every query in a tuple has resolved, then hands over both', () => {
    const people = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    const pending = fakeQuery<{ total: number }>({ isPending: true });
    const view = renderWithApp(
      <QueryBoundary query={[people, pending]}>
        {([list, stats]) => (
          <p>
            {list.people[0].title} of {stats.total}
          </p>
        )}
      </QueryBoundary>,
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    const settled = fakeQuery<{ total: number }>({ data: { total: 12 } });
    view.rerender(
      <QueryBoundary query={[people, settled]}>
        {([list, stats]) => (
          <p>
            {list.people[0].title} of {stats.total}
          </p>
        )}
      </QueryBoundary>,
    );
    expect(screen.getByText('Lina Farouk of 12')).toBeInTheDocument();
  });
});

describe('QueryBoundary empties', () => {
  const nothing = (
    <EmptyState glyph="person" title="No one here yet" hint="Add the first person you know." />
  );
  const noMatch = (
    <EmptyState
      glyph="filter"
      title="No one matches Decaying"
      hint="You have 118 people; none of them fit this filter."
      action={<Button size="sm">Show everyone</Button>}
    />
  );

  it('shows the nothing-yet empty when no filter is narrowing the list', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [] } });
    renderWithApp(
      <QueryBoundary
        query={query}
        isEmpty={(d) => d.people.length === 0}
        empty={nothing}
        emptyFiltered={noMatch}
      >
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('No one here yet')).toBeInTheDocument();
    expect(screen.queryByText('No one matches Decaying')).not.toBeInTheDocument();
  });

  it('shows the nothing-matched empty, with its own way out, when a filter is on', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    renderWithApp(
      <QueryBoundary
        query={query}
        filtered
        isEmpty={() => true}
        empty={nothing}
        emptyFiltered={noMatch}
      >
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('No one matches Decaying')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show everyone' })).toBeInTheDocument();
    expect(screen.queryByText('No one here yet')).not.toBeInTheDocument();
    expect(document.querySelector('[data-query-state="empty-filtered"]')).not.toBeNull();
  });

  it('prefers the nothing-yet copy when a filter is on but the set itself is empty, the Atoms case', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [] } });
    renderWithApp(
      <QueryBoundary
        query={query}
        filtered
        isEmpty={() => true}
        isSourceEmpty={(d) => d.people.length === 0}
        empty={nothing}
        emptyFiltered={noMatch}
      >
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('No one here yet')).toBeInTheDocument();
    expect(screen.queryByText('No one matches Decaying')).not.toBeInTheDocument();
  });

  it('reads the one-key wrapper every list endpoint here returns, so people: [] is empty', () => {
    const query = fakeQuery<PeopleResp>({ data: { people: [] } });
    const view = renderWithApp(
      <QueryBoundary query={query} empty={nothing}>
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('No one here yet')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).not.toBeInTheDocument();

    // A key carrying nothing, a cursor the server left unset, is not a second
    // thing in the response.
    const paged = fakeQuery<{ people: PeopleResp['people']; nextPage: string | null }>({
      data: { people: [], nextPage: null },
    });
    view.rerender(
      <QueryBoundary query={paged} empty={nothing}>
        {peopleList}
      </QueryBoundary>,
    );
    expect(screen.getByText('No one here yet')).toBeInTheDocument();
  });

  it('leaves a response carrying more than the one list to the caller isEmpty', () => {
    const query = fakeQuery<{ atoms: string[]; owners: string[] }>({
      data: { atoms: [], owners: ['p1'] },
    });
    renderWithApp(
      <QueryBoundary query={query} empty={nothing}>
        {(d) => (
          <p>
            {d.atoms.length} of {d.owners.length}
          </p>
        )}
      </QueryBoundary>,
    );

    expect(screen.getByText('0 of 1')).toBeInTheDocument();
    expect(screen.queryByText('No one here yet')).not.toBeInTheDocument();
  });

  it('falls back to the default emptiness check for a query that returns a bare list', () => {
    const query = fakeQuery<string[]>({ data: [] });
    renderWithApp(
      <QueryBoundary query={query} empty={nothing}>
        {(rows) => <p>{rows.length} rows</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText('No one here yet')).toBeInTheDocument();
  });

  it('renders children when the caller supplied no empty slot at all', () => {
    const query = fakeQuery<string[]>({ data: [] });
    renderWithApp(
      <QueryBoundary query={query}>{(rows) => <p>{rows.length} rows</p>}</QueryBoundary>,
    );

    expect(screen.getByText('0 rows')).toBeInTheDocument();
  });
});

describe('QueryBoundary degraded secondary queries', () => {
  it('keeps rendering the children and adds a compact banner naming what failed', () => {
    const record = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    renderWithApp(
      <QueryBoundary query={record} secondary={[{ query: history, label: 'the history' }]}>
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the history');
  });

  it('says nothing when the secondary query is fine', () => {
    const record = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    const history = fakeQuery<{ revisions: string[] }>({ data: { revisions: ['create'] } });
    renderWithApp(
      <QueryBoundary query={record} secondary={[{ query: history, label: 'the history' }]}>
        {peopleList}
      </QueryBoundary>,
    );

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries only the secondary query from its own banner', async () => {
    const user = userEvent.setup();
    const record = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    renderWithApp(
      <QueryBoundary query={record} secondary={[{ query: history, label: 'the history' }]}>
        {peopleList}
      </QueryBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(history.refetch).toHaveBeenCalledTimes(1);
    expect(record.refetch).not.toHaveBeenCalled();
  });

  it('reports a degraded secondary over the empty state too, so the empty is not read as fact', () => {
    const record = fakeQuery<string[]>({ data: [] });
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    renderWithApp(
      <QueryBoundary
        query={record}
        secondary={[{ query: history, label: 'the history' }]}
        empty={<EmptyState title="No interactions logged yet" />}
      >
        {(rows) => <p>{rows.length} rows</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText('No interactions logged yet')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the history');
  });

  it('gathers two failed secondaries into one banner, so no two controls share the name Retry', async () => {
    const user = userEvent.setup();
    const record = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    const ledger = fakeQuery<{ owed: number }>({
      isError: true,
      error: new Error('ledger offline'),
    });
    renderWithApp(
      <QueryBoundary
        query={record}
        secondary={[
          { query: history, label: 'the history' },
          { query: ledger, label: 'the favour ledger' },
        ]}
      >
        {peopleList}
      </QueryBoundary>,
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    // One banner names both, because a banner each would have every one of them
    // claim everything else was current while the other had also failed.
    expect(alerts[0]).toHaveTextContent('Couldn’t load the history and the favour ledger');

    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(1);
    await user.click(retries[0]);
    expect(history.refetch).toHaveBeenCalledTimes(1);
    expect(ledger.refetch).toHaveBeenCalledTimes(1);
    expect(record.refetch).not.toHaveBeenCalled();
    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
  });

  it('renders a sub-region failure as a compact banner rather than a full panel', () => {
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    renderWithApp(
      <QueryBoundary query={history} compact errorTitle="Couldn’t load the history">
        {(d) => <p>{d.revisions.length}</p>}
      </QueryBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('vt-banner');
    expect(alert).toHaveTextContent('Couldn’t load the history');
    expect(alert).toHaveTextContent('history pruned');
  });

  it('gives that compact banner the Retry that is its only way out', async () => {
    const user = userEvent.setup();
    const history = fakeQuery<{ revisions: string[] }>({
      isError: true,
      error: new Error('history pruned'),
    });
    renderWithApp(
      <QueryBoundary query={history} compact errorTitle="Couldn’t load the history">
        {(d) => <p>{d.revisions.length}</p>}
      </QueryBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(history.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('QueryBoundary box', () => {
  // A skeleton is only shaped like the content if it is in the same box as the
  // content: one element, carrying the caller's class, in every phase. Spilling
  // the rows into the caller's element would hand a parent grid six children
  // and then one, and the region would change shape as the data landed.
  it('puts the loading phase in one element with the caller className, like the phase it stands in for', () => {
    const pending = fakeQuery<PeopleResp>({ isPending: true });
    const view = renderWithApp(
      <QueryBoundary query={pending} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );

    expect(view.container.querySelectorAll('.atom-grid')).toHaveLength(1);
    const loadingBox = view.container.querySelector('.atom-grid') as HTMLElement;
    expect(loadingBox).toHaveClass('atom-grid');
    expect(within(loadingBox).getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    const settled = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    view.rerender(
      <QueryBoundary query={settled} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );

    expect(view.container.querySelectorAll('.atom-grid')).toHaveLength(1);
    const contentBox = view.container.querySelector('.atom-grid') as HTMLElement;
    expect(contentBox).toHaveClass('atom-grid');
    expect(within(contentBox).getByRole('list')).toBeInTheDocument();
  });

  it('carries the className on the error and empty phases too', () => {
    const failed = fakeQuery<PeopleResp>({ isError: true, error: new Error('graph unreachable') });
    const view = renderWithApp(
      <QueryBoundary query={failed} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );
    expect(view.container.firstElementChild).toHaveClass('atom-grid');
    expect(
      within(view.container.firstElementChild as HTMLElement).getByRole('alert'),
    ).toBeInTheDocument();

    const none = fakeQuery<PeopleResp>({ data: { people: [] } });
    view.rerender(
      <QueryBoundary
        query={none}
        className="atom-grid"
        empty={<EmptyState title="No one here yet" />}
      >
        {peopleList}
      </QueryBoundary>,
    );
    expect(view.container.firstElementChild).toHaveClass('atom-grid');
    expect(
      within(view.container.firstElementChild as HTMLElement).getByText('No one here yet'),
    ).toBeInTheDocument();
  });
});

describe('QueryBoundary motion', () => {
  /** Where the brand entrance starts: opacity 0 and the 4px rise, from motion.ts. */
  const START = enter(false).initial as unknown as { opacity: number; y: number };

  it('enters a resolved phase on the brand entrance, and lets the skeleton sit still', () => {
    const pending = fakeQuery<PeopleResp>({ isPending: true });
    const view = renderWithApp(
      <QueryBoundary query={pending} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );
    // The skeleton stops, the content enters. Two entrances for one arrival is
    // the cross-fade ch.08 bans.
    expect((view.container.firstElementChild as HTMLElement).style.opacity).toBe('');

    const settled = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    view.rerender(
      <QueryBoundary query={settled} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );

    const contentBox = view.container.firstElementChild as HTMLElement;
    expect(contentBox.style.opacity).toBe(String(START.opacity));
    expect(contentBox.style.transform).toBe(`translateY(${START.y}px)`);
  });

  it('replays the entrance when one resolved phase replaces another, which is what keying on the phase buys', () => {
    const failed = fakeQuery<PeopleResp>({ isError: true, error: new Error('graph unreachable') });
    const view = renderWithApp(
      <QueryBoundary query={failed} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );
    const errorBox = view.container.firstElementChild;

    const settled = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    view.rerender(
      <QueryBoundary query={settled} className="atom-grid">
        {peopleList}
      </QueryBoundary>,
    );

    const contentBox = view.container.firstElementChild as HTMLElement;
    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    // A reused node is a node whose initial state never runs again: after a
    // Retry succeeds the content would appear with no entrance at all.
    expect(contentBox).not.toBe(errorBox);
    expect(contentBox.style.transform).toBe(`translateY(${START.y}px)`);
  });

  it('unmounts the skeleton in the same commit that mounts the content, never both at once', () => {
    const pending = fakeQuery<PeopleResp>({ isPending: true });
    const view = renderWithApp(<QueryBoundary query={pending}>{peopleList}</QueryBoundary>);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    const settled = fakeQuery<PeopleResp>({ data: { people: [LINA] } });
    view.rerender(<QueryBoundary query={settled}>{peopleList}</QueryBoundary>);

    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.vt-skel')).toHaveLength(0);
  });
});

/** One query, one key, and a second page the test releases when it chooses. */
function ListHarness({
  options,
  fetchPage,
}: {
  options: 'kept' | 'plain';
  fetchPage: (page: number) => Promise<PeopleResp>;
}) {
  const [page, setPage] = useState(1);
  const base = { queryKey: ['people', page] as const, queryFn: () => fetchPage(page) };
  const query = useQuery(options === 'kept' ? listQueryOptions(base) : base);
  return (
    <div>
      <button onClick={() => setPage(2)}>Next page</button>
      <QueryBoundary query={query}>{peopleList}</QueryBoundary>
    </div>
  );
}

/** Page 1 lands at once; page 2 hangs until the test says so. */
function pagedFetch() {
  let release: (value: PeopleResp) => void = () => {};
  const fetchPage = (page: number) =>
    page === 1
      ? Promise.resolve({ people: [LINA] })
      : new Promise<PeopleResp>((resolve) => {
          release = resolve;
        });
  return { fetchPage, land: () => release({ people: [DANA] }) };
}

/** Two real query results, to prove the tuple keeps its per-query types. */
function TupleHarness() {
  const people = useQuery({
    queryKey: ['people'],
    queryFn: () => Promise.resolve({ people: [LINA] }),
  });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => Promise.resolve({ total: 7 }) });
  return (
    <QueryBoundary query={[people, stats]}>
      {([list, counts]) => (
        <p>
          {list.people[0].title} of {counts.total}
        </p>
      )}
    </QueryBoundary>
  );
}

describe('QueryBoundary with real query results', () => {
  it('resolves a tuple of TanStack results into one datum per query', async () => {
    renderWithApp(<TupleHarness />);
    expect(await screen.findByText('Lina Farouk of 7')).toBeInTheDocument();
  });
});

describe('keepLastResults', () => {
  it('is the one-line spelling of placeholderData', () => {
    expect(keepLastResults.placeholderData).toBeTypeOf('function');
    expect(
      listQueryOptions({ queryKey: ['atoms'], queryFn: () => Promise.resolve(1) }),
    ).toMatchObject({
      placeholderData: keepLastResults.placeholderData,
    });
  });

  it('keeps the previous results on screen while the next parameters fly', async () => {
    const user = userEvent.setup();
    const paged = pagedFetch();
    renderWithApp(<ListHarness options="kept" fetchPage={paged.fetchPage} />);
    expect(await screen.findByText('Lina Farouk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Lina Farouk')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();

    paged.land();
    expect(await screen.findByText('Dana Okafor')).toBeInTheDocument();
  });

  it('without it the same list blanks to a skeleton on every parameter change', async () => {
    const user = userEvent.setup();
    const paged = pagedFetch();
    renderWithApp(<ListHarness options="plain" fetchPage={paged.fetchPage} />);
    expect(await screen.findByText('Lina Farouk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Lina Farouk')).not.toBeInTheDocument();

    paged.land();
    await waitFor(() => expect(screen.getByText('Dana Okafor')).toBeInTheDocument());
  });
});
