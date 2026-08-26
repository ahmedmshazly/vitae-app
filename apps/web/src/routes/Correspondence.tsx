import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  FactorChip,
  InfoPopover,
  Mono,
  PageHeader,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';

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

/**
 * Correspondence (SRS FR-COMM-002): dormant-but-once-strong ties ranked for
 * reactivation, and the brokers introductions have flowed through. The
 * research is blunt — reconnected dormant ties outperform active ones, and
 * people left to choose reconnect with whoever feels comfortable instead of
 * whoever would help. This ranking is the corrective, and it shows its
 * arithmetic (NFR-PRIV-003).
 */
export function Correspondence() {
  const rollup = useQuery({
    queryKey: ['correspondence'],
    queryFn: () => api.get<Rollup>('/correspondence'),
  });
  const candidates = rollup.data?.candidates ?? [];
  const considered = rollup.data?.considered_dormant ?? 0;
  const brokers = rollup.data?.brokers ?? [];
  const introduced = rollup.data?.introduced_brokers ?? [];
  const outOfBalance = rollup.data?.out_of_balance ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Correspondence"
        subtitle="The ties worth reactivating, ranked by what they once were — not by what feels easy."
        help={
          <InfoPopover title="How this ranks">
            <p>
              Every relationship's history is re-read with the same model that scores it today,
              evaluated at each logged interaction, so the peak and the present come from one
              arithmetic. A tie ranks here when it is dormant now and its peak strength cleared
              the bar. Balance rows come from the same correspondence profile the person page
              shows, computed only from interactions whose direction the operator stated;
              nothing here guesses.
            </p>
          </InfoPopover>
        }
      />

      <Section
        title="Worth reactivating"
        meta={rollup.isSuccess ? candidates.length : undefined}
      >
        {rollup.isError ? (
          <ErrorState
            title="Couldn’t load correspondence"
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
            <ul className="m-0 list-none p-0">
              {candidates.map((c) => (
                <li
                  key={c.person.id}
                  className="row flex min-h-9 flex-wrap items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                >
                  <div className="row__main">
                    <div className="row__title">
                      <Link to={`/network/people/${c.person.id}`}>{c.person.title}</Link>
                    </div>
                    <div className="row__sub">
                      peak <Mono>{c.peak_strength.toFixed(2)}</Mono> in{' '}
                      <Mono>{c.peak_at.slice(0, 7)}</Mono> · now{' '}
                      <Mono>{c.current_strength.toFixed(2)}</Mono>
                      {c.days_since_last != null && (
                        <>
                          {' '}
                          · <Mono>{c.days_since_last}d</Mono> quiet
                        </>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    <FactorChip label="closeness" value={c.factors.closeness} />
                    <FactorChip label="intensity" value={c.factors.intensity} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">
              {considered} dormant {considered === 1 ? 'tie' : 'ties'} considered.
            </p>
          </>
        )}
      </Section>

      <Section
        title="Out of balance"
        meta={rollup.isSuccess ? outOfBalance.length : undefined}
      >
        {rollup.isLoading || rollup.isError ? null : outOfBalance.length === 0 ? (
          <EmptyState
            glyph="interaction"
            title="No imbalance to report"
            hint="A tie ranks here once four interactions state who reached out and the split leans one way."
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {outOfBalance.map((row) => (
              <li
                key={row.person.id}
                className="row flex min-h-9 flex-wrap items-center gap-3 border-b border-hairline py-2 last:border-b-0"
              >
                <div className="row__main">
                  <div className="row__title">
                    <Link to={`/network/people/${row.person.id}`}>{row.person.title}</Link>
                  </div>
                  <div className="row__sub">
                    you <Mono>{row.outbound}</Mono> · them <Mono>{row.inbound}</Mono>
                    {row.unanswered_inbound > 0 && (
                      <>
                        {' '}
                        · <Mono>{row.unanswered_inbound}</Mono> unanswered inbound
                      </>
                    )}
                  </div>
                </div>
                <Mono className="ml-auto">{Math.round(row.ratio * 100)}% yours</Mono>
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
                <ul className="m-0 list-none p-0" aria-label="Brokers by recorded introduction">
                  {introduced.map((b) => (
                    <li
                      key={b.via}
                      className="flex min-h-9 items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                    >
                      <span className="row__title">
                        {b.person_id ? (
                          <Link to={`/network/people/${b.person_id}`}>{b.label}</Link>
                        ) : (
                          b.label
                        )}
                      </span>
                      <Mono className="ml-auto">
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
                <ul className="m-0 list-none p-0" aria-label="Brokers credited in met-via">
                  {brokers.map((b) => (
                    <li
                      key={b.via}
                      className="flex min-h-9 items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                    >
                      <span className="row__title">{b.via}</span>
                      <Mono className="ml-auto">
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
    </div>
  );
}
