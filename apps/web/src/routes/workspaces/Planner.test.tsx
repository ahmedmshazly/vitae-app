import '../../test/api-mock.js';
import { act, screen, within } from '@testing-library/react';
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
    mockApi.get.mockRejectedValue(new Error('planner unavailable'));
    renderWithApp(<Planner />, { route: '/today/planner' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load the planner")).toBeInTheDocument();
    expect(within(alert).getByText(/Your records have not been changed/)).toBeInTheDocument();

    mockApi.get.mockResolvedValue(emptyPlanner);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No items in this planner')).toBeInTheDocument();
  });

  it('distinguishes an empty horizon from a loading screen', async () => {
    mockApi.get.mockResolvedValue(emptyPlanner);
    renderWithApp(<Planner />, { route: '/today/planner' });
    expect(await screen.findByText('No items in this planner')).toBeInTheDocument();
    expect(screen.getByText(/Add a dated reminder with Capture/)).toBeInTheDocument();
  });

  it('treats a dashboard without optional planner collections as an honest empty horizon', async () => {
    mockApi.get.mockResolvedValue({});
    renderWithApp(<Planner />, { route: '/today/planner' });
    expect(await screen.findByText('No items in this planner')).toBeInTheDocument();
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
    expect(screen.getByText('Task · high priority')).toBeInTheDocument();
  });

  it('loads future reminders from the all-reminders endpoint, not the Today snapshot', async () => {
    mockApi.get.mockImplementation(async (path) => path === '/reminders?due=all' ? {
      reminders: [{ id: 'r1', note: 'Next month', due_on: '2030-12-01' }],
    } : { reminders: [{ id: 'old', note: 'Old snapshot' }] });
    renderWithApp(<Planner />);
    expect(await screen.findByText('Next month')).toBeInTheDocument();
    expect(screen.queryByText('Old snapshot')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Next month/ })).not.toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/reminders?due=all');
  });

  it('groups exact calendar dates rather than labels that collide in different years', async () => {
    mockApi.get.mockResolvedValue({ reminders: [
      { id: 'a', note: 'Earlier', due_on: '2024-01-01', subject_id: 'p1' },
      { id: 'b', note: 'Later', due_on: '2029-01-01', subject_id: 'p1' },
    ] });
    renderWithApp(<Planner />);
    expect(await screen.findByRole('heading', { name: /2024/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /2029/ })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /2024|2029/ })).toHaveLength(2);
  });

  it('keeps malformed imported dates available for review without crashing', async () => {
    mockApi.get.mockResolvedValue({ upcoming: [{ id: 'i1', title: 'Bad date', type: 'event', date: '2026-02-30', label: 'Event' }] });
    renderWithApp(<Planner />);
    expect(await screen.findByRole('heading', { name: 'Unscheduled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bad date/ })).toHaveTextContent('Date needs review');
  });

  it('initializes the filter from the URL and can recover from no results', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ reminders: [{ id: 'r1', note: 'Call Amina', due_on: '2030-04-12' }] });
    renderWithApp(<Planner />, { route: '/today/planner?show=tasks' });
    expect(await screen.findByText('No matching items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Show all items' }));
    expect(screen.getByText('Call Amina')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows available records and a partial-data warning when reminders fail', async () => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/reminders?due=all') throw new Error('offline');
      return { focus: { tasks: [{ id: 't1', title: 'Available task', due: null }] } };
    });
    renderWithApp(<Planner />);
    expect(await screen.findByText('This planner may be incomplete')).toBeInTheDocument();
    expect(screen.getByText('Available task')).toBeInTheDocument();
    expect(screen.getByText(/partial view/)).toBeInTheDocument();
    expect(screen.queryByText('No items in this planner')).not.toBeInTheDocument();
  });

  it('retains previously loaded reminders after a background-refresh failure', async () => {
    mockApi.get.mockResolvedValue({ reminders: [{ id: 'r1', note: 'Keep this reminder', due_on: '2030-04-12' }] });
    const { queryClient } = renderWithApp(<Planner />);
    expect(await screen.findByText('Keep this reminder')).toBeInTheDocument();
    mockApi.get.mockRejectedValue(new Error('offline'));
    await act(async () => { await queryClient.invalidateQueries(); });
    expect(await screen.findByText('This planner may be incomplete')).toBeInTheDocument();
    expect(screen.getByText('Keep this reminder')).toBeInTheDocument();
  });
});
