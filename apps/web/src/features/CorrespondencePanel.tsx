import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Chip, EmptyState, ErrorState, Mono, SkeletonRows } from '@vitae/ui';
import { api } from '../lib/api.js';
import { entityHref } from '../lib/entity-href.js';

/**
 * The correspondence panel on a person profile (SRS FR-COMM-001): reciprocity,
 * per-direction reply latency, unanswered inbound, and the contact-day rhythm,
 * every figure opening into the interactions that produced it (NFR-PRIV-003).
 *
 * The figures only ever come from stated directions. When part of the history
 * is directionless the panel says so in a coverage line, and when all of it
 * is, the panel explains how direction gets recorded instead of pretending
 * the ratio of an empty set is a fact.
 */

interface ReplySample {
  fromId: string;
  toId: string;
  days: number;
}

export interface CorrespondenceProfileDto {
  coverage: { withDirection: number; total: number };
  reciprocity: {
    outbound: number;
    inbound: number;
    ratio: number | null;
    outboundIds: string[];
    inboundIds: string[];
  };
  replyLatency: {
    mine: { medianDays: number | null; samples: ReplySample[] };
    theirs: { medianDays: number | null; samples: ReplySample[] };
  };
  unansweredInbound: { count: number; eventIds: string[] };
  contactDays: { totalDays: number; months: Array<{ month: string; days: number }> };
}

/** The interaction facts the panel needs to name an id: what and when. */
export interface InteractionRef {
  id: string;
  title: string;
  at: string;
}

/** The introductions this person figures in (FR-COMM-003). */
export interface IntroductionsDto {
  connected: Array<{
    edgeId: string;
    otherId: string;
    otherTitle: string | null;
    viaId: string | null;
    viaLabel: string | null;
    occurredOn: string | null;
    context: string | null;
  }>;
  brokered: Array<{
    edgeId: string;
    srcId: string;
    srcTitle: string | null;
    dstId: string;
    dstTitle: string | null;
    occurredOn: string | null;
    context: string | null;
  }>;
}

function days(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'Not enough data';
  if (value < 1) return '<1 day';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** Each evidence register has its own bounded disclosure and keyboard control. */
function EvidenceDisclosure({
  title,
  metric,
  rows,
  listLabel,
  empty,
}: {
  title: string;
  metric: ReactNode;
  rows: ReactNode[];
  listLabel: string;
  empty: string;
}) {
  const [limit, setLimit] = useState(20);
  return (
    <details className="correspondence-disclosure">
      <summary>
        <strong>{title}</strong>
        <span className="correspondence-disclosure__metric">{metric}</span>
      </summary>
      {rows.length ? (
        <>
          <ul className="correspondence-disclosure__rows" aria-label={listLabel}>
            {rows.slice(0, limit)}
          </ul>
          {rows.length > 20 && (
            <div className="correspondence-disclosure__more">
              <Mono>
                {Math.min(limit, rows.length)} of {rows.length}
              </Mono>
              {limit < rows.length ? (
                <Button size="sm" onClick={() => setLimit((value) => value + 20)}>
                  Show more {title.toLowerCase()}
                </Button>
              ) : (
                <Button size="sm" onClick={() => setLimit(20)}>
                  Show first 20 {title.toLowerCase()}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </details>
  );
}

export function CorrespondencePanel({
  personId,
  interactions = [],
}: {
  personId: string;
  interactions?: InteractionRef[];
}) {
  const query = useQuery({
    queryKey: ['person-correspondence', personId],
    queryFn: () =>
      api.get<{ profile: CorrespondenceProfileDto; introductions?: IntroductionsDto }>(
        `/people/${personId}/correspondence`,
      ),
  });
  if (query.isPending)
    return (
      <div role="status" aria-label="Loading correspondence">
        <SkeletonRows rows={3} />
      </div>
    );
  if (!query.data?.profile?.coverage) {
    return (
      <ErrorState
        title="Correspondence unavailable"
        detail="We couldn’t load the correspondence profile. Your logged interactions are unchanged."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        retryLabel="Retry correspondence"
      />
    );
  }

  const { profile, introductions } = query.data;
  const byId = new Map(interactions.map((interaction) => [interaction.id, interaction]));
  const interactionLink = (id: string) => {
    const hit = byId.get(id);
    return (
      <Link to={entityHref('interaction', id)}>
        {hit
          ? `${hit.at ? hit.at.slice(0, 10) : 'Undated'} · ${hit.title}`
          : `Interaction ${id.slice(0, 8)}`}
      </Link>
    );
  };
  const personLink = (id: string, title: string | null) => (
    <Link to={entityHref('person', id)}>{title || 'Unnamed person'}</Link>
  );
  const introRows = [
    ...(introductions?.connected ?? []).map((intro) => (
      <li key={intro.edgeId}>
        <div>
          Connected to {personLink(intro.otherId, intro.otherTitle)}
          {intro.viaId ? (
            <> via {personLink(intro.viaId, intro.viaLabel)}</>
          ) : intro.viaLabel ? (
            ` via ${intro.viaLabel}`
          ) : (
            ''
          )}
        </div>
        {intro.occurredOn && <div className="text-sm text-muted">{intro.occurredOn}</div>}
        {intro.context && <p>{intro.context}</p>}
      </li>
    )),
    ...(introductions?.brokered ?? []).map((intro) => (
      <li key={intro.edgeId}>
        <div>
          Introduced {personLink(intro.srcId, intro.srcTitle)} to{' '}
          {personLink(intro.dstId, intro.dstTitle)}
        </div>
        {intro.occurredOn && <div className="text-sm text-muted">{intro.occurredOn}</div>}
        {intro.context && <p>{intro.context}</p>}
      </li>
    )),
  ];
  const introBlock =
    introRows.length > 0 ? (
      <EvidenceDisclosure
        title="Introductions"
        metric={<Mono>{introRows.length}</Mono>}
        rows={introRows}
        listLabel="Recorded introductions"
        empty="No introductions recorded."
      />
    ) : null;
  const refreshState = query.isError ? (
    <Banner
      className="network-secondary-state"
      tone="danger"
      title="Correspondence could not be refreshed"
      action={
        <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Retrying…' : 'Retry correspondence'}
        </Button>
      }
    >
      Showing the last loaded figures and evidence.
    </Banner>
  ) : query.isFetching ? (
    <p role="status" className="text-sm text-muted">
      Refreshing correspondence…
    </p>
  ) : null;

  if (profile.coverage.total === 0 || profile.coverage.withDirection === 0) {
    const hasUnmeasuredHistory = profile.coverage.total === 0 && interactions.length > 0;
    return (
      <div className="correspondence-panel">
        {refreshState}
        <EmptyState
          glyph="interaction"
          title={
            hasUnmeasuredHistory
              ? 'No correspondence measurements yet'
              : profile.coverage.total === 0
                ? 'No interactions logged'
                : 'No stated directions yet'
          }
          hint={
            hasUnmeasuredHistory
              ? 'Your logged interactions are still available in the history. None is included in these measurements; missing dates and directions are not guessed.'
              : profile.coverage.total === 0
                ? 'Log an interaction to start a correspondence history.'
                : `None of the ${profile.coverage.total} logged interactions says who reached out. Choose “Who reached out” when logging; older entries remain uncounted rather than guessed.`
          }
        />
        {introBlock}
      </div>
    );
  }

  const reciprocityRows = [
    ...profile.reciprocity.outboundIds.map((id) => (
      <li key={`out-${id}`}>
        <span className="text-sm text-muted">You reached out</span>
        {interactionLink(id)}
      </li>
    )),
    ...profile.reciprocity.inboundIds.map((id) => (
      <li key={`in-${id}`}>
        <span className="text-sm text-muted">They reached out</span>
        {interactionLink(id)}
      </li>
    )),
  ];
  const replyRows = [
    ...profile.replyLatency.mine.samples.map((sample) => (
      <li key={`mine-${sample.fromId}-${sample.toId}`}>
        <span className="text-sm text-muted">Your reply in {days(sample.days)}</span>
        {interactionLink(sample.fromId)}
        <span>to {interactionLink(sample.toId)}</span>
      </li>
    )),
    ...profile.replyLatency.theirs.samples.map((sample) => (
      <li key={`theirs-${sample.fromId}-${sample.toId}`}>
        <span className="text-sm text-muted">Their reply in {days(sample.days)}</span>
        {interactionLink(sample.fromId)}
        <span>to {interactionLink(sample.toId)}</span>
      </li>
    )),
  ];

  return (
    <div className="correspondence-panel">
      {refreshState}
      <p className="text-sm text-muted">Open a measure to review the interactions behind it.</p>
      {profile.coverage.withDirection < profile.coverage.total && (
        <p className="text-sm text-muted">
          {profile.coverage.withDirection} of {profile.coverage.total} interactions state a
          direction; the rest count as contact only.
        </p>
      )}
      <EvidenceDisclosure
        title="Reciprocity"
        listLabel="Reciprocity evidence"
        rows={reciprocityRows}
        empty="No directional evidence available."
        metric={
          <>
            <Mono>
              you {profile.reciprocity.outbound} · them {profile.reciprocity.inbound}
            </Mono>
            {profile.reciprocity.ratio != null && Number.isFinite(profile.reciprocity.ratio) && (
              <Chip mono>{Math.round(profile.reciprocity.ratio * 100)}% yours</Chip>
            )}
          </>
        }
      />
      <EvidenceDisclosure
        title="Reply latency"
        listLabel="Reply pairs"
        rows={replyRows}
        empty="No reply pairs inside the sixty-day window."
        metric={
          <>
            <Mono>you {days(profile.replyLatency.mine.medianDays)}</Mono>
            <Mono>them {days(profile.replyLatency.theirs.medianDays)}</Mono>
          </>
        }
      />
      <EvidenceDisclosure
        title="Unanswered inbound"
        metric={<Mono>{profile.unansweredInbound.count}</Mono>}
        listLabel="Unanswered inbound interactions"
        rows={profile.unansweredInbound.eventIds.map((id) => (
          <li key={id}>{interactionLink(id)}</li>
        ))}
        empty={
          profile.unansweredInbound.count === 0
            ? 'Nothing waiting on a reply from you.'
            : 'The count is available, but its interaction references are missing.'
        }
      />
      <EvidenceDisclosure
        title="Contact days"
        metric={<Mono>{profile.contactDays.totalDays} distinct</Mono>}
        listLabel="Contact days by month"
        rows={profile.contactDays.months
          .filter((month) => month.days > 0)
          .map((month) => (
            <li key={month.month}>
              <span>
                <Mono>{month.month}</Mono> · {month.days} {month.days === 1 ? 'day' : 'days'}
              </span>
            </li>
          ))}
        empty="No contact inside the trailing twelve months."
      />
      {introBlock}
    </div>
  );
}
