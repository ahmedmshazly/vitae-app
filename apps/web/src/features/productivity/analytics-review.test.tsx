/**
 * Analytics tables/charts and factual review bullets.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
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

function figures(over: Partial<ProductivityAnalyticsResponse['figures']> = {}): ProductivityAnalyticsResponse['figures'] {
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
});

describe('review page', () => {
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
