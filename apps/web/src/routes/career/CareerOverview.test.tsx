import '../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApplicationListResponse, ApplicationSummary } from '@vitae/core';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { CareerOverview } from './CareerOverview.js';

const baseApplication: ApplicationSummary = {
  id: 'application-1',
  title: 'Staff Engineer @ Northstar',
  role_title: 'Staff Engineer',
  status: 'interview',
  organization: { id: 'org-1', type: 'organization', title: 'Northstar' },
  referred_by: { id: 'person-1', type: 'person', title: 'Amina Khalil' },
  applied_on: '2026-08-01',
  deadline: null,
  next_step: 'Architecture interview',
  next_step_date: '2026-08-25',
  channel: 'referral',
  location_mode: 'hybrid',
  salary_range: null,
  job_url: null,
  target_id: null,
  resume_id: null,
  interview_count: 1,
  next_interview: null,
  attention: { kind: 'upcoming', date: '2026-08-25', source: 'next_step' },
  notes_md: '',
  source: 'manual',
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-20T12:00:00.000Z',
};

const response: ApplicationListResponse = {
  applications: [
    baseApplication,
    {
      ...baseApplication,
      id: 'application-2',
      title: 'Platform Lead @ Meridian',
      role_title: 'Platform Lead',
      status: 'accepted',
      organization: { id: 'org-2', type: 'organization', title: 'Meridian' },
      referred_by: null,
      next_step: null,
      next_step_date: null,
      interview_count: 3,
      attention: null,
    },
  ],
  counts: {
    draft: 0,
    applied: 0,
    screening: 0,
    interview: 1,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
    accepted: 1,
  },
  total: 2,
  active: 1,
  needs_attention: 0,
};

beforeEach(() => {
  resetMockApi();
});

describe('Career application overview', () => {
  it('renders the next-move register, stage runway, and terminal outcomes', async () => {
    mockApi.get.mockResolvedValue(response);
    renderWithApp(<CareerOverview />, { route: '/career' });

    expect(await screen.findByRole('heading', { name: 'Career' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Next moves/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Application runway/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Outcomes/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Staff Engineer, Northstar' })).toHaveAttribute(
      'href',
      '/career/applications/application-1',
    );
    expect(screen.getByText('Platform Lead')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('gives truthful filtered-empty feedback and restores the runway', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue(response);
    renderWithApp(<CareerOverview />, { route: '/career' });

    const search = await screen.findByRole('textbox', { name: 'Search applications' });
    await user.type(search, 'nonexistent');
    expect(screen.getByText('No applications match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('link', { name: 'Staff Engineer, Northstar' })).toBeInTheDocument();
  });

  it('distinguishes a genuinely empty career workspace', async () => {
    mockApi.get.mockResolvedValue({
      ...response,
      applications: [],
      total: 0,
      active: 0,
      counts: Object.fromEntries(Object.keys(response.counts).map((key) => [key, 0])),
    });
    renderWithApp(<CareerOverview />, { route: '/career' });
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first application' })).toBeInTheDocument();
  });

  it('keeps an undated next step visible instead of dropping it from the register', async () => {
    mockApi.get.mockResolvedValue({
      ...response,
      applications: [
        {
          ...baseApplication,
          next_step: 'Send writing sample',
          next_step_date: null,
          attention: null,
        },
      ],
      total: 1,
      active: 1,
    });
    renderWithApp(<CareerOverview />, { route: '/career' });

    expect((await screen.findAllByText('Send writing sample')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Date not set')).toBeInTheDocument();
  });

  it('calls out an active application with no actionable next move', async () => {
    mockApi.get.mockResolvedValue({
      ...response,
      applications: [
        {
          ...baseApplication,
          status: 'applied',
          next_step: null,
          next_step_date: null,
          next_interview: null,
          deadline: null,
          attention: null,
        },
      ],
      total: 1,
      active: 1,
    });
    renderWithApp(<CareerOverview />, { route: '/career' });

    expect(await screen.findByText('1 active application needs a next move')).toBeInTheDocument();
    expect(screen.getByText(/Add a next step, deadline, or interview/)).toBeInTheDocument();
  });
});
