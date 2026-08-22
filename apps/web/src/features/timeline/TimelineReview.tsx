import { Link } from 'react-router-dom';
import { Button, Chip, Disclosure, EmptyState, ErrorState, Mono, StatusTrace } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { TimelineReviewResult } from './types.js';

export interface TimelineReviewProps {
  review: TimelineReviewResult | undefined;
  loading: boolean;
  onClear: () => void;
  onExportMarkdown: () => void;
  /** The digest lookup failed, distinct from an empty window. */
  failed?: boolean;
  onRetry?: () => void;
}

export function TimelineReviewDock({
  review,
  loading,
  onClear,
  onExportMarkdown,
  failed,
  onRetry,
}: TimelineReviewProps) {
  // TimelineView passes isFetching, which is false while a query is pending
  // but paused, offline for instance. That left a fourth state with no trace
  // and no error that rendered as the idle header: a panel asking you to brush
  // the range you had just brushed. Waiting is now the fallback, not a peer.
  const waiting = loading || (!failed && !review);

  return (
    <aside className="tl__review" aria-label="Season review">
      <div className="tl__reviewhead">
        <div>
          <h2 className="tl__reviewtitle text-base">{review?.label ?? 'Season review'}</h2>
          {/* The subtitle told you to brush a range while showing the digest of
              the range you brushed, and the dates it read were never on screen
              even though the export prints them. */}
          {review ? (
            <Mono className="u-faint text-xs">
              {review.from} → {review.to}
            </Mono>
          ) : (
            <span className="u-faint text-xs">Brush a range on the chronograph</span>
          )}
        </div>
        {/* Every other x in the app is a Close. This one answered to Clear
            brush, the same name the panel's own button carries, so the two
            were indistinguishable by name alone. */}
        <button
          type="button"
          className="vt-modal__x"
          aria-label="Close season review"
          onClick={onClear}
        >
          ×
        </button>
      </div>

      {waiting && (
        <div className="tl__reviewstate">
          <StatusTrace label="Reading this season" detail="Grouping dated evidence" tone="live" />
        </div>
      )}

      {/* `isError` was never read, so a failed digest fell back to the default
          header and looked exactly like not having brushed anything yet. */}
      {!waiting && failed && (
        <ErrorState
          title="Couldn’t summarise that range"
          detail="The chronograph is unaffected. Retry this range or clear the brush to choose another."
          onRetry={onRetry}
          retryLabel="Retry review"
        />
      )}

      {!waiting && !failed && review && (
        <>
          <div className="tl__reviewsummary">
            {Object.entries(review.summary)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <Chip key={k} mono>
                  {n} {k}
                </Chip>
              ))}
          </div>

          {review.sections.length === 0 ? (
            // Was one line of faint text with no way out, in the one state
            // where the panel most needs to offer the next move.
            <EmptyState
              glyph="timeline"
              title="Nothing dated in this window"
              hint="Brush a wider season, or clear the brush and choose another."
              action={
                <Button size="sm" onClick={onClear}>
                  Clear brush
                </Button>
              }
            />
          ) : (
            <>
              <div className="tl__reviewsections">
              {review.sections.map((sec) => (
                // Was a raw details/summary: a 27px target with the browser's
                // own triangle in a panel where everything else is 32px.
                <Disclosure
                  key={sec.key}
                  className="tl__reviewsec"
                  label={sec.title}
                  meta={sec.count}
                  defaultOpen={sec.count <= 8}
                >
                  <ul className="tl__reviewlist">
                    {sec.items.map((item) => (
                      <li key={item.id}>
                        <Link className="tl__reviewrow" to={entityHref(item.type, item.id)}>
                          <span className="tl__reviewrowtitle">{item.title}</span>
                          <Mono className="u-faint text-xs">
                            {item.start}
                            {item.end ? ` → ${item.end}` : ''}
                          </Mono>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {sec.items.length < sec.count && (
                    // The badge counts every match; the list stops at 40. It
                    // said "57" over 40 rows and nothing about the other 17.
                    <p className="u-faint text-xs">
                      Showing the first {sec.items.length} of {sec.count}. Narrow the window to see
                      the rest.
                    </p>
                  )}
                  </Disclosure>
                ))}
              </div>

              {/* The footer lived outside this branch, so an empty window put a
                  second Clear brush under the one the empty state offers and a
                  permanently dead Export beside it. */}
              <div className="tl__reviewfoot">
                <Button size="sm" variant="primary" onClick={onExportMarkdown}>
                  Export Markdown
                </Button>
                <Button size="sm" onClick={onClear}>
                  Clear brush
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}

export function reviewToMarkdown(review: TimelineReviewResult): string {
  const lines: string[] = [`# ${review.label}`, '', `Period: ${review.from} → ${review.to}`, ''];
  for (const [k, n] of Object.entries(review.summary)) {
    if (n > 0) lines.push(`- **${k}:** ${n}`);
  }
  lines.push('');
  for (const sec of review.sections) {
    lines.push(`## ${sec.title} (${sec.count})`, '');
    for (const item of sec.items) {
      const when = item.end ? `${item.start} → ${item.end}` : item.start;
      lines.push(`- ${item.title}${item.subtitle ? `: ${item.subtitle}` : ''} (${when})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
