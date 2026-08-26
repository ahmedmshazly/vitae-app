/**
 * Correspondence route: loading, failed, and the two different empties are
 * distinct screens (NFR-REL-004); a candidate row shows its evidence and
 * factor decomposition (NFR-PRIV-003) and links to the person; the register
 * states how many dormant ties were considered, so a cap cannot read as a
 * census.
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Correspondence } from './Correspondence.js';

const CANDIDATE = {
  person: { id: 'p1', title: 'Tarek Aziz', type: 'person' },
  score: 0.71,
  peak_strength: 0.71,
  peak_at: '2025-03-14T00:00:00.000Z',
  current_strength: 0.31,
  days_since_last: 210,
  factors: { closeness: 0.36, intensity: 0.35 },
};

beforeEach(() => {
  resetMockApi();
});

describe('Correspondence states', () => {
  it('reports a failed load instead of an empty rollup', async () => {
    mockApi.get.mockRejectedValue(new Error('rollup unavailable'));
    renderWithApp(<Correspondence />);
    expect(await screen.findByText('Couldn’t load correspondence')).toBeInTheDocument();
    expect(screen.queryByText('No dormant ties')).not.toBeInTheDocument();
  });

  it('tells a quiet graph apart from a graph with nothing worth reactivating', async () => {
    mockApi.get.mockResolvedValue({ candidates: [], considered_dormant: 0, brokers: [] });
    renderWithApp(<Correspondence />);
    expect(await screen.findByText('No dormant ties')).toBeInTheDocument();

    resetMockApi();
    mockApi.get.mockResolvedValue({ candidates: [], considered_dormant: 3, brokers: [] });
    renderWithApp(<Correspondence />);
    expect(await screen.findByText('Nothing worth reactivating')).toBeInTheDocument();
    expect(screen.getByText(/3 dormant ties were considered/)).toBeInTheDocument();
  });

  it('shows a candidate with its evidence, factors, and person link', async () => {
    mockApi.get.mockResolvedValue({
      candidates: [CANDIDATE],
      considered_dormant: 5,
      brokers: [{ via: 'DevFest', count: 2 }],
      introduced_brokers: [
        { via: 'p9', person_id: 'p9', label: 'Nadia Broker', count: 1, edge_ids: ['e1'] },
      ],
      out_of_balance: [
        {
          person: { id: 'p1', title: 'Tarek Aziz', type: 'person' },
          ratio: 1,
          outbound: 5,
          inbound: 0,
          unanswered_inbound: 0,
        },
      ],
    });
    renderWithApp(<Correspondence />);
    expect(await screen.findAllByRole('link', { name: 'Tarek Aziz' })).toHaveLength(2);
    expect(screen.getByText('0.71')).toBeInTheDocument();
    expect(screen.getByText('210d')).toBeInTheDocument();
    expect(screen.getByText('closeness')).toBeInTheDocument();
    expect(screen.getByText('intensity')).toBeInTheDocument();
    expect(screen.getByText('5 dormant ties considered.')).toBeInTheDocument();
    // The two broker groups stay labeled apart: recorded edges vs met-via text.
    expect(screen.getByRole('link', { name: 'Nadia Broker' })).toHaveAttribute(
      'href',
      '/network/people/p9',
    );
    expect(screen.getByText('1 introduction')).toBeInTheDocument();
    expect(screen.getByText('DevFest')).toBeInTheDocument();
    expect(screen.getByText('2 credits')).toBeInTheDocument();
    // Imbalance rows come from the same profile the person panel shows.
    expect(screen.getByText('100% yours')).toBeInTheDocument();
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
