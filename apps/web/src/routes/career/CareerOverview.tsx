import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ApplicationListResponse, ApplicationStatus, ApplicationSummary } from '@vitae/core';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../../lib/api.js';
import { NewApplicationButton } from './ApplicationActions.js';
import {
  applicationMatches,
  attentionLabel,
  nextMove,
  OUTCOME_STAGES,
  PIPELINE_STAGES,
  stageOrdinal,
  STATUS_LABEL,
  statusTone,
} from './application-view.js';

const STATUS_OPTIONS = [
  ...PIPELINE_STAGES.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
  ...OUTCOME_STAGES.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
];
const TERMINAL_STAGES = new Set<ApplicationStatus>(OUTCOME_STAGES);

export function CareerOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.get<ApplicationListResponse>('/applications'),
  });
  const applications = useMemo(
    () => applicationsQuery.data?.applications ?? [],
    [applicationsQuery.data?.applications],
  );
  const visible = useMemo(
    () => applications.filter((application) => applicationMatches(application, query, status)),
    [applications, query, status],
  );
  const byStatus = useMemo(() => {
    const grouped = new Map<ApplicationStatus, ApplicationSummary[]>();
    for (const application of visible) {
      grouped.set(application.status, [...(grouped.get(application.status) ?? []), application]);
    }
    return grouped;
  }, [visible]);
  const attention = useMemo(
    () =>
      applications
        .filter(
          (application) =>
            !TERMINAL_STAGES.has(application.status) &&
            (application.attention || application.next_interview || application.next_step),
        )
        .sort((a, b) =>
          (a.attention?.date ?? a.next_interview?.scheduled_at ?? '9999').localeCompare(
            b.attention?.date ?? b.next_interview?.scheduled_at ?? '9999',
          ),
        )
        .slice(0, 4),
    [applications],
  );
  const missingNextMove = useMemo(
    () =>
      applications.filter(
        (application) =>
          !TERMINAL_STAGES.has(application.status) &&
          !application.next_step &&
          !application.next_interview &&
          !application.deadline,
      ).length,
    [applications],
  );
  function setFilter(key: 'q' | 'status', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Career"
        subtitle="Keep every opportunity, conversation, interview, and next move on one evidence-backed runway."
        actions={<NewApplicationButton />}
      />
      <RegisterRule />

      {applicationsQuery.isError ? (
        <ErrorState
          title="Couldn’t load your applications"
          detail={(applicationsQuery.error as Error | null)?.message}
          onRetry={() => void applicationsQuery.refetch()}
        />
      ) : applicationsQuery.isLoading || !applicationsQuery.data ? (
        <SkeletonRows rows={7} />
      ) : applications.length === 0 ? (
        <EmptyState
          glyph="application"
          title="No applications yet"
          hint="Add the role once, then connect its company, referrer, interviews, résumé, and next step as the process unfolds."
          action={<NewApplicationButton label="Add your first application" />}
        />
      ) : (
        <>
          <div
            className="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-hairline py-3"
            aria-label="Application summary"
          >
            <LedgerFigure value={applicationsQuery.data.active} label="active" />
            <LedgerFigure value={applicationsQuery.data.counts.interview} label="in interviews" />
            <LedgerFigure value={applicationsQuery.data.counts.offer} label="offers" />
            <LedgerFigure
              value={applicationsQuery.data.needs_attention}
              label="due now"
              warning={applicationsQuery.data.needs_attention > 0}
            />
          </div>

          {attention.length > 0 ? (
            <Section title="Next moves" meta={attention.length}>
              <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
                {attention.map((application) => {
                  const timing = attentionLabel(application);
                  const urgent =
                    application.attention?.kind === 'overdue' ||
                    application.attention?.kind === 'today';
                  return (
                    <li key={application.id}>
                      <Link
                        to={`/career/applications/${application.id}`}
                        className="block rounded-sm border border-hairline p-3 text-ink no-underline transition-colors hover:border-strong hover:bg-raised hover:no-underline"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium">
                            {application.role_title}
                          </span>
                          <Chip tone={statusTone(application.status)} mono>
                            {STATUS_LABEL[application.status]}
                          </Chip>
                        </div>
                        <StatusTrace
                          announce={false}
                          tone={urgent ? 'warning' : 'live'}
                          label={nextMove(application)}
                          detail={
                            timing ??
                            application.next_interview?.scheduled_at?.slice(0, 10) ??
                            'Date not set'
                          }
                        />
                        <p className="mt-2 truncate text-xs text-muted">
                          {application.organization?.title ?? application.title}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </Section>
          ) : (
            <div className="mb-6 border-y border-hairline py-3">
              <StatusTrace
                tone={missingNextMove > 0 ? 'warning' : 'success'}
                label={
                  missingNextMove > 0
                    ? `${missingNextMove} active application${missingNextMove === 1 ? '' : 's'} ${missingNextMove === 1 ? 'needs' : 'need'} a next move`
                    : 'No next moves need attention'
                }
                detail={
                  missingNextMove > 0
                    ? 'Add a next step, deadline, or interview to keep the runway actionable.'
                    : 'No current deadlines or interviews are waiting.'
                }
              />
            </div>
          )}

          <Section title="Application runway" meta={applicationsQuery.data.active}>
            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <Input
                aria-label="Search applications"
                placeholder="Search role, company, person, or next step…"
                value={query}
                onChange={(event) => setFilter('q', event.target.value)}
              />
              <Select
                label="Filter by stage"
                placeholder="All stages"
                value={status || undefined}
                options={STATUS_OPTIONS}
                onChange={(value) => setFilter('status', value ?? '')}
              />
              <Mono className="self-center text-sm text-faint">
                {visible.length === applications.length
                  ? `${applications.length}`
                  : `${visible.length} of ${applications.length}`}
              </Mono>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                glyph="filter"
                title="No applications match"
                hint="The application records are still here; the current search or stage filter is hiding them."
                action={<Button onClick={clearFilters}>Clear filters</Button>}
              />
            ) : (
              <div className="overflow-x-auto pb-2">
                <ol
                  className="m-0 grid min-w-[920px] list-none grid-cols-5 border-y border-hairline p-0"
                  aria-label="Active application stages"
                >
                  {PIPELINE_STAGES.map((stage) => {
                    const lane = byStatus.get(stage) ?? [];
                    return (
                      <li
                        key={stage}
                        className="min-w-0 border-l border-hairline px-3 py-4 first:border-l-0"
                      >
                        <div className="mb-4 flex items-baseline justify-between gap-2">
                          <span className="flex items-baseline gap-2">
                            <Mono className="text-xs text-faint">{stageOrdinal(stage)}</Mono>
                            <h3 className="text-sm font-medium text-ink">{STATUS_LABEL[stage]}</h3>
                          </span>
                          <Mono className={lane.length ? 'text-sm text-ink' : 'text-sm text-faint'}>
                            {lane.length}
                          </Mono>
                        </div>
                        {lane.length === 0 ? (
                          <p className="border-t border-dashed border-hairline pt-3 text-xs text-faint">
                            No applications
                          </p>
                        ) : (
                          <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {lane.map((application) => (
                              <li key={application.id}>
                                <ApplicationCard application={application} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </Section>

          {OUTCOME_STAGES.some((stage) => (byStatus.get(stage)?.length ?? 0) > 0) ? (
            <Section
              title="Outcomes"
              meta={OUTCOME_STAGES.reduce(
                (sum, stage) => sum + (byStatus.get(stage)?.length ?? 0),
                0,
              )}
            >
              {OUTCOME_STAGES.flatMap((stage) => byStatus.get(stage) ?? []).map((application) => (
                <Link
                  key={application.id}
                  to={`/career/applications/${application.id}`}
                  className="row text-ink no-underline hover:no-underline"
                >
                  <EntityGlyph type="application" size="sm" />
                  <span className="row__main">
                    <span className="row__title">{application.role_title}</span>
                    <span className="row__sub">
                      {application.organization?.title ?? application.title}
                    </span>
                  </span>
                  <Chip tone={statusTone(application.status)} mono>
                    {STATUS_LABEL[application.status]}
                  </Chip>
                </Link>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Canonical route export for `/career/applications`; `/career` shares it. */
export const Applications = CareerOverview;

function LedgerFigure({
  value,
  label,
  warning = false,
}: {
  value: number;
  label: string;
  warning?: boolean;
}) {
  return (
    <p className="flex items-baseline gap-2">
      <Mono className={warning ? 'text-xl text-warning' : 'text-xl text-ink-strong'}>{value}</Mono>
      <span className="text-xs tracking-[0.06em] text-muted uppercase">{label}</span>
    </p>
  );
}

function ApplicationCard({ application }: { application: ApplicationSummary }) {
  const timing = attentionLabel(application);
  return (
    <Link
      to={`/career/applications/${application.id}`}
      className="block rounded-sm border border-hairline bg-canvas p-3 text-ink no-underline transition-colors hover:border-strong hover:bg-raised hover:no-underline"
      aria-label={`${application.role_title}, ${application.organization?.title ?? application.title}`}
    >
      <span className="mb-2 flex items-start gap-2">
        <EntityGlyph type="application" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug">{application.role_title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {application.organization?.title ?? application.title}
          </span>
        </span>
      </span>
      <span className="block border-t border-hairline pt-2 text-xs text-ink-soft">
        {nextMove(application)}
      </span>
      <span
        className={`mt-1 block text-xs ${application.attention?.kind === 'overdue' ? 'text-warning' : 'text-faint'}`}
      >
        {timing ??
          (application.interview_count
            ? `${application.interview_count} interview${application.interview_count === 1 ? '' : 's'}`
            : 'Next step not set')}
      </span>
    </Link>
  );
}
