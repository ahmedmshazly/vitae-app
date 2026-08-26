import { useQuery } from '@tanstack/react-query';
import { Chip, EmptyState, ErrorState, Mono, SkeletonRows } from '@vitae/ui';
import { api } from '../lib/api.js';

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
  if (value === null) return '—';
  return value < 1 ? '<1 day' : `${Math.round(value * 10) / 10} days`;
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

  if (query.isPending) return <SkeletonRows rows={3} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Correspondence unavailable"
        detail="The profile could not be computed."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const profile = query.data?.profile;
  if (!profile?.coverage) {
    return <ErrorState title="Correspondence unavailable" detail="The response carried no profile." />;
  }
  const introductions = query.data?.introductions;
  const introductionsBlock =
    introductions && (introductions.connected.length > 0 || introductions.brokered.length > 0) ? (
      <details>
        <summary className="cursor-pointer">
          Introductions{' '}
          <Mono className="text-xs">
            {introductions.connected.length + introductions.brokered.length}
          </Mono>
        </summary>
        <ul className="mt-2 text-xs text-muted" aria-label="Recorded introductions">
          {introductions.connected.map((intro) => (
            <li key={intro.edgeId}>
              connected to {intro.otherTitle ?? intro.otherId}
              {intro.viaLabel ? ` via ${intro.viaLabel}` : ''}
              {intro.occurredOn ? ` · ${intro.occurredOn}` : ''}
              {intro.context ? ` · ${intro.context}` : ''}
            </li>
          ))}
          {introductions.brokered.map((intro) => (
            <li key={intro.edgeId}>
              brokered {intro.srcTitle ?? intro.srcId} ↔ {intro.dstTitle ?? intro.dstId}
              {intro.occurredOn ? ` · ${intro.occurredOn}` : ''}
            </li>
          ))}
        </ul>
      </details>
    ) : null;
  const byId = new Map(interactions.map((i) => [i.id, i]));
  const name = (id: string): string => {
    const hit = byId.get(id);
    return hit ? `${hit.at ? hit.at.slice(0, 10) : 'undated'} — ${hit.title}` : id;
  };

  if (profile.coverage.total === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          glyph="interaction"
          title="No interactions logged"
          hint="The correspondence profile computes from logged interactions; there are none yet."
        />
        {introductionsBlock}
      </div>
    );
  }

  if (profile.coverage.withDirection === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          glyph="interaction"
          title="No stated directions yet"
          hint={`None of the ${profile.coverage.total} logged interactions says who reached out. New logs carry a who-reached-out control; older entries stay uncounted rather than guessed.`}
        />
        {introductionsBlock}
      </div>
    );
  }

  const partialCoverage = profile.coverage.withDirection < profile.coverage.total;
  const monthsWithContact = profile.contactDays.months.filter((m) => m.days > 0);

  return (
    <div className="space-y-3">
      {partialCoverage && (
        <p className="text-xs text-muted">
          {profile.coverage.withDirection} of {profile.coverage.total} interactions state a
          direction; the rest count as contact only.
        </p>
      )}

      <details>
        <summary className="cursor-pointer">
          Reciprocity{' '}
          <Mono className="text-xs">
            you {profile.reciprocity.outbound} · them {profile.reciprocity.inbound}
          </Mono>{' '}
          {profile.reciprocity.ratio !== null && (
            <Chip mono>{Math.round(profile.reciprocity.ratio * 100)}% yours</Chip>
          )}
        </summary>
        <ul className="mt-2 text-xs text-muted" aria-label="Reciprocity evidence">
          {profile.reciprocity.outboundIds.map((id) => (
            <li key={id}>you → {name(id)}</li>
          ))}
          {profile.reciprocity.inboundIds.map((id) => (
            <li key={id}>them → {name(id)}</li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer">
          Reply latency{' '}
          <Mono className="text-xs">
            you {days(profile.replyLatency.mine.medianDays)} · them{' '}
            {days(profile.replyLatency.theirs.medianDays)}
          </Mono>
        </summary>
        <ul className="mt-2 text-xs text-muted" aria-label="Reply pairs">
          {profile.replyLatency.mine.samples.map((s) => (
            <li key={`${s.fromId}-${s.toId}`}>
              your reply in {days(s.days)}: {name(s.fromId)} → {name(s.toId)}
            </li>
          ))}
          {profile.replyLatency.theirs.samples.map((s) => (
            <li key={`${s.fromId}-${s.toId}`}>
              their reply in {days(s.days)}: {name(s.fromId)} → {name(s.toId)}
            </li>
          ))}
          {profile.replyLatency.mine.samples.length === 0 &&
            profile.replyLatency.theirs.samples.length === 0 && (
              <li>No reply pairs inside the sixty-day window.</li>
            )}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer">
          Unanswered inbound <Mono className="text-xs">{profile.unansweredInbound.count}</Mono>
        </summary>
        <ul className="mt-2 text-xs text-muted" aria-label="Unanswered inbound interactions">
          {profile.unansweredInbound.eventIds.map((id) => (
            <li key={id}>{name(id)}</li>
          ))}
          {profile.unansweredInbound.count === 0 && <li>Nothing waiting on a reply from you.</li>}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer">
          Contact days{' '}
          <Mono className="text-xs">{profile.contactDays.totalDays} distinct</Mono>
        </summary>
        <ul className="mt-2 text-xs text-muted" aria-label="Contact days by month">
          {monthsWithContact.map((m) => (
            <li key={m.month}>
              <Mono>{m.month}</Mono> · {m.days} {m.days === 1 ? 'day' : 'days'}
            </li>
          ))}
          {monthsWithContact.length === 0 && (
            <li>No contact inside the trailing twelve months.</li>
          )}
        </ul>
      </details>

      {introductionsBlock}
    </div>
  );
}
