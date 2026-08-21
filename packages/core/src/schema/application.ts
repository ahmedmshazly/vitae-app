/**
 * Read models for the Career workspace.
 *
 * Applications remain ordinary graph nodes. These schemas describe the
 * denormalized, read-only projection returned by GET /applications so the API
 * and web agree on one stable contract without introducing another persisted
 * model.
 */
import { z } from 'zod';
import { isoDate, isoDateTime, sourceSchema } from './envelope.js';

export const applicationStatusSchema = z.enum([
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'accepted',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const applicationEntityRefSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
});
export type ApplicationEntityRef = z.infer<typeof applicationEntityRefSchema>;

export const applicationAttentionSchema = z.object({
  kind: z.enum(['overdue', 'today', 'upcoming']),
  date: isoDate,
  source: z.enum(['next_step', 'deadline']),
});
export type ApplicationAttention = z.infer<typeof applicationAttentionSchema>;

export const applicationInterviewSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  round: z.string().nullable(),
  stage_no: z.number().int().positive().nullable(),
  format: z.string().nullable(),
  scheduled_at: isoDateTime.nullable(),
  outcome: z.string().nullable(),
  prep_notes: z.string().nullable(),
  reflection: z.string().nullable(),
  interviewers: z.array(applicationEntityRefSchema),
});
export type ApplicationInterviewSummary = z.infer<typeof applicationInterviewSummarySchema>;

export const applicationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  role_title: z.string(),
  status: applicationStatusSchema,
  organization: applicationEntityRefSchema.nullable(),
  referred_by: applicationEntityRefSchema.nullable(),
  applied_on: isoDate.nullable(),
  deadline: isoDate.nullable(),
  next_step: z.string().nullable(),
  next_step_date: isoDate.nullable(),
  channel: z.string().nullable(),
  location_mode: z.string().nullable(),
  salary_range: z.string().nullable(),
  job_url: z.string().nullable(),
  target_id: z.string().nullable(),
  resume_id: z.string().nullable(),
  interview_count: z.number().int().nonnegative(),
  next_interview: applicationInterviewSummarySchema.nullable(),
  attention: applicationAttentionSchema.nullable(),
  notes_md: z.string(),
  source: sourceSchema,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type ApplicationSummary = z.infer<typeof applicationSummarySchema>;

export const applicationStageCountsSchema = z.object({
  draft: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  screening: z.number().int().nonnegative(),
  interview: z.number().int().nonnegative(),
  offer: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  withdrawn: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
});
export type ApplicationStageCounts = z.infer<typeof applicationStageCountsSchema>;

export const applicationListResponseSchema = z.object({
  applications: z.array(applicationSummarySchema),
  counts: applicationStageCountsSchema,
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  needs_attention: z.number().int().nonnegative(),
});
export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;

export const applicationPostingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  location_mode: z.string().nullable(),
  employment_type: z.string().nullable(),
  deadline: isoDate.nullable(),
  url: z.string().nullable(),
  source: z.string().nullable(),
});
export type ApplicationPostingSummary = z.infer<typeof applicationPostingSummarySchema>;

export const applicationTargetSummarySchema = z.object({
  id: z.string(),
  company: z.string().nullable(),
  company_node: z.string().nullable(),
  role_title: z.string(),
  jd_url: z.string().nullable(),
  status: z.string().nullable(),
  updated_at: isoDateTime.nullable(),
});
export type ApplicationTargetSummary = z.infer<typeof applicationTargetSummarySchema>;

export const applicationResumeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  template_key: z.string().nullable(),
  sent_at: isoDateTime.nullable(),
  updated_at: isoDateTime.nullable(),
});
export type ApplicationResumeSummary = z.infer<typeof applicationResumeSummarySchema>;

export const applicationDossierSchema = applicationSummarySchema.extend({
  posting: applicationPostingSummarySchema.nullable(),
  interviews: z.array(applicationInterviewSummarySchema),
  target: applicationTargetSummarySchema.nullable(),
  resume: applicationResumeSummarySchema.nullable(),
});
export type ApplicationDossier = z.infer<typeof applicationDossierSchema>;

export const applicationDetailResponseSchema = z.object({
  application: applicationDossierSchema,
});
export type ApplicationDetailResponse = z.infer<typeof applicationDetailResponseSchema>;
