import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ApplicationListResponse, ApplicationStatus, ApplicationSummary } from '@vitae/core';
import {
  Banner,
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
import './career-overview.css';
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
  const hasFilters = Boolean(query || status);
  const initialLoadError = applicationsQuery.isError && !applicationsQuery.data;
  // TanStack keeps a successful query's status at `success` when only its
  // refetch fails. `isRefetchError` is therefore the truthful stale-data
  // branch; using `isError` here would silently hide the recovery notice.
  const backgroundRefreshError =
    applicationsQuery.isRefetchError && Boolean(applicationsQuery.data);

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
    <div className="page page--career-runway">
      <PageHeader
        title="Career"
        subtitle="See the next decision in every application, then use the runway to keep the whole search moving."
        actions={<NewApplicationButton />}
      />
      <RegisterRule />

      {initialLoadError ? (
        <ErrorState
          title="Couldn't load your applications"
          detail={(applicationsQuery.error as Error | null)?.message}
          onRetry={() => void applicationsQuery.refetch()}
          retrying={applicationsQuery.isFetching}
        />
      ) : applicationsQuery.isLoading || !applicationsQuery.data ? (
        <SkeletonRows rows={7} label="Loading applications" />
      ) : applications.length === 0 ? (
        <EmptyState
          glyph="application"
          title="No applications yet"
          hint="Add the role once, then connect its company, referrer, interviews, résumé, and next step as the process unfolds."
          action={<NewApplicationButton label="Add your first application" />}
        />
      ) : (
        <>
          {backgroundRefreshError ? (
            <Banner
              tone="warning"
              title="Couldn't refresh the runway"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={applicationsQuery.isFetching}
                  onClick={() => void applicationsQuery.refetch()}
                >
                  {applicationsQuery.isFetching ? 'Retrying…' : 'Retry'}
                </Button>
              }
            >
              Your loaded applications are still shown.
            </Banner>
          ) : null}

          <dl className="career-runway__summary" aria-label="Application summary">
            <LedgerFigure value={applicationsQuery.data.active} label="active" />
            <LedgerFigure value={applicationsQuery.data.counts.interview} label="in interviews" />
            <LedgerFigure value={applicationsQuery.data.counts.offer} label="offers" />
            <LedgerFigure
              value={applicationsQuery.data.needs_attention}
              label="due now"
              warning={applicationsQuery.data.needs_attention > 0}
            />
          </dl>

          {attention.length > 0 ? (
            <Section
              title="Next moves"
              meta={attention.length}
              actions={<Mono className="career-next-moves__order">Soonest first</Mono>}
            >
              <ol className="career-next-moves">
                {attention.map((application) => {
                  const timing = attentionLabel(application);
                  const urgent =
                    application.attention?.kind === 'overdue' ||
                    application.attention?.kind === 'today';
                  return (
                    <li key={application.id}>
                      <Link
                        to={`/career/applications/${application.id}`}
                        className="career-next-move"
                        aria-label={`Open ${application.role_title} application at ${application.organization?.title ?? application.title}`}
                      >
                        <span className="career-next-move__due">
                          <Mono className={urgent ? 'text-warning' : undefined}>
                            {timing ?? 'Date not set'}
                          </Mono>
                          <span>{urgent ? 'Needs attention' : 'Upcoming move'}</span>
                        </span>
                        <span className="career-next-move__record">
                          <EntityGlyph type="application" size="sm" />
                          <span>
                            <strong>{application.role_title}</strong>
                            <small>{application.organization?.title ?? application.title}</small>
                          </span>
                        </span>
                        <StatusTrace
                          announce={false}
                          className="career-next-move__trace"
                          tone={urgent ? 'warning' : 'live'}
                          label={nextMove(application)}
                          detail={
                            application.next_interview?.scheduled_at?.slice(0, 10) ??
                            (application.next_interview ? 'Interview scheduled' : undefined)
                          }
                        />
                        <span className="career-next-move__stage">
                          <Chip tone={statusTone(application.status)} mono>
                            {STATUS_LABEL[application.status]}
                          </Chip>
                          <Mono>{stageOrdinal(application.status)}</Mono>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </Section>
          ) : (
            <div className="career-next-moves__clear-state">
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

          <Section
            title="Application runway"
            meta={applicationsQuery.data.active}
            actions={
              applicationsQuery.isFetching && !backgroundRefreshError ? (
                <StatusTrace announce={false} tone="live" label="Refreshing" />
              ) : null
            }
          >
            <div className="career-runway__filters" aria-label="Application filters">
              <Input
                aria-label="Search applications"
                placeholder="Search role, company, person, or next step..."
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
              <output className="career-runway__count" aria-live="polite">
                {visible.length === applications.length
                  ? `${applications.length} shown`
                  : `${visible.length} of ${applications.length} shown`}
              </output>
              {hasFilters && visible.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                glyph="filter"
                title="No applications match"
                hint="The application records are still here; the current search or stage filter is hiding them."
                action={<Button onClick={clearFilters}>Clear filters</Button>}
              />
            ) : (
              <div
                className="career-runway__scroll"
                tabIndex={0}
                aria-label="Application pipeline stages. Scroll horizontally to review all five stages."
              >
                <ol className="career-runway__lanes" aria-label="Active application stages">
                  {PIPELINE_STAGES.map((stage) => {
                    const lane = byStatus.get(stage) ?? [];
                    return (
                      <li key={stage} className="career-runway__lane">
                        <div className="career-runway__lane-head">
                          <span>
                            <Mono>{stageOrdinal(stage)}</Mono>
                            <h3>{STATUS_LABEL[stage]}</h3>
                          </span>
                          <Mono className={lane.length ? 'text-ink' : 'text-faint'}>
                            {lane.length}
                          </Mono>
                        </div>
                        {lane.length === 0 ? (
                          <p className="career-runway__empty-lane">No applications in this stage</p>
                        ) : (
                          <ul className="career-runway__cards">
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
                  className="row career-outcome text-ink no-underline hover:no-underline"
                  aria-label={`Open ${application.role_title} application at ${application.organization?.title ?? application.title}`}
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
                  <Mono className="career-outcome__updated">
                    Updated {application.updated_at.slice(0, 10)}
                  </Mono>
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
    <div className="career-runway__figure">
      <dt>{label}</dt>
      <dd>
        <Mono className={warning ? 'text-warning' : 'text-ink-strong'}>{value}</Mono>
      </dd>
    </div>
  );
}

function ApplicationCard({ application }: { application: ApplicationSummary }) {
  const timing = attentionLabel(application);
  return (
    <Link
      to={`/career/applications/${application.id}`}
      className="career-runway-card"
      aria-label={`Open ${application.role_title} application at ${application.organization?.title ?? application.title}`}
    >
      <span className="career-runway-card__head">
        <EntityGlyph type="application" size="sm" />
        <span>
          <strong>{application.role_title}</strong>
          <small>{application.organization?.title ?? application.title}</small>
        </span>
      </span>
      <span className="career-runway-card__move">{nextMove(application)}</span>
      <span
        className={
          application.attention?.kind === 'overdue'
            ? 'career-runway-card__meta career-runway-card__meta--warning'
            : 'career-runway-card__meta'
        }
      >
        {timing ??
          (application.interview_count
            ? `${application.interview_count} interview${application.interview_count === 1 ? '' : 's'}`
            : 'Next step not set')}
      </span>
    </Link>
  );
}
