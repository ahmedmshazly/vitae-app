/**
 * Ledger route: loading, empty, failed, and populated are four different
 * screens (NFR-REL-004), entries label themselves from their snapshots, and
 * a node entry links to its record while other kinds stay plain text.
 */
import './../test/api-mock.js';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Ledger, opLabel } from './Ledger.js';

const ENTRY = {
  id: 'rev1',
  at: '2026-08-26T10:00:00.000Z',
  op: 'update',
  source: 'manual',
  subject_kind: 'node',
  subject_id: 'n1',
  rev: 3,
  title: 'Ada Lovelace',
  type: 'person',
  changed: ['title', 'notes_md'],
};

beforeEach(() => {
  resetMockApi();
});

describe('Ledger states', () => {
  it('reports a failed load instead of showing an empty feed', async () => {
    mockApi.get.mockRejectedValue(new Error('ledger unavailable'));
    renderWithApp(<Ledger />);
    expect(await screen.findByText("Couldn't load the ledger")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No changes yet')).not.toBeInTheDocument();
  });

  it('names the empty feed as an answer, not a gap', async () => {
    mockApi.get.mockResolvedValue({ entries: [], next_before: null });
    renderWithApp(<Ledger />);
    expect(await screen.findByText('No changes yet')).toBeInTheDocument();
  });

  it('renders an entry with its verb, fields, source, and record link', async () => {
    mockApi.get.mockResolvedValue({ entries: [ENTRY], next_before: null });
    renderWithApp(<Ledger />);
    expect(await screen.findByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/n/n1',
    );
    expect(screen.getByText('edited')).toBeInTheDocument();
    await userEvent.click(screen.getByText('2 changed fields'));
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Source: manual')).toBeInTheDocument();
    // No pagination control when the server says there is no older page.
    expect(screen.queryByRole('button', { name: /Load older/ })).not.toBeInTheDocument();
  });

  it('offers older changes only while the server reports another page', async () => {
    mockApi.get.mockResolvedValue({ entries: [ENTRY], next_before: ENTRY.at });
    renderWithApp(<Ledger />);
    expect(await screen.findByRole('button', { name: 'Load older changes' })).toBeInTheDocument();
  });

  it('labels a non-node subject without inventing a link', async () => {
    mockApi.get.mockResolvedValue({
      entries: [{ ...ENTRY, id: 'rev2', subject_kind: 'atom', title: null, type: null }],
      next_before: null,
    });
    renderWithApp(<Ledger />);
    expect(await screen.findByText('Résumé evidence')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Résumé evidence' })).not.toBeInTheDocument();
  });

  it('speaks operations as verbs', () => {
    expect(opLabel('create')).toBe('created');
    expect(opLabel('restore')).toBe('restored');
    expect(opLabel('archive')).toBe('archived');
    expect(opLabel('custom_op')).toBe('custom op');
  });

  it('shows which field a change touched, not just that props changed', async () => {
    mockApi.get.mockResolvedValue({
      entries: [{ ...ENTRY, changed: ['props.status', 'props.next_step'] }],
      next_before: null,
    });
    renderWithApp(<Ledger />);
    await userEvent.click(await screen.findByText('2 changed fields'));
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Next step')).toBeInTheDocument();
  });

  it('uses the first response cursor and appends an older page exactly once', async () => {
    const older = { ...ENTRY, id: 'rev0', title: 'Older record', at: '2026-08-25T10:00:00.000Z' };
    let resolveOlder!: (data: unknown) => void;
    mockApi.get.mockResolvedValueOnce({ entries: [ENTRY], next_before: ENTRY.at });
    mockApi.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve; }));
    renderWithApp(<Ledger />);
    const load = await screen.findByRole('button', { name: 'Load older changes' });
    fireEvent.click(load);
    fireEvent.click(load);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2));
    expect(mockApi.get).toHaveBeenLastCalledWith(`/ledger?limit=50&before=${encodeURIComponent(ENTRY.at)}`);
    expect(load).toBeDisabled();
    await act(async () => resolveOlder({ entries: [ENTRY, older], next_before: null }));
    expect(await screen.findByText('Older record')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ada Lovelace' })).toHaveLength(1);
    expect(screen.getByText('2 shown · 2 loaded')).toBeInTheDocument();
  });

  it('retries the failed older page without hiding or appending cached data', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValueOnce({ entries: [ENTRY], next_before: ENTRY.at });
    mockApi.get.mockRejectedValueOnce(new Error('offline'));
    renderWithApp(<Ledger />);
    await user.click(await screen.findByRole('button', { name: 'Load older changes' }));
    expect(await screen.findByText("Couldn't load older changes")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
    const older = { ...ENTRY, id: 'rev0', title: 'Recovered page' };
    mockApi.get.mockResolvedValueOnce({ entries: [older], next_before: null });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered page')).toBeInTheDocument();
    expect(mockApi.get.mock.calls[1]).toEqual(mockApi.get.mock.calls[2]);
  });

  it('retains loaded history on background failure and recovers on refresh', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ entries: [ENTRY], next_before: null });
    renderWithApp(<Ledger />);
    await screen.findByRole('link', { name: 'Ada Lovelace' });
    mockApi.get.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Refresh changes' }));
    expect(await screen.findByText("Couldn't refresh the ledger")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the ledger")).not.toBeInTheDocument();
    mockApi.get.mockResolvedValueOnce({ entries: [ENTRY], next_before: null });
    await user.click(screen.getByRole('button', { name: 'Refresh changes' }));
    await waitFor(() => expect(screen.queryByText("Couldn't refresh the ledger")).not.toBeInTheDocument());
  });

  it('filters loaded entries using URL state and exposes no-results recovery', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ entries: [ENTRY, { ...ENTRY, id: 'r2', op: 'create', title: 'A new project' }], next_before: ENTRY.at });
    renderWithApp(<Ledger />, { route: '/today/ledger?op=create&kind=node&q=project' });
    expect(await screen.findByRole('link', { name: 'A new project' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), ' missing');
    expect(screen.getByText('No matching loaded changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load older changes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('2 shown · 2 loaded · Older history available')).toBeInTheDocument();
  });

  it('reveals every changed field, including fields beyond the old four-field cutoff', async () => {
    mockApi.get.mockResolvedValue({ entries: [{ ...ENTRY, changed: ['title', 'props.role', 'props.team', 'props.city', 'props.next_step', 'props.notes'] }], next_before: null });
    renderWithApp(<Ledger />);
    const summary = await screen.findByText('6 changed fields');
    await userEvent.click(summary);
    const details = summary.closest('details')!;
    expect(details).toHaveAttribute('open');
    expect(within(details).getAllByRole('listitem')).toHaveLength(6);
    expect(within(details).getByText('Next step')).toHaveAttribute('title', 'props.next_step');
    expect(within(details).getByRole('link', { name: 'Open record and history' })).toHaveAttribute('href', '/n/n1');
  });

  it('handles missing source, invalid dates, and unknown actions without crashing', async () => {
    mockApi.get.mockResolvedValue({ entries: [{ ...ENTRY, at: 'unknown', op: 'custom_op', source: null, changed: null }], next_before: null });
    renderWithApp(<Ledger />);
    expect(await screen.findByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source: unknown')).toBeInTheDocument();
    expect(screen.getByText('custom op')).toBeInTheDocument();
    expect(screen.getByText('No field-level changes recorded.')).toBeInTheDocument();
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
