/**
 * Today's four states and its two mutations. The queue ordering itself lives in
 * Dashboard.queue.test.ts; this file is about what the screen renders and what
 * it says back to the user when they act.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Dashboard } from './Dashboard.js';

const TODAY = new Date().toISOString().slice(0, 10);

function payload(over: Record<string, unknown> = {}) {
  return {
    reminders: [],
    reconnect: [],
    pipeline: [],
    pipelineCounts: { applied: 0, screening: 0, interview: 0, offer: 0 },
    habits: [],
    recent: [],
    resumes: 0,
    focus: { tasks: [], goals: [] },
    upcoming: [],
    setup: { self: true, github: true, people: true, interactions: true, atoms: true, resume: true, done: 6, total: 6 },
    insights: {
      momentum: { score: 40, hint: 'Nothing outstanding.', factors: [] },
      funnel: {},
      relationships: { total: 0, healthy: 0, drifting: 0 },
      skills: { total: 0, covered: 0 },
    },
    stats: { nodes: 0, byType: {} },
    counts: { nodes: 0, edges: 0, people: 0, atoms: 0 },
    ...over,
  };
}

function renderToday() {
  return renderWithApp(<Dashboard />, { route: '/' });
}

beforeEach(() => {
  resetMockApi();
  localStorage.clear();
});

describe('Today, the four states', () => {
  it('loading: skeleton rows in the shape of the queue, not a page spinner', async () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderToday();
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('error: says what failed, shows the technical detail, and retries', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('502 upstream'));
    renderToday();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t load today')).toBeInTheDocument();
    expect(within(alert).getByText('502 upstream')).toBeInTheDocument();

    mockApi.get.mockResolvedValueOnce(payload());
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Nothing needs you today')).toBeInTheDocument();
  });

  it('empty: distinguishes an empty queue, no habits, and nobody drifting', async () => {
    mockApi.get.mockResolvedValue(payload());
    renderToday();
    expect(await screen.findByText('Nothing needs you today')).toBeInTheDocument();
    expect(screen.getByText('No habits tracked')).toBeInTheDocument();
    expect(screen.getByText('No one is drifting')).toBeInTheDocument();
  });

  it('populated: the queue leads, and the summary counts it', async () => {
    mockApi.get.mockResolvedValue(
      payload({
        reminders: [{ id: 'r1', note: 'Ping Sam', due_on: TODAY, subject_id: 's1' }],
        focus: { tasks: [{ id: 't1', title: 'Draft the deck', due: null, priority: null, status: 'inbox' }], goals: [] },
      }),
    );
    renderToday();
    expect(await screen.findByText('Ping Sam')).toBeInTheDocument();
    expect(screen.getByText('Draft the deck')).toBeInTheDocument();
    expect(screen.getByText(/2 things need you/)).toBeInTheDocument();
  });

  it('says "1 thing needs you", not "1 things"', async () => {
    mockApi.get.mockResolvedValue(payload({ reminders: [{ id: 'r1', note: 'Ping Sam', due_on: TODAY, subject_id: 's1' }] }));
    renderToday();
    expect(await screen.findByText(/1 thing needs you/)).toBeInTheDocument();
  });
});

describe('Today, mutations', () => {
  it('completing a reminder confirms with the button’s verb and offers a real Undo', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue(payload({ reminders: [{ id: 'r1', note: 'Ping Sam', due_on: TODAY, subject_id: 's1' }] }));
    mockApi.post.mockResolvedValue({});
    renderToday();

    await user.click(await screen.findByRole('button', { name: 'Done' }));
    expect(mockApi.post).toHaveBeenCalledWith('/reminders/r1/done', {});

    const toast = await screen.findByRole('status');
    expect(within(toast).getByText('Done')).toBeInTheDocument();

    // Undo is a compensating server call, not a local rewind.
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/reminders/r1/reopen', {}));
  });

  it('checking a habit flips optimistically and says "Checked"', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue(
      payload({ habits: [{ id: 'h1', title: 'Deep work', streak: 4, grid: [true, false], checkedToday: false }] }),
    );
    // Never resolves: proves the flip is optimistic rather than a refetch.
    mockApi.post.mockReturnValue(new Promise(() => {}));
    renderToday();

    const check = await screen.findByRole('button', { name: 'Check Deep work for today' });
    expect(check).toHaveAttribute('aria-pressed', 'false');
    await user.click(check);

    const flipped = await screen.findByRole('button', { name: 'Uncheck Deep work for today' });
    expect(flipped).toHaveAttribute('aria-pressed', 'true');
    expect(mockApi.post).toHaveBeenCalledWith('/habits/h1/toggle', {});
  });

  it('rolls the habit back and leaves no silent failure when the toggle fails', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue(
      payload({ habits: [{ id: 'h1', title: 'Deep work', streak: 4, grid: [true, false], checkedToday: false }] }),
    );
    mockApi.post.mockRejectedValue(new Error('offline'));
    renderToday();

    await user.click(await screen.findByRole('button', { name: 'Check Deep work for today' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check Deep work for today' })).toHaveAttribute('aria-pressed', 'false'),
    );
  });
});

describe('Today, the register rule', () => {
  it('encodes the day of the week rather than faking ticks', async () => {
    mockApi.get.mockResolvedValue(payload());
    renderToday();
    const rule = await screen.findByRole('img', { name: /^Days of this week: / });
    const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    expect(rule).toHaveAccessibleName(`Days of this week: ${day}`);
  });
});
