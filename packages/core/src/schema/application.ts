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

/**
 * Every status an application record can hold, in the order the wire and the
 * form select carry them. This list is the only place they are written down:
 * `applicationProps` validates against it, the application form renders it,
 * the OpenAPI document publishes it, and the Career workspace orders by it.
 * It was previously spelled out in five files, which is five chances for a
 * ninth status to reach some surfaces and miss others.
 */
export const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'accepted',
] as const;

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The stages an application is still open in, in the order it walks them. */
export const APPLICATION_PIPELINE = [
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
] as const satisfies readonly ApplicationStatus[];

/** The three ways the record closes. Nothing leaves them. */
export const APPLICATION_OUTCOMES = [
  'accepted',
  'rejected',
  'withdrawn',
] as const satisfies readonly ApplicationStatus[];

/**
 * Where each status can go next.
 *
 * The rule is forward-permissive: from any open stage you may move to any
 * later open stage, or close on any of the three outcomes. Not every role has
 * a recruiter screen, so `applied → interview` has to be recordable — a
 * machine that refused it would be refusing a fact that happened, which is the
 * one thing this product will not do. What it does refuse is the pair of moves
 * that can only be a mistake: walking an application backwards down the
 * pipeline, and reopening a record that already has an outcome.
 *
 * This is the shape of a recorded transition. Correcting a status that was
 * entered wrongly in the first place is a different act, and belongs to
 * whichever writer offers it — the map says what follows what, not what an
 * operator is permitted to fix.
 */
export const APPLICATION_STATUS_FLOW: Readonly<
  Record<ApplicationStatus, readonly ApplicationStatus[]>
> = Object.freeze(
  Object.fromEntries(
    APPLICATION_STATUSES.map((status) => {
      const stage = (APPLICATION_PIPELINE as readonly ApplicationStatus[]).indexOf(status);
      const onward =
        stage < 0 ? [] : [...APPLICATION_PIPELINE.slice(stage + 1), ...APPLICATION_OUTCOMES];
      return [status, Object.freeze(onward)];
    }),
  ) as Record<ApplicationStatus, readonly ApplicationStatus[]>,
);

/**
 * Whether `to` is a move `from` can record. Staying put is always allowed:
 * editing an application's deadline resubmits the whole record, status
 * included, and that is not a transition.
 */
export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return from === to || APPLICATION_STATUS_FLOW[from].includes(to);
}

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses the generic edit form may offer: the current value (re-saving other
 * fields is not a transition) plus every legal onward move. Correction is a
 * different claim and belongs to the dedicated control — a generic PATCH
 * cannot send `correction: true`.
 */
export function applicationStatusOptionsFor(current: ApplicationStatus): readonly ApplicationStatus[] {
  return [current, ...APPLICATION_STATUS_FLOW[current]];
}

/**
 * What a writer says when it refuses a move.
 *
 * The sentence names the move, because an operator who hits a guard has to be
 * able to tell which rule they hit without reading the source; "invalid status"
 * would send them looking for a typo in a value that was spelled correctly.
 * The second half names the door out. A status entered wrongly is corrected,
 * not walked back, and a guard whose error does not mention that leaves the
 * operator holding a record they can no longer fix.
 *
 * Only two kinds of move ever reach here, which is why two sentences cover it:
 * from a closed record (nothing leaves an outcome) and backwards down the
 * pipeline (every forward stage and every outcome is already permitted).
 */
export function illegalTransitionMessage(from: ApplicationStatus, to: ApplicationStatus): string {
  const closed = (APPLICATION_OUTCOMES as readonly ApplicationStatus[]).includes(from);
  const remedy = `If ${from} was recorded by mistake, correct the status instead of moving it.`;
  return closed
    ? `An application that was ${from} cannot move to ${to}. An outcome closes the record. ${remedy}`
    : `An application at ${from} cannot move back to ${to}. The pipeline only runs forwards. ${remedy}`;
}

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
