/**
 * Organizations directory: loading, error, empty, and populated states.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Orgs } from './Orgs.js';

beforeEach(() => {
  resetMockApi();
});

describe('Organizations directory states', () => {
  it('shows a loading status while organizations fetch', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<Orgs />, { route: '/orgs' });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('timeout'));
    renderWithApp(<Orgs />, { route: '/orgs' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t load your organizations')).toBeInTheDocument();

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
});
