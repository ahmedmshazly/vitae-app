/**
 * Ledger route: loading, empty, failed, and populated are four different
 * screens (NFR-REL-004), entries label themselves from their snapshots, and
 * a node entry links to its record while other kinds stay plain text.
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
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
    expect(await screen.findByText('Couldn’t load the ledger')).toBeInTheDocument();
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
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('notes_md')).toBeInTheDocument();
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
    expect(await screen.findByText('atom')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'atom' })).not.toBeInTheDocument();
  });

  it('speaks operations as verbs', () => {
    expect(opLabel('create')).toBe('created');
    expect(opLabel('restore')).toBe('restored');
    expect(opLabel('custom_op')).toBe('custom_op');
  });

  it('shows which field a change touched, not just that props changed', async () => {
    mockApi.get.mockResolvedValue({
      entries: [{ ...ENTRY, changed: ['props.status', 'props.next_step'] }],
      next_before: null,
    });
    renderWithApp(<Ledger />);
    expect(await screen.findByText('status')).toBeInTheDocument();
    expect(screen.getByText('next_step')).toBeInTheDocument();
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
