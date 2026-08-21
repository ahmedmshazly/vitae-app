import { describe, expect, it } from 'vitest';
import {
  applicationDetailResponseSchema,
  applicationListResponseSchema,
  applicationStatusSchema,
} from './application.js';

const application = {
  id: 'application-1',
  title: 'Staff Engineer @ Northstar',
  role_title: 'Staff Engineer',
  status: 'interview' as const,
  organization: { id: 'org-1', type: 'organization', title: 'Northstar' },
  referred_by: null,
  applied_on: '2026-08-01',
  deadline: null,
  next_step: 'Architecture interview',
  next_step_date: '2026-08-25',
  channel: 'referral',
  location_mode: 'hybrid',
  salary_range: null,
  job_url: null,
  target_id: 'target-1',
  resume_id: 'resume-1',
  interview_count: 1,
  next_interview: null,
  attention: { kind: 'upcoming' as const, date: '2026-08-25', source: 'next_step' as const },
  notes_md: '',
  source: 'manual' as const,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-20T12:00:00.000Z',
};

describe('Career application read models', () => {
  it('keeps every persisted application status representable', () => {
    expect(applicationStatusSchema.options).toEqual([
      'draft',
      'applied',
      'screening',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
      'accepted',
    ]);
  });

  it('validates the pipeline aggregate', () => {
    expect(
      applicationListResponseSchema.parse({
        applications: [application],
        counts: {
          draft: 0,
          applied: 0,
          screening: 0,
          interview: 1,
          offer: 0,
          rejected: 0,
          withdrawn: 0,
          accepted: 0,
        },
        total: 1,
        active: 1,
        needs_attention: 1,
      }).applications[0]?.organization?.title,
    ).toBe('Northstar');
  });

  it('validates a dossier assembled from graph and résumé records', () => {
    const result = applicationDetailResponseSchema.parse({
      application: {
        ...application,
        posting: null,
        interviews: [],
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
    });

    expect(result.application.resume?.status).toBe('sent');
  });
});
