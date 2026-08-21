import type { ApplicationStatus, ApplicationSummary } from '@vitae/core';

export const PIPELINE_STAGES = ['draft', 'applied', 'screening', 'interview', 'offer'] as const;
export const OUTCOME_STAGES = ['accepted', 'rejected', 'withdrawn'] as const;

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  accepted: 'Accepted',
};

export function stageOrdinal(status: ApplicationStatus): string {
  const index = PIPELINE_STAGES.indexOf(status as (typeof PIPELINE_STAGES)[number]);
  return index < 0 ? '—' : String(index + 1).padStart(2, '0');
}

export function statusTone(
  status: ApplicationStatus,
): 'default' | 'accent' | 'success' | 'warning' | 'danger' {
  if (status === 'accepted') return 'success';
  if (status === 'offer') return 'accent';
  if (status === 'rejected') return 'danger';
  if (status === 'withdrawn') return 'warning';
  return 'default';
}

export function readableDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: parsed.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(parsed);
}

export function attentionLabel(application: ApplicationSummary): string | null {
  const attention = application.attention;
  if (!attention) return null;
  if (attention.kind === 'overdue') return `Overdue · ${readableDate(attention.date)}`;
  if (attention.kind === 'today') return 'Due today';
  return readableDate(attention.date);
}

export function applicationMatches(
  application: ApplicationSummary,
  query: string,
  status: string,
): boolean {
  if (status && application.status !== status) return false;
  if (!query.trim()) return true;
  const haystack = [
    application.title,
    application.role_title,
    application.organization?.title,
    application.referred_by?.title,
    application.next_step,
    application.channel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function nextMove(application: ApplicationSummary): string {
  if (application.next_step) return application.next_step;
  if (application.next_interview) {
    return application.next_interview.round ?? application.next_interview.title;
  }
  if (application.deadline) return 'Application deadline';
  return 'No next step recorded';
}
