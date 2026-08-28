/**
 * Search route: grammar landing, loading, error, and empty match states, plus
 * the two shapes the screen used to invent for itself. The query bar was a
 * `div` holding a borderless input, and the parsed clauses were hand-built
 * chips whose remove control was roughly eight pixels wide and called
 * "Remove filter" only in a title attribute.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { SEARCH_GRAMMAR, SearchResults } from './SearchResults.js';

const hit = {
  id: 'p1',
  type: 'person',
  title: 'Ada Lovelace',
  subtitle: 'Analyst',
  source: 'manual',
  confidence: 1,
  updated_at: '2026-08-01T00:00:00.000Z',
  _score: 1,
};

beforeEach(() => {
  resetMockApi();
});

describe('Search route states', () => {
  it('shows the filter grammar when there is no query', () => {
    renderWithApp(<SearchResults />, { route: '/search' });
    expect(screen.getByText('Filter grammar')).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('puts the query in a form with the shared field', () => {
    renderWithApp(<SearchResults />, { route: '/search' });

    const bar = screen.getByRole('search');
    expect(bar.tagName).toBe('FORM');
    expect(within(bar).getByLabelText('Search query')).toBeInTheDocument();
  });

  it('offers the grammar as a list of runnable examples', () => {
    renderWithApp(<SearchResults />, { route: '/search' });

    const region = screen.getByRole('region', { name: /^Filter grammar/ });
    expect(within(region).getAllByRole('listitem')).toHaveLength(SEARCH_GRAMMAR.length);
    expect(within(region).getByRole('button', { name: /^type:person/ })).toBeInTheDocument();
  });

  it('shows an error with retry for a failed search', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('search index down'));
    renderWithApp(<SearchResults />, { route: '/search?q=ada' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't run that search")).toBeInTheDocument();
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
      results: [hit],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=ada' });
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();
  });

  it('is a real list, and keeps the facts that separate two matches out of the link', async () => {
    mockApi.get.mockResolvedValue({
      ast: { text: 'ada', clauses: [], invalid: [] },
      results: [hit, { ...hit, id: 'p2', subtitle: 'Second of the two' }],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=ada' });

    const link = await screen.findByRole('link', { name: /Analyst/ });
    expect(link).not.toHaveTextContent('2026-08-01');

    const section = screen.getByRole('region', { name: /^Matches/ });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(link.closest('li')!).getByText('2026-08-01')).toBeInTheDocument();
  });

  it('names each clause remove control after the filter it takes off', async () => {
    mockApi.get.mockResolvedValue({
      ast: {
        text: '',
        clauses: [{ field: 'type', value: 'person', raw: 'type:person' }],
        invalid: [],
      },
      results: [hit],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=type%3Aperson' });

    expect(
      await screen.findByRole('button', { name: 'Remove filter type:person' }),
    ).toBeInTheDocument();
  });

  it('takes the filter off the query when its chip is removed', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      ast: {
        text: '',
        clauses: [{ field: 'type', value: 'person', raw: 'type:person' }],
        invalid: [],
      },
      results: [hit],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=type%3Aperson' });

    await user.click(await screen.findByRole('button', { name: 'Remove filter type:person' }));
    expect(await screen.findByText('Filter grammar')).toBeInTheDocument();
    expect(screen.getByLabelText('Search query')).toHaveValue('');
  });

  it('explains an unparseable filter in words rather than in a tooltip', async () => {
    mockApi.get.mockResolvedValue({
      ast: {
        text: '',
        clauses: [],
        invalid: [{ raw: 'is:wombat', reason: 'expected one of pinned, archived' }],
      },
      results: [],
    });
    renderWithApp(<SearchResults />, { route: '/search?q=is%3Awombat' });

    expect(
      await screen.findByText('is:wombat: expected one of pinned, archived'),
    ).toBeInTheDocument();
  });
});
