/**
 * Organizations directory: loading, error, empty, and populated states.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Orgs } from './Orgs.js';
import type * as AuthModule from '../lib/auth.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));
const organization = (index: number) => ({
  id: `o${index}`,
  title: `Organization ${String(index).padStart(2, '0')}`,
  kind: 'community',
  domain: `group${index}.example.com`,
  city: index === 0 ? 'Alexandria' : 'Cairo',
  peopleCount: index,
  affinity: 1 - index / 100,
  openRoles: index % 3,
});

beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
});

describe('Organizations directory states', () => {
  it('shows a loading status while organizations fetch', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<Orgs />, { route: '/orgs' });
    expect(screen.getByRole('status', { name: 'Loading organizations' })).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('timeout'));
    renderWithApp(<Orgs />, { route: '/orgs' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load your organizations")).toBeInTheDocument();

    mockApi.get.mockResolvedValueOnce({ orgs: [] });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No organizations yet')).toBeInTheDocument();
  });

  it('lists an organization when the directory is populated', async () => {
    mockApi.get.mockResolvedValue({
      orgs: [
        {
          id: 'o1',
          title: 'Nile Robotics',
          kind: 'company',
          domain: 'nile.com',
          city: 'Cairo',
          peopleCount: 3,
          affinity: 0.7,
          openRoles: 1,
        },
      ],
    });
    renderWithApp(<Orgs />, { route: '/orgs' });
    expect(await screen.findByRole('link', { name: /Nile Robotics/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
  });

  it('bounds the list and warns when search hides selected organizations', async () => {
    mockApi.get.mockResolvedValue({ orgs: Array.from({ length: 23 }, (_, i) => organization(i)) });
    const user = userEvent.setup();
    renderWithApp(<Orgs />);
    const list = await screen.findByRole('list', { name: 'Organizations' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    await user.click(screen.getByRole('checkbox', { name: 'Select Organization 00' }));
    await user.type(screen.getByLabelText('Search organizations'), 'group22.example.com');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/1 selected organization is not shown/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await user.click(screen.getByRole('button', { name: 'Show more organizations' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(23);
    expect(screen.queryByText(/selected organization is not shown/)).not.toBeInTheDocument();
  });

  it('restores URL search and sort, and offers recovery from no results', async () => {
    mockApi.get.mockResolvedValue({ orgs: [organization(0), organization(1), organization(2)] });
    const user = userEvent.setup();
    renderWithApp(<Orgs />, { route: '/network/organizations?q=Cairo&sort=people' });
    const list = await screen.findByRole('list', { name: 'Organizations' });
    expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Organization 02');
    expect(screen.getByLabelText('Search organizations')).toHaveValue('Cairo');
    await user.clear(screen.getByLabelText('Search organizations'));
    await user.type(screen.getByLabelText('Search organizations'), 'not-found');
    expect(await screen.findByText('No organizations match your search')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all organizations' }));
    expect(await screen.findByRole('list', { name: 'Organizations' })).toBeVisible();
  });

  it('keeps cached organizations visible after a failed refresh', async () => {
    mockApi.get
      .mockResolvedValueOnce({ orgs: [organization(0)] })
      .mockRejectedValue(new Error('offline'));
    renderWithApp(<Orgs />);
    await screen.findByRole('link', { name: /Organization 00/ });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh organizations' }));
    expect(await screen.findByText('Organizations could not be refreshed')).toBeVisible();
    expect(screen.getByRole('link', { name: /Organization 00/ })).toBeVisible();
  });

  it('treats a missing collection as failed data rather than an empty network', async () => {
    mockApi.get.mockResolvedValue({});
    renderWithApp(<Orgs />);
    await waitFor(() => expect(screen.getByText("Couldn't load your organizations")).toBeVisible());
    expect(screen.queryByText('No organizations yet')).not.toBeInTheDocument();
  });

  it('keeps browsing available without write entry points in a read-only workspace', async () => {
    permissions.canWrite = false;
    mockApi.get.mockResolvedValue({ orgs: [organization(0)] });
    renderWithApp(<Orgs />);
    expect(await screen.findByRole('link', { name: /Organization 00/ })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Select Organization 00' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add organization' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search organizations')).toBeEnabled();
  });
});
