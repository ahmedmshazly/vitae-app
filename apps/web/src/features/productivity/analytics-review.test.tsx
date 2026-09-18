/**
 * Analytics tables/charts and factual review bullets.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { ProductivityAnalyticsResponse } from '@vitae/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestAuth, renderWithApp } from '../../test/render.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { AnalyticsScreen } from './AnalyticsScreen.js';
import { ReviewScreen } from './ReviewScreen.js';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../lib/productivity-flag.js', () => ({
  isProductivityEnabled: () => flag.enabled,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

vi.mock('../../lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => createTestAuth(),
  hasSessionHint: () => false,
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace: saving is paused.',
}));

function figures(
  over: Partial<ProductivityAnalyticsResponse['figures']> = {},
): ProductivityAnalyticsResponse['figures'] {
  const emptyFigure = {
    history_completeness: 'complete' as const,
    window_start: '2026-08-13',
    window_end: '2026-09-11',
    time_zone: 'UTC',
  };
  return {
    quadrant_balance: { ...emptyFigure, do: 1, schedule: 0, delegate: 0, eliminate: 0 },
    urgency_creep: { ...emptyFigure, count: 0 },
    throughput: { ...emptyFigure, total: 2, by_day: [{ period: '2026-09-10', count: 2 }] },
    estimates_vs_actuals: { ...emptyFigure, rows: [] },
    time_spent: { ...emptyFigure, total_seconds: 0, by_task: [] },
    waiting: { ...emptyFigure, waiting: 0, overdue_follow_up: 0 },
    habits: { ...emptyFigure, total_checks: 0, by_habit: [] },
    goals: { ...emptyFigure, rows: [] },
    by_entity: { ...emptyFigure, rows: [] },
    application_funnel: {
      ...emptyFigure,
      rows: [
        { stage: 'draft', count: 0 },
        { stage: 'applied', count: 0 },
        { stage: 'screening', count: 0 },
        { stage: 'interview', count: 0 },
        { stage: 'offer', count: 0 },
        { stage: 'rejected', count: 0 },
        { stage: 'withdrawn', count: 0 },
        { stage: 'accepted', count: 0 },
      ],
    },
    ...over,
  };
}

function payload(over: Partial<ProductivityAnalyticsResponse> = {}): ProductivityAnalyticsResponse {
  return {
    window: { days: 30, start: '2026-08-13', end: '2026-09-11' },
    time_zone: 'UTC',
    completeness: 'complete',
    figures: figures(),
    ...over,
  };
}

beforeEach(() => {
  flag.enabled = true;
  resetMockApi();
});

describe('analytics page', () => {
  it('keeps loading, failed first load and empty figures distinct', async () => {
    let reject!: (error: Error) => void;
    mockApi.get.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    renderWithApp(<AnalyticsScreen />);
    expect(screen.getByLabelText('Loading analytics')).toBeInTheDocument();
    reject(new Error('Initial figures offline'));
    expect(await screen.findByText("Couldn't load analytics")).toBeInTheDocument();
    expect(
      screen.queryByText('No focus time has been recorded in this window.'),
    ).not.toBeInTheDocument();
    mockApi.get.mockResolvedValue(payload());
    await userEvent.click(screen.getByRole('button', { name: 'Refresh figures' }));
    expect(
      await screen.findByText('No focus time has been recorded in this window.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Initial figures offline')).not.toBeInTheDocument();
  });

  it('shows a throughput table and a numeric chart from the same counts', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/analytics')) return payload();
      return {};
    });
    renderWithApp(<AnalyticsScreen />, { route: '/today/analytics' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Throughput' });
    expect(table).toHaveTextContent('2026-09-10');
    expect(table).toHaveTextContent('2');
    await userEvent.click(screen.getByText('Compare throughput'));
    const chart = screen.getByRole('list', { name: 'Throughput chart' });
    expect(chart).toHaveTextContent('2026-09-10');
    expect(chart).toHaveTextContent('2');
    expect(screen.queryByText(/score|shame|slipped/i)).not.toBeInTheDocument();
  });

  it('does not fetch when the flag is off', () => {
    flag.enabled = false;
    renderWithApp(<AnalyticsScreen />, { route: '/today/analytics' });
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('does not draw a Total 0 throughput row when history is unmeasured', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/analytics')) {
        return payload({
          completeness: 'unknown',
          figures: figures({
            throughput: {
              history_completeness: 'unknown',
              window_start: '2026-08-13',
              window_end: '2026-09-11',
              time_zone: 'UTC',
              total: 0,
              by_day: [],
            },
          }),
        });
      }
      return {};
    });
    renderWithApp(<AnalyticsScreen />, { route: '/today/analytics' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Throughput' })).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('does not present unmeasured urgency as zero', async () => {
    const data = figures();
    mockApi.get.mockResolvedValue(
      payload({
        completeness: 'unknown',
        figures: {
          ...data,
          urgency_creep: { ...data.urgency_creep, history_completeness: 'unknown', count: 0 },
        },
      }),
    );
    renderWithApp(<AnalyticsScreen />);
    expect(
      await screen.findByText('Not measured: revision history is incomplete.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Urgency after create' })).not.toBeInTheDocument();
  });

  it('uses the URL window and group and keeps snapshot scope explicit', async () => {
    mockApi.get.mockResolvedValue(payload());
    renderWithApp(<AnalyticsScreen />, { route: '/today/analytics?window=90&view=current' });
    expect(await screen.findByRole('table', { name: 'Quadrant balance' })).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/productivity/analytics?window=90');
    expect(screen.getByText(/not historical changes/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Throughput' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connections' }));
    expect(
      await screen.findByText('No goal records are available for this figure.'),
    ).toBeInTheDocument();
  });

  it('loads task names separately and keeps figures usable when names fail', async () => {
    const data = figures();
    let failed = true;
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/productivity/tasks') {
        if (failed) throw new Error('Names offline');
        return { tasks: [{ id: 'task-time', title: 'Prepare the research plan' }] };
      }
      return payload({
        figures: {
          ...data,
          time_spent: {
            ...data.time_spent,
            total_seconds: 3661,
            by_task: [{ task_id: 'task-time', seconds: 3661 }],
          },
        },
      });
    });
    renderWithApp(<AnalyticsScreen />);
    expect(await screen.findByText('Task names unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Task task-time' })).toHaveAttribute(
      'href',
      '/n/task-time',
    );
    expect(screen.getAllByText('1h 1m 1s').length).toBeGreaterThan(0);
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry task names' }));
    expect(
      await screen.findByRole('link', { name: 'Prepare the research plan' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Task names unavailable')).not.toBeInTheDocument();
  });
});

describe('review page', () => {
  it('loads the URL period, preserves context and formats exact focus duration', async () => {
    mockApi.get.mockImplementation(async () =>
      payload({ review: { bullets: ['3661 seconds recorded'] } }),
    );
    function Location() {
      return <output aria-label="Location">{useLocation().search}</output>;
    }
    renderWithApp(
      <>
        <ReviewScreen />
        <Location />
      </>,
      { route: '/today/review?period=weekly&source=today' },
    );
    expect(await screen.findByText('1h 1m 1s of focus time recorded')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/productivity/review?period=weekly');
    expect(screen.getByText(/not a calendar week/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-13')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Daily' }));
    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith('/productivity/review?period=daily'),
    );
    expect(screen.getByLabelText('Location')).toHaveTextContent('source=today');
    expect(screen.getByLabelText('Location')).toHaveTextContent('period=daily');
  });

  it('keeps incomplete-history warnings when no facts can be measured', async () => {
    mockApi.get.mockResolvedValue(payload({ completeness: 'unknown', review: { bullets: [] } }));
    renderWithApp(<ReviewScreen />);
    expect(await screen.findByText('History is incomplete')).toBeInTheDocument();
    expect(screen.getByText('No measured facts available')).toBeInTheDocument();
    expect(screen.getByText(/Missing history does not mean/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing recorded for this period')).not.toBeInTheDocument();
  });

  it('distinguishes an absent summary from a complete empty review', async () => {
    mockApi.get.mockResolvedValue(payload());
    renderWithApp(<ReviewScreen />);
    expect(await screen.findByText('Summary unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Nothing recorded for this period')).not.toBeInTheDocument();
    mockApi.get.mockResolvedValue(payload({ review: { bullets: [] } }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
    expect(await screen.findByText('Nothing recorded for this period')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review follow-ups' })).toHaveAttribute(
      'href',
      '/today/waiting?followup=due',
    );
  });

  it('retains loaded facts when a refresh fails, then recovers', async () => {
    mockApi.get.mockResolvedValue(payload({ review: { bullets: ['2 tasks completed'] } }));
    renderWithApp(<ReviewScreen />);
    expect(await screen.findByText('2 tasks completed')).toBeInTheDocument();
    mockApi.get.mockRejectedValue(new Error('Review offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
    expect(await screen.findByText("Couldn't load the review")).toBeInTheDocument();
    expect(screen.getByText('2 tasks completed')).toBeInTheDocument();
    mockApi.get.mockResolvedValue(payload({ review: { bullets: ['3 tasks completed'] } }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
    expect(await screen.findByText('3 tasks completed')).toBeInTheDocument();
    expect(screen.queryByText('Review offline')).not.toBeInTheDocument();
  });

  it('lists factual bullets and no score or shame language', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/productivity/review')) {
        return payload({
          review: { bullets: ['2 tasks completed', '1 follow-up date is past'] },
        });
      }
      return {};
    });
    renderWithApp(<ReviewScreen />, { route: '/today/review' });
    expect(await screen.findByText('2 tasks completed')).toBeInTheDocument();
    expect(screen.getByText('1 follow-up date is past')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/score|shame|slipped/i);
  });
});
