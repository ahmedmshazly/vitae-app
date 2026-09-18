/**
 * People directory: loading, error, empty, and populated states.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { People } from './People.js';
import type * as AuthModule from '../lib/auth.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));

beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
});

describe('People directory states', () => {
  it('keeps literal search words and prevents writes in a read-only workspace', async () => {
    permissions.canWrite = false;
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ people: [{ ...person(1), title: 'Allison' }] });
    renderWithApp(<People />);
    await screen.findByRole('link', { name: /Allison/ });
    await user.type(screen.getByLabelText('Search people'), 'all');
    expect(screen.getByLabelText('Search people')).toHaveValue('all');
    expect(screen.getByRole('link', { name: /Allison/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add person' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only workspace/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Allison' }));
    expect(screen.getByRole('button', { name: 'Move to trash' })).toBeDisabled();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });
  const person = (id: number) => ({
    id: `p${id}`,
    title: `Person ${String(id).padStart(2, '0')}`,
    headline: 'Researcher',
    org: 'Community lab',
    city: 'Cairo',
    topics: ['accessibility'],
    relation: 'friend',
    closeness: 4,
    cadenceTargetDays: 7,
    strength: id / 30,
    status: 'active',
    daysSinceLast: null,
    lastInteraction: null,
    source: 'manual',
    recordCount: 0,
    isPlaceholder: false,
  });

  it('preserves the relationship filters and ranks recent contact ahead of missing history', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      people: [
        person(0),
        { ...person(1), relation: 'sibling', closeness: 2, daysSinceLast: 20 },
        { ...person(2), relation: 'colleague', daysSinceLast: 0 },
      ],
    });
    renderWithApp(<People />, { route: '/people?sort=recent' });
    const list = await screen.findByRole('list', { name: 'People' });
    expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Person 02');
    await user.click(screen.getByRole('button', { name: 'Family' }));
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(within(list).getByRole('link')).toHaveTextContent('Person 01');
    await user.click(screen.getByRole('button', { name: 'Closest' }));
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'To revisit' }));
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(within(list).getByRole('link')).toHaveTextContent('Person 01');
    await user.click(screen.getByRole('button', { name: 'Colleagues' }));
    expect(within(list).getByRole('link')).toHaveTextContent('Person 02');
  });

  it('sorts contacts from the same day by their actual interaction timestamps', async () => {
    mockApi.get.mockResolvedValue({
      people: [
        {
          ...person(1),
          daysSinceLast: 0,
          lastInteraction: {
            title: 'Morning call',
            kind: 'call',
            occurredAt: '2026-09-14T08:00:00Z',
          },
        },
        {
          ...person(2),
          daysSinceLast: 0,
          lastInteraction: {
            title: 'Afternoon call',
            kind: 'call',
            occurredAt: '2026-09-14T16:00:00Z',
          },
        },
        person(3),
      ],
    });
    renderWithApp(<People />, { route: '/people?sort=recent' });
    const list = await screen.findByRole('list', { name: 'People' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent?.match(/Person \d+/)?.[0]),
    ).toEqual(['Person 02', 'Person 01', 'Person 03']);
  });

  it('bounds the list, sorts by name and makes selections outside the results explicit', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ people: Array.from({ length: 23 }, (_, i) => person(i)) });
    renderWithApp(<People />, { route: '/people?sort=name' });
    const list = await screen.findByRole('list', { name: 'People' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible' }));
    expect(screen.getByText('20 people selected')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search people'), 'Person 22');
    expect(await screen.findByText(/20 selected people are not shown/)).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.click(screen.getByRole('button', { name: 'Show more people' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(23);
  });

  it('distinguishes missing contact history from a missing cadence and searches profile context', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      people: [
        person(1),
        { ...person(2), cadenceTargetDays: null, org: 'Other company', city: 'London', topics: [] },
      ],
    });
    renderWithApp(<People />, { route: '/people' });
    expect(await screen.findByText('Every 7 days · Awaiting first contact')).toBeInTheDocument();
    expect(screen.getByText('No cadence set')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search people'), 'accessibility');
    expect(screen.queryByRole('link', { name: /Person 02/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Person 01/ })).toBeInTheDocument();
  });

  it('retains cached people on refresh failure instead of showing an empty directory', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValueOnce({ people: [person(1)] });
    renderWithApp(<People />, { route: '/people' });
    await screen.findByRole('link', { name: /Person 01/ });
    mockApi.get.mockRejectedValue(new Error('Refresh unavailable'));
    await user.click(screen.getByRole('button', { name: 'Refresh people' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByRole('link', { name: /Person 01/ })).toBeInTheDocument();
    expect(screen.queryByText('No one here yet')).not.toBeInTheDocument();
  });

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

  it('restores a supported filter from the URL and ignores an invalid one', async () => {
    mockApi.get.mockResolvedValue({
      people: [
        {
          id: 'p1',
          title: 'Ada Lovelace',
          headline: null,
          org: null,
          city: null,
          topics: [],
          relation: 'colleague',
          closeness: 4,
          cadenceTargetDays: null,
          strength: 0.8,
          status: 'active',
          daysSinceLast: null,
          lastInteraction: null,
          source: 'manual',
          recordCount: 0,
          isPlaceholder: false,
        },
      ],
    });
    const { unmount } = renderWithApp(<People />, { route: '/people?filter=friend' });
    expect(await screen.findByText(/No one matches friends/i)).toBeInTheDocument();
    unmount();

    renderWithApp(<People />, { route: '/people?filter=unknown' });
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();
  });
});
