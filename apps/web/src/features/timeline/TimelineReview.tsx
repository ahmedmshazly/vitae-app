import { Link } from 'react-router-dom';
import { Button, Chip, Mono, Spinner } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { TimelineReviewResult } from './types.js';

export interface TimelineReviewProps {
  review: TimelineReviewResult | undefined;
  loading: boolean;
  onClear: () => void;
  onExportMarkdown: () => void;
  /** The digest lookup failed, distinct from an empty window. */
  failed?: boolean;
}

export function TimelineReviewDock({ review, loading, onClear, onExportMarkdown, failed }: TimelineReviewProps) {
  return (
    <aside className="tl__review" aria-label="Season review">
      <div className="tl__reviewhead">
        <div>
          <div className="tl__reviewtitle">{review?.label ?? 'Season review'}</div>
          <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
            Brush a range on the chronograph
          </div>
        </div>
        <button type="button" className="vt-modal__x" aria-label="Clear brush" onClick={onClear}>
          ×
        </button>
      </div>

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <Spinner />
        </div>
      )}

      {/* `isError` was never read, so a failed digest fell back to the default
          header and looked exactly like not having brushed anything yet. */}
      {!loading && failed && (
        <p role="alert" className="text-sm text-danger">
          <strong className="font-semibold">Couldn’t summarise that range.</strong> The chronograph itself is
          unaffected, brush again to retry.
        </p>
      )}

      {!loading && !failed && review && (
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
            <p className="u-faint">Nothing dated in this window, try a wider brush.</p>
          ) : (
            <div className="tl__reviewsections">
              {review.sections.map((sec) => (
                <details key={sec.key} className="tl__reviewsec" open={sec.count <= 8}>
                  <summary>
                    {sec.title}{' '}
                    <Mono className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                      {sec.count}
                    </Mono>
                  </summary>
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
                      Showing the first {sec.items.length} of {sec.count}. Narrow the window to see the rest.
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}

          <div className="tl__reviewfoot">
            <Button size="sm" variant="primary" onClick={onExportMarkdown} disabled={!review.sections.length}>
              Export Markdown
            </Button>
            <Button size="sm" onClick={onClear}>
              Clear brush
            </Button>
          </div>
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
