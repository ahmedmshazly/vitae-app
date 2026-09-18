import { Link, useSearchParams } from 'react-router-dom';
import { Banner, Button, EmptyState, FilterGroup, PageHeader } from '@vitae/ui';
import { isValidDateOnly, type ReviewPeriod } from '@vitae/core';
import { useProductivityReview } from './api.js';
import { QueryPanel } from './QueryPanel.js';

/** Keep API facts intact; only convert its exact seconds phrase to readable units. */
function readableFact(fact: string) {
  const match = /^(\d+) seconds recorded$/.exec(fact);
  if (!match) return fact;
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds)) return fact;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts = [
    hours && `${hours}h`,
    minutes && `${minutes}m`,
    remainder && `${remainder}s`,
  ].filter(Boolean);
  return `${parts.join(' ') || '0s'} of focus time recorded`;
}

export function ReviewScreen() {
  const [params, setParams] = useSearchParams();
  const period: ReviewPeriod = params.get('period') === 'weekly' ? 'weekly' : 'daily';
  const query = useProductivityReview(period);
  const data = query.data;
  const bullets = data?.review?.bullets ?? [];
  const incomplete = data && data.completeness !== 'complete';
  const validWindow =
    data && isValidDateOnly(data.window.start) && isValidDateOnly(data.window.end);

  return (
    <div className="page prod-page prod-review">
      <PageHeader
        title="Review"
        subtitle="A short account of your activity, and what needs attention next."
        actions={
          <Link className="vt-btn" to="/today">
            Back to Today
          </Link>
        }
      />
      <div className="prod-review-toolbar">
        <FilterGroup
          label="Review period"
          value={period}
          onChange={(value) =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.set('period', value);
              return next;
            })
          }
          options={[
            { key: 'daily', label: 'Daily' },
            { key: 'weekly', label: 'Weekly' },
          ]}
        />
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Refreshing…' : 'Refresh review'}
        </Button>
      </div>
      <p className="prod-muted">
        {period === 'daily'
          ? 'Today, in your workspace time zone.'
          : 'The last 7 days, including today—not a calendar week.'}
      </p>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          hasData={data != null}
          onRetry={() => void query.refetch()}
          loadingLabel="Loading review"
          errorTitle="Couldn't load the review"
          emptyTitle="Review unavailable"
          emptyHint="Refresh to try loading this period again."
          emptyGlyph="check"
        >
          {data && (
            <>
              <div className="prod-review-window" aria-label="Review date range">
                <span>{period === 'daily' ? 'Daily account' : 'Seven-day account'}</span>
                <p>
                  {validWindow ? (
                    <>
                      <time dateTime={data.window.start}>{data.window.start}</time>
                      {data.window.end !== data.window.start && (
                        <>
                          {' '}
                          — <time dateTime={data.window.end}>{data.window.end}</time>
                        </>
                      )}
                    </>
                  ) : (
                    'Date range unavailable'
                  )}{' '}
                  · {data.time_zone || 'Time zone unavailable'}
                </p>
              </div>
              {incomplete && (
                <Banner tone="warning" title="History is incomplete">
                  {data.completeness === 'sparse'
                    ? 'Some revision details are missing.'
                    : 'Revision history is unavailable for this period.'}{' '}
                  Completions and changes in urgency appear only when measurable. Missing counts are
                  not zero.
                </Banner>
              )}
              {!data.review ? (
                <Banner tone="warning" title="Summary unavailable">
                  The response did not include a review summary. Refresh to try again, or open
                  Analytics for the available figures.
                </Banner>
              ) : bullets.length ? (
                <section className="prod-review-account" aria-labelledby="review-facts">
                  <h2 id="review-facts">At a glance</h2>
                  <ul className="prod-review-facts">
                    {bullets.map((bullet, index) => (
                      <li key={`${index}:${bullet}`}>{readableFact(bullet)}</li>
                    ))}
                  </ul>
                </section>
              ) : (
                <EmptyState
                  glyph="check"
                  title={
                    incomplete ? 'No measured facts available' : 'Nothing recorded for this period'
                  }
                  hint={
                    incomplete
                      ? 'Missing history does not mean there was no activity.'
                      : 'Task completions, focus sessions and habit checks will appear here as they are recorded.'
                  }
                />
              )}
              <p className="prod-review-scope prod-muted">
                Activity totals cover the dates above. Waiting tasks, task placement and application
                stages describe the current workspace. Sensitive records are excluded.
              </p>
              <nav className="prod-review-next" aria-label="Continue from your review">
                <Link to="/today/waiting?followup=due">
                  Review follow-ups <span aria-hidden="true">→</span>
                </Link>
                <Link to="/today/tasks">
                  Plan your tasks <span aria-hidden="true">→</span>
                </Link>
                <Link to="/today/analytics">
                  Explore the figures <span aria-hidden="true">→</span>
                </Link>
              </nav>
            </>
          )}
        </QueryPanel>
      </div>
    </div>
  );
}
