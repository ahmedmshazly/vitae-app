/**
 * People directory: loading, error, empty, and populated states.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { People } from './People.js';

beforeEach(() => {
  resetMockApi();
});

describe('People directory states', () => {
  it('shows a loading status while the directory fetches', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<People />, { route: '/people' });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows an error with retry that reloads the directory', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('upstream 502'));
    renderWithApp(<People />, { route: '/people' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load your people")).toBeInTheDocument();
    expect(within(alert).getByText('upstream 502')).toBeInTheDocument();

    mockApi.get.mockResolvedValueOnce({ people: [] });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No one here yet')).toBeInTheDocument();
  });

  it('shows the empty graph message when there are no people', async () => {
    mockApi.get.mockResolvedValue({ people: [] });
    renderWithApp(<People />, { route: '/people' });
    expect(await screen.findByText('No one here yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first person' })).toBeInTheDocument();
  });

  it('lists people and filters to an empty matching set', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      people: [
        {
          id: 'p1',
          title: 'Ada Lovelace',
          headline: 'Analyst',
          org: 'Analytical Engine',
          city: 'London',
          topics: ['math'],
          relation: 'colleague',
          closeness: 4,
          cadenceTargetDays: 30,
          strength: 0.8,
          status: 'active',
          daysSinceLast: 3,
          lastInteraction: null,
          source: 'manual',
          recordCount: 2,
          isPlaceholder: false,
        },
      ],
    });
    renderWithApp(<People />, { route: '/people' });
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Friends' }));
    expect(await screen.findByText(/No one matches friends/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show everyone' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();
    });
  });
});
