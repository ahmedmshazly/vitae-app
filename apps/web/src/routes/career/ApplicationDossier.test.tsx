import '../../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApplicationDetailResponse } from '@vitae/core';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { ApplicationDossier } from './ApplicationDossier.js';

const response: ApplicationDetailResponse = {
  application: {
    id: 'application-1',
    title: 'Staff Engineer @ Northstar',
    role_title: 'Staff Engineer',
    status: 'interview',
    organization: { id: 'org-1', type: 'organization', title: 'Northstar' },
    referred_by: { id: 'person-1', type: 'person', title: 'Amina Khalil' },
    applied_on: '2026-08-01',
    deadline: '2026-09-01',
    next_step: 'Architecture interview',
    next_step_date: '2026-08-25',
    channel: 'referral',
    location_mode: 'hybrid',
    salary_range: '$180k–210k',
    job_url: 'https://northstar.example/jobs/staff',
    target_id: 'target-1',
    resume_id: 'resume-1',
    interview_count: 1,
    next_interview: null,
    attention: { kind: 'upcoming', date: '2026-08-25', source: 'next_step' },
    notes_md: 'Review distributed-systems trade-offs.',
    source: 'manual',
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-20T12:00:00.000Z',
    posting: {
      id: 'posting-1',
      title: 'Staff Engineer posting',
      company: 'Northstar',
      location: 'Cairo',
      location_mode: 'hybrid',
      employment_type: 'full_time',
      deadline: '2026-09-01',
      url: 'https://northstar.example/jobs/staff',
      source: 'referral',
    },
    interviews: [
      {
        id: 'interview-1',
        title: 'Architecture interview',
        round: 'Architecture',
        stage_no: 2,
        format: 'video',
        scheduled_at: '2026-08-25T10:00:00.000Z',
        outcome: 'scheduled',
        prep_notes: 'Revisit queue semantics.',
        reflection: null,
        interviewers: [{ id: 'person-2', type: 'person', title: 'Mona El-Sayed' }],
      },
    ],
    target: {
      id: 'target-1',
      company: 'Northstar',
      company_node: 'org-1',
      role_title: 'Staff Engineer',
      jd_url: null,
      status: 'active',
      updated_at: '2026-08-20T12:00:00.000Z',
    },
    resume: {
      id: 'resume-1',
      name: 'Northstar · Staff Engineer',
      status: 'sent',
      template_key: 'cobalt',
      sent_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    },
  },
};

beforeEach(() => {
  resetMockApi();
});

function renderDossier() {
  return renderWithApp(
    <Routes>
      <Route path="/career/applications/:id" element={<ApplicationDossier />} />
    </Routes>,
    { route: '/career/applications/application-1' },
  );
}

describe('Application dossier', () => {
  it('assembles next move, interview evidence, relationships, and materials', async () => {
    mockApi.get.mockResolvedValue(response);
    renderDossier();

    expect(await screen.findByRole('heading', { name: 'Staff Engineer' })).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/applications/application-1');
    expect(screen.getByText('Architecture interview')).toBeInTheDocument();
    expect(screen.getByText(/Mona El-Sayed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Company Northstar/ })).toHaveAttribute(
      'href',
      '/network/organizations/org-1',
    );
    expect(screen.getByRole('link', { name: /Referred by Amina Khalil/ })).toHaveAttribute(
      'href',
      '/network/people/person-1',
    );
    expect(screen.getByRole('link', { name: /Tailoring target Staff Engineer/ })).toHaveAttribute(
      'href',
      '/career/resume/tailor',
    );
    expect(
      screen.getByRole('link', { name: /Résumé sent Northstar · Staff Engineer/ }),
    ).toHaveAttribute('href', '/career/resume/outputs?focus=resume-1');
    expect(screen.getByText('Review distributed-systems trade-offs.')).toBeInTheDocument();
  });

  it('carries the status control, so a move can be recorded where the record is read', async () => {
    mockApi.get.mockResolvedValue(response);
    renderDossier();

    const group = await screen.findByRole('group', { name: 'Record a status move' });
    expect(within(group).getByRole('button', { name: 'Offer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Correct status' })).toBeInTheDocument();
  });

  it('keeps a failed dossier distinct from a missing application', async () => {
    mockApi.get.mockRejectedValue(new Error('request timed out'));
    renderDossier();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this application');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
