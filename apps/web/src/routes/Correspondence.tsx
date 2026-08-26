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
              the bar. Reciprocity and reply latency will join once interactions carry direction;
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

      <Section title="Brokers" meta={rollup.isSuccess ? brokers.length : undefined}>
        {rollup.isLoading || rollup.isError ? null : brokers.length === 0 ? (
          <EmptyState
            glyph="merge"
            title="No brokers recorded"
            hint="When a relationship records who introduced you — met via, on the connection — the tally appears here."
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {brokers.map((b) => (
              <li
                key={b.via}
                className="flex min-h-9 items-center gap-3 border-b border-hairline py-2 last:border-b-0"
              >
                <span className="row__title">{b.via}</span>
                <Mono className="ml-auto">
                  {b.count} {b.count === 1 ? 'introduction' : 'introductions'}
                </Mono>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
