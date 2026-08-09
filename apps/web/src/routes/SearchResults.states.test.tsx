/**
 * Search route: grammar landing, loading, error, and empty match states.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { SearchResults } from './SearchResults.js';

beforeEach(() => {
  resetMockApi();
});

describe('Search route states', () => {
  it('shows the filter grammar when there is no query', () => {
    renderWithApp(<SearchResults />, { route: '/search' });
    expect(screen.getByText('Filter grammar')).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('shows an error with retry for a failed search', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('search index down'));
    renderWithApp(<SearchResults />, { route: '/search?q=ada' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t run that search')).toBeInTheDocument();
    expect(within(alert).getByText('search index down')).toBeInTheDocument();

    mockApi.get.mockResolvedValueOnce({
      ast: { text: 'ada', clauses: [], invalid: [] },
      results: [],
    });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('lists a match for a populated result set', async () => {
    mockApi.get.mockResolvedValue({
      ast: { text: 'ada', clauses: [], invalid: [] },
      results: [
        {
          id: 'p1',
          type: 'person',
          title: 'Ada Lovelace',
          subtitle: 'Analyst',
          source: 'manual',
          confidence: 1,
          updated_at: '2026-08-01T00:00:00.000Z',
          _score: 1,
        },
      ],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=ada' });
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();
  });
});
