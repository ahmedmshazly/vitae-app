import '../../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { Planner } from './Planner.js';

const emptyPlanner = {
  reminders: [],
  focus: { tasks: [] },
  upcoming: [],
};

beforeEach(() => {
  resetMockApi();
});

describe('Planner states', () => {
  it('uses a route-shaped loading state', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<Planner />, { route: '/today/planner' });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('explains a failed request and retries it', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('planner unavailable'));
    renderWithApp(<Planner />, { route: '/today/planner' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load the planner")).toBeInTheDocument();
    expect(within(alert).getByText('planner unavailable')).toBeInTheDocument();

    mockApi.get.mockResolvedValueOnce(emptyPlanner);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('The horizon is clear')).toBeInTheDocument();
  });

  it('distinguishes an empty horizon from a loading screen', async () => {
    mockApi.get.mockResolvedValue(emptyPlanner);
    renderWithApp(<Planner />, { route: '/today/planner' });
    expect(await screen.findByText('The horizon is clear')).toBeInTheDocument();
    expect(screen.getByText(/New reminders, tasks, and dated records/)).toBeInTheDocument();
  });

  it('combines reminders, tasks, and upcoming evidence into a dated ledger', async () => {
    mockApi.get.mockResolvedValue({
      reminders: [{ id: 'r1', note: 'Call Amina', due_on: '2030-04-12', subject_id: 'person-1' }],
      focus: {
        tasks: [
          {
            id: 't1',
            title: 'Send portfolio',
            due: '2030-04-13',
            priority: 'high',
            status: 'inbox',
          },
        ],
      },
      upcoming: [
        {
          id: 'i1',
          type: 'interview',
          title: 'Portfolio review',
          date: '2030-04-14',
          label: 'Interview',
        },
      ],
    });
    renderWithApp(<Planner />, { route: '/today/planner' });

    expect(await screen.findByRole('link', { name: /Call Amina/ })).toHaveAttribute(
      'href',
      '/n/person-1',
    );
    expect(screen.getByRole('link', { name: /Send portfolio/ })).toHaveAttribute('href', '/n/t1');
    expect(screen.getByRole('link', { name: /Portfolio review/ })).toHaveAttribute('href', '/n/i1');
    expect(screen.getByText('high priority')).toBeInTheDocument();
  });
});
