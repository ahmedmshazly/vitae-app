import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import type { ApplicationDetailResponse, ApplicationInterviewSummary } from '@vitae/core';
import {
  Button,
  Banner,
  Chip,
  EmptyState,
  ErrorState,
  Glyph,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api, ApiError } from '../../lib/api.js';
import { useCanWrite } from '../../lib/auth.js';
import { NodeFormDialog } from '../../features/forms/NodeFormDialog.js';
import { EditApplicationButton } from './ApplicationActions.js';
import { ApplicationStatusControl } from './ApplicationStatusControl.js';
import {
  attentionLabel,
  nextMove,
  readableDate,
  STATUS_LABEL,
  statusTone,
} from './application-view.js';
import './application-dossier.css';

export function ApplicationDossier() {
  const { id = '' } = useParams();
  const statusPending = useIsMutating({ mutationKey: ['application-status', id] }) > 0;
  const dossierQuery = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<ApplicationDetailResponse>(`/applications/${id}`),
    enabled: Boolean(id),
  });
  const application = dossierQuery.data?.application;

  const unavailable =
    dossierQuery.error instanceof ApiError && [403, 404].includes(dossierQuery.error.status);
  if (dossierQuery.isError && (!application || unavailable)) {
    return (
      <div className="page">
        <BackToCareer />
        <PageHeader title="Application" />
        <RegisterRule />
        <ErrorState
          title={
            dossierQuery.error instanceof ApiError && dossierQuery.error.status === 404
              ? 'Application not found'
              : "Couldn't load this application"
          }
          detail={(dossierQuery.error as Error | null)?.message}
          onRetry={() => void dossierQuery.refetch()}
        />
      </div>
    );
  }

  if (dossierQuery.isLoading || !application) {
    return (
      <div className="page">
        <BackToCareer />
        <PageHeader title="Application" subtitle="Loading the dossier..." />
        <RegisterRule />
        <SkeletonRows rows={7} />
      </div>
    );
  }

  const timing = attentionLabel(application);
  const urgent =
    application.attention?.kind === 'overdue' || application.attention?.kind === 'today';
  return (
    <div className="page application-dossier">
      <BackToCareer />
      <PageHeader
        title={application.role_title}
        subtitle={application.organization?.title ?? application.title}
        actions={
          <>
            <Link className="application-record-link" to={`/n/${application.id}`}>
              Open full record
            </Link>
            <EditApplicationButton
              id={application.id}
              disabled={statusPending || dossierQuery.isError}
            />
          </>
        }
      />
      <RegisterRule />

      {dossierQuery.isError ? (
        <Banner
          tone="warning"
          title="Application refresh failed"
          action={
            <Button disabled={dossierQuery.isFetching} onClick={() => void dossierQuery.refetch()}>
              {dossierQuery.isFetching ? 'Refreshing…' : 'Retry refresh'}
            </Button>
          }
          className="application-refresh"
        >
          The last loaded dossier is still here. Refresh it before making changes.
        </Banner>
      ) : dossierQuery.isFetching ? (
        <p role="status" className="text-sm text-muted">
          Refreshing application…
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip tone={statusTone(application.status)} mono>
          {STATUS_LABEL[application.status]}
        </Chip>
        {application.channel ? <Chip glyph="merge">{application.channel}</Chip> : null}
        {application.location_mode ? <Chip glyph="map">{application.location_mode}</Chip> : null}
        <ProvenanceChip source={application.source} />
      </div>

      <div className="application-dossier-layout">
        <div className="min-w-0">
          <section aria-labelledby="next-move-title" className="application-next-move">
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <h2 id="next-move-title" className="text-sm font-medium text-muted">
                Next move
              </h2>
              {timing ? (
                <Mono className={urgent ? 'text-sm text-warning' : 'text-sm text-muted'}>
                  {timing}
                </Mono>
              ) : null}
            </div>
            <StatusTrace
              tone={
                urgent
                  ? 'warning'
                  : application.next_step || application.next_interview
                    ? 'live'
                    : 'neutral'
              }
              label={nextMove(application)}
              detail={
                application.next_step
                  ? undefined
                  : application.attention?.source === 'deadline'
                    ? 'Application deadline'
                    : application.next_interview
                      ? 'Interview loop'
                      : undefined
              }
            />
          </section>

          <ApplicationStatusControl
            key={application.id}
            id={application.id}
            status={application.status}
            disabled={dossierQuery.isError}
          />

          <Section title="Interview loop" meta={application.interviews.length}>
            {application.interviews.length === 0 ? (
              <EmptyState
                glyph="timeline"
                title="No interviews linked"
                hint="When a screen or interview is scheduled, connect its record to this application and the loop will appear here."
                action={
                  <EditApplicationButton
                    id={application.id}
                    label="Link an interview"
                    disabled={statusPending || dossierQuery.isError}
                  />
                }
              />
            ) : (
              <ol className="m-0 list-none p-0">
                {application.interviews.map((interview, index) => (
                  <InterviewRow
                    key={interview.id}
                    interview={interview}
                    index={index}
                    disabled={statusPending || dossierQuery.isError}
                  />
                ))}
              </ol>
            )}
          </Section>

          <Section title="Working notes">
            <p className="application-working-notes text-sm leading-relaxed text-ink-soft">
              {application.notes_md ||
                'No working notes yet. Use Edit application to record preparation, questions, or follow-up details.'}
            </p>
          </Section>
        </div>

        <aside className="application-context" aria-label="Application context">
          <Section title="Application register">
            <dl className="m-0">
              <Fact label="Applied" value={readableDate(application.applied_on)} />
              <Fact label="Deadline" value={readableDate(application.deadline)} />
              <Fact label="Salary" value={application.salary_range ?? 'Not recorded'} />
              <Fact label="Updated" value={readableDate(application.updated_at)} />
            </dl>
            {application.job_url ? (
              <a
                className="mt-4 inline-flex items-center gap-2 text-sm"
                href={application.job_url}
                target="_blank"
                rel="noreferrer"
              >
                Open job page <Glyph name="export" size={13} />
              </a>
            ) : null}
          </Section>

          <Section title="People and company">
            <div className="flex flex-col">
              {application.organization ? (
                <ContextLink
                  to={`/network/organizations/${application.organization.id}`}
                  glyph="org"
                  label="Company"
                  value={application.organization.title}
                />
              ) : (
                <MissingContext label="Company not linked" />
              )}
              {application.referred_by ? (
                <ContextLink
                  to={`/network/people/${application.referred_by.id}`}
                  glyph="person"
                  label="Referred by"
                  value={application.referred_by.title}
                />
              ) : (
                <MissingContext label="No referrer linked" />
              )}
            </div>
          </Section>

          <Section title="Materials">
            <div className="flex flex-col">
              {application.posting ? (
                <ContextLink
                  to={`/n/${application.posting.id}`}
                  glyph="document"
                  label="Job posting"
                  value={application.posting.title}
                />
              ) : null}
              {application.target ? (
                <ContextLink
                  to="/career/resume/tailor"
                  glyph="resume"
                  label="Tailoring target"
                  value={application.target.role_title}
                />
              ) : null}
              {application.resume ? (
                <ContextLink
                  to={`/career/resume/outputs?focus=${application.resume.id}`}
                  glyph="export"
                  label="Résumé sent"
                  value={application.resume.name}
                />
              ) : null}
              {!application.posting && !application.target && !application.resume ? (
                <MissingContext label="No posting, target, or résumé linked" />
              ) : null}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function BackToCareer() {
  return (
    <Link
      to="/career"
      className="mb-4 inline-flex items-center gap-2 text-sm text-muted no-underline hover:text-ink hover:no-underline"
    >
      Back to Career
    </Link>
  );
}

function InterviewRow({
  interview,
  index,
  disabled,
}: {
  interview: ApplicationInterviewSummary;
  index: number;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const canWrite = useCanWrite();
  const outcomeTone =
    interview.outcome === 'passed'
      ? 'success'
      : interview.outcome === 'failed'
        ? 'danger'
        : 'default';
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-hairline py-4 last:border-b-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-raised">
        <Mono className="text-xs text-muted">{interview.stage_no ?? index + 1}</Mono>
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            to={`/n/${interview.id}`}
            className="font-medium text-ink no-underline hover:underline"
          >
            {interview.round ?? interview.title}
          </Link>
          <div className="application-interview-actions">
            {interview.outcome ? (
              <Chip tone={outcomeTone} mono>
                {interview.outcome}
              </Chip>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              glyph="edit"
              disabled={disabled || !canWrite}
              onClick={() => setEditing(true)}
              aria-label={`Edit interview: ${interview.round ?? interview.title}`}
            >
              Edit
            </Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          {[
            interview.scheduled_at
              ? interviewSchedule(interview.scheduled_at)
              : 'Schedule not recorded',
            interview.format,
            interview.interviewers.map((person) => person.title).join(', '),
          ]
            .filter((part) => part && part !== 'Not set')
            .join(' · ') || 'Schedule not recorded'}
        </p>
        {interview.prep_notes ? (
          <p className="mt-2 text-sm text-ink-soft">Prepare: {interview.prep_notes}</p>
        ) : null}
        {interview.reflection ? (
          <p className="mt-2 text-sm text-ink-soft">Reflection: {interview.reflection}</p>
        ) : null}
      </div>
      {editing && (
        <NodeFormDialog open type="interview" nodeId={interview.id} onOpenChange={setEditing} />
      )}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="m-0 text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

function ContextLink({
  to,
  glyph,
  label,
  value,
}: {
  to: string;
  glyph: 'org' | 'person' | 'document' | 'resume' | 'export';
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b border-hairline py-3 text-ink no-underline last:border-b-0 hover:bg-raised hover:no-underline"
    >
      <Glyph name={glyph} size={15} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block text-sm">{value}</span>
      </span>
    </Link>
  );
}

function interviewSchedule(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return (
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date) + ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
  );
}

function MissingContext({ label }: { label: string }) {
  return (
    <p className="border-b border-hairline py-3 text-sm text-faint last:border-b-0">{label}</p>
  );
}
