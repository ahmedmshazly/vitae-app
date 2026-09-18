import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  FactorChip,
  FilterGroup,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { InteractionLogger } from '../features/InteractionLogger.js';

export interface ReactivationRow {
  person: { id: string; title: string; type: string };
  score: number;
  peak_strength: number;
  peak_at: string;
  current_strength: number;
  days_since_last: number | null;
  factors: { closeness: number; intensity: number };
}

interface Rollup {
  candidates: ReactivationRow[];
  considered_dormant: number;
  brokers: Array<{ via: string; count: number }>;
  introduced_brokers: Array<{
    via: string;
    person_id: string | null;
    label: string;
    count: number;
    edge_ids: string[];
  }>;
  out_of_balance: Array<{
    person: { id: string; title: string; type: string };
    ratio: number;
    outbound: number;
    inbound: number;
    unanswered_inbound: number;
  }>;
}

const QUIETNESS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '90', label: '90+ days quiet' },
  { key: '180', label: '180+ days quiet' },
] as const;

type QuietnessFilter = (typeof QUIETNESS_FILTERS)[number]['key'];
const EMPTY_CANDIDATES: ReactivationRow[] = [];

function monthOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'an earlier interaction'
    : new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date);
}

/**
 * Correspondence (SRS FR-COMM-002): dormant-but-once-strong ties ranked for
 * reactivation, and the brokers introductions have flowed through. The
 * research is blunt: reconnected dormant ties outperform active ones, and
 * people left to choose reconnect with whoever feels comfortable instead of
 * whoever would help. This ranking is the corrective, and it shows its
 * arithmetic (NFR-PRIV-003).
 */
export function Correspondence() {
  const [query, setQuery] = useState('');
  const [quietness, setQuietness] = useState<QuietnessFilter>('all');
  const [loggingPerson, setLoggingPerson] = useState<ReactivationRow['person'] | null>(null);
  const rollup = useQuery({
    queryKey: ['correspondence'],
    queryFn: () => api.get<Rollup>('/correspondence'),
  });
  const candidates = rollup.data?.candidates ?? EMPTY_CANDIDATES;
  const considered = rollup.data?.considered_dormant ?? 0;
  const brokers = rollup.data?.brokers ?? [];
  const introduced = rollup.data?.introduced_brokers ?? [];
  const outOfBalance = rollup.data?.out_of_balance ?? [];
  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const minimumQuietDays = quietness === 'all' ? 0 : Number(quietness);
    return candidates.filter(
      (candidate) =>
        candidate.person.title.toLocaleLowerCase().includes(normalized) &&
        (candidate.days_since_last ?? 0) >= minimumQuietDays,
    );
  }, [candidates, query, quietness]);
  const filtersActive = Boolean(query.trim()) || quietness !== 'all';

  return (
    <div className="page page--correspondence">
      <PageHeader
        title="Correspondence"
        subtitle="A deliberate queue for reconnecting with people who mattered before the relationship went quiet."
        help={
          <InfoPopover title="How this ranks">
            <p>
              A priority score compares dormant, once-strong ties; it does not predict a reply. Peak
              and current strength use the same recorded relationship history. A tie appears when it
              is quiet now and its earlier strength cleared the threshold. Balance uses only
              interactions where you stated who initiated it—nothing here guesses.
            </p>
          </InfoPopover>
        }
      />

      <Section
        title="Worth reactivating"
        meta={rollup.isSuccess ? visibleCandidates.length : undefined}
      >
        {rollup.isError ? (
          <ErrorState
            title="Couldn't load correspondence"
            detail={(rollup.error as Error | null)?.message}
            onRetry={() => void rollup.refetch()}
          />
        ) : rollup.isLoading ? (
          <div role="status" aria-label="Loading correspondence">
            <SkeletonRows rows={5} />
          </div>
        ) : candidates.length === 0 ? (
          considered > 0 ? (
            <EmptyState
              glyph="interaction"
              title="Nothing worth reactivating"
              hint={`${considered} dormant ${considered === 1 ? 'tie was' : 'ties were'} considered; none was once strong enough to rank.`}
            />
          ) : (
            <EmptyState
              glyph="interaction"
              title="No dormant ties"
              hint="Cadence is holding. When a once-strong tie goes quiet, it appears here with its evidence."
            />
          )
        ) : (
          <>
            <div className="correspondence-queue__toolbar">
              <Input
                aria-label="Filter reactivation queue"
                placeholder="Find a person…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <FilterGroup
                label="Quiet for"
                options={QUIETNESS_FILTERS.map((filter) => ({ ...filter }))}
                value={quietness}
                onChange={(value) => setQuietness(value as QuietnessFilter)}
              />
            </div>
            {rollup.isFetching && (
              <StatusTrace
                className="network-trace"
                tone="live"
                label="Refreshing reactivation queue"
                detail="Keeping the last calculated priorities visible"
              />
            )}
            {visibleCandidates.length === 0 ? (
              <EmptyState
                glyph="interaction"
                title="No reactivation candidates match"
                hint="Try a shorter name or a less restrictive quiet-time filter."
                action={
                  filtersActive ? (
                    <button
                      type="button"
                      className="vt-btn vt-btn--sm"
                      onClick={() => {
                        setQuery('');
                        setQuietness('all');
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="correspondence-register" aria-label="Reactivation queue">
                {visibleCandidates.map((candidate, index) => (
                  <li key={candidate.person.id} className="correspondence-register__row">
                    <div className="correspondence-register__identity">
                      <Mono className="correspondence-register__rank">{index + 1}</Mono>
                      <div>
                        <Link
                          className="correspondence-register__name"
                          to={`/network/people/${candidate.person.id}`}
                        >
                          {candidate.person.title}
                        </Link>
                        <p>
                          Peak <Mono>{candidate.peak_strength.toFixed(2)}</Mono> in{' '}
                          <Mono>{monthOf(candidate.peak_at)}</Mono> · now{' '}
                          <Mono>{candidate.current_strength.toFixed(2)}</Mono>
                          {candidate.days_since_last != null && (
                            <>
                              {' '}
                              · quiet <Mono>{candidate.days_since_last} days</Mono>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div
                      className="correspondence-register__evidence"
                      aria-label="Priority evidence"
                    >
                      <span className="correspondence-register__score">
                        <small>priority score</small>
                        <Mono>{candidate.score.toFixed(2)}</Mono>
                      </span>
                      <FactorChip label="closeness" value={candidate.factors.closeness} />
                      <FactorChip label="intensity" value={candidate.factors.intensity} />
                    </div>
                    <div className="correspondence-register__actions">
                      <button
                        type="button"
                        className="vt-btn vt-btn--primary vt-btn--sm"
                        onClick={() => setLoggingPerson(candidate.person)}
                      >
                        Log reconnection
                      </button>
                      <Link
                        className="correspondence-register__profile"
                        to={`/network/people/${candidate.person.id}`}
                      >
                        Open profile
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="correspondence-queue__count" role="status">
              {filtersActive ? `${visibleCandidates.length} of ` : ''}
              {considered} dormant {considered === 1 ? 'tie' : 'ties'} considered.
            </p>
          </>
        )}
      </Section>

      <Section title="Out of balance" meta={rollup.isSuccess ? outOfBalance.length : undefined}>
        {rollup.isLoading || rollup.isError ? null : outOfBalance.length === 0 ? (
          <EmptyState
            glyph="interaction"
            title="No imbalance to report"
            hint="A tie ranks here once four interactions state who reached out and the split leans one way."
          />
        ) : (
          <ul className="correspondence-ledger" aria-label="Relationship balance">
            {outOfBalance.map((row) => (
              <li key={row.person.id}>
                <div>
                  <Link
                    className="correspondence-ledger__name"
                    to={`/network/people/${row.person.id}`}
                  >
                    {row.person.title}
                  </Link>
                  <p>
                    you <Mono>{row.outbound}</Mono> · them <Mono>{row.inbound}</Mono>
                    {row.unanswered_inbound > 0 && (
                      <>
                        {' '}
                        · <Mono>{row.unanswered_inbound}</Mono> unanswered inbound
                      </>
                    )}
                  </p>
                </div>
                <Mono>{Math.round(row.ratio * 100)}% yours</Mono>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Brokers"
        meta={rollup.isSuccess ? introduced.length + brokers.length : undefined}
      >
        {rollup.isLoading || rollup.isError ? null : introduced.length === 0 &&
          brokers.length === 0 ? (
          <EmptyState
            glyph="merge"
            title="No brokers recorded"
            hint="Log an introduction on a person profile, or record met-via on a relationship, and the tallies appear here."
          />
        ) : (
          <>
            {/* Two labeled groups by design (FR-COMM-003): recorded INTRODUCED
                edges and free-text met-via credits are different kinds of fact,
                and merging them on a matching string would be a guess. */}
            {introduced.length > 0 && (
              <>
                <h3 className="mt-1 text-sm text-muted">Recorded introductions</h3>
                <ul className="correspondence-ledger" aria-label="Brokers by recorded introduction">
                  {introduced.map((b) => (
                    <li key={b.via} className="correspondence-ledger__compact">
                      <span className="correspondence-ledger__name">
                        {b.person_id ? (
                          <Link to={`/network/people/${b.person_id}`}>{b.label}</Link>
                        ) : (
                          b.label
                        )}
                      </span>
                      <Mono>
                        {b.count} {b.count === 1 ? 'introduction' : 'introductions'}
                      </Mono>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {brokers.length > 0 && (
              <>
                <h3 className="mt-3 text-sm text-muted">Credited in met-via</h3>
                <ul className="correspondence-ledger" aria-label="Brokers credited in met-via">
                  {brokers.map((b) => (
                    <li key={b.via} className="correspondence-ledger__compact">
                      <span className="correspondence-ledger__name">{b.via}</span>
                      <Mono>
                        {b.count} {b.count === 1 ? 'credit' : 'credits'}
                      </Mono>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Section>
      {loggingPerson && (
        <InteractionLogger
          personId={loggingPerson.id}
          personName={loggingPerson.title}
          onClose={() => setLoggingPerson(null)}
        />
      )}
    </div>
  );
}
