import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Chip, ErrorState, Mono, Section, SkeletonRows } from '@vitae/ui';
import { api } from '../lib/api.js';

interface Assertion {
  id: string;
  field: string;
  value: unknown;
  status: string;
  basis: string;
  confidence: number;
  valid_from: string | null;
  reason: string;
  citation: { locator: string; excerpt?: string; record_id: string };
}

interface SourceRecord {
  title: string;
  kind: string;
  occurred_at: string | null;
  direction: 'in' | 'out' | 'self' | 'unknown';
  locator: string;
}

interface EvidenceResponse {
  assertions: Assertion[];
  records?: Record<string, SourceRecord>;
}

export function EntityEvidence({ entityId }: { entityId: string }) {
  return <EvidenceRegister key={entityId} entityId={entityId} />;
}

function EvidenceRegister({ entityId }: { entityId: string }) {
  const [limit, setLimit] = useState(20);
  const query = useQuery({
    queryKey: ['entity-evidence', entityId],
    queryFn: () => api.get<EvidenceResponse>(`/knowledge/entities/${entityId}/evidence`),
  });
  const assertions = query.data?.assertions ?? [];
  return (
    <Section
      title="Evidence"
      meta={query.data?.assertions ? assertions.length : undefined}
      actions={<Link to="/data/knowledge">Open knowledge ledger</Link>}
    >
      {query.isError && query.data?.assertions && (
        <Banner
          tone="danger"
          title="Evidence could not be refreshed"
          className="network-secondary-state"
          action={
            <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? 'Retrying…' : 'Retry evidence'}
            </Button>
          }
        >
          Showing the last loaded evidence. The curated record is unchanged.
        </Banner>
      )}
      {query.isLoading ? (
        <div role="status" aria-label="Loading source evidence">
          <SkeletonRows rows={2} />
        </div>
      ) : !query.data?.assertions ? (
        <ErrorState
          title="Evidence unavailable"
          detail="We couldn’t load source evidence. The curated record is unchanged."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          retryLabel="Retry evidence"
        />
      ) : assertions.length === 0 ? (
        <p className="text-sm text-muted">No source assertions support this record yet.</p>
      ) : (
        <>
          {!query.isError && query.isFetching && (
            <p role="status" className="text-sm text-muted">
              Refreshing evidence…
            </p>
          )}
          <ul className="entity-evidence" aria-label="Evidence supporting this record">
            {assertions.slice(0, limit).map((assertion) => {
              const source = query.data?.records?.[assertion.citation.record_id];
              return (
                <li key={assertion.id}>
                  <div className="entity-evidence__line">
                    <Chip mono>{assertion.status}</Chip>
                    <strong>
                      {assertion.field === '$record'
                        ? 'Record context'
                        : assertion.field.replace(/^props\./, '').replaceAll('_', ' ')}
                    </strong>
                    <span className="text-xs text-muted">
                      {assertion.basis} ·{' '}
                      {Number.isFinite(assertion.confidence)
                        ? `${Math.round(assertion.confidence * 100)}% confidence`
                        : 'Confidence unavailable'}
                    </span>
                  </div>
                  {assertion.citation.excerpt && (
                    <blockquote>“{assertion.citation.excerpt}”</blockquote>
                  )}
                  <Mono className="text-xs text-muted">
                    {assertion.citation.locator}
                    {assertion.valid_from ? ` · valid ${assertion.valid_from.slice(0, 10)}` : ''}
                  </Mono>
                  <details className="entity-evidence__source">
                    <summary>Source details</summary>
                    {assertion.reason && <p className="text-sm">{assertion.reason}</p>}
                    {source ? (
                      <dl>
                        <div>
                          <dt>Source</dt>
                          <dd>{source.title || 'Untitled source'}</dd>
                        </div>
                        <div>
                          <dt>Kind</dt>
                          <dd>{source.kind}</dd>
                        </div>
                        <div>
                          <dt>Date</dt>
                          <dd>{source.occurred_at?.slice(0, 10) || 'Not recorded'}</dd>
                        </div>
                        <div>
                          <dt>Direction</dt>
                          <dd>
                            {
                              {
                                in: 'Inbound',
                                out: 'Outbound',
                                self: 'Self',
                                unknown: 'Not recorded',
                              }[source.direction]
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Locator</dt>
                          <dd>
                            <Mono>{source.locator || assertion.citation.locator}</Mono>
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-sm text-muted">
                        Source metadata is unavailable. The citation above is retained.
                      </p>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
          {assertions.length > 20 && (
            <div className="entity-evidence__more">
              <Mono>
                {Math.min(limit, assertions.length)} of {assertions.length} assertions
              </Mono>
              {limit < assertions.length ? (
                <Button size="sm" onClick={() => setLimit((value) => value + 20)}>
                  Show more evidence
                </Button>
              ) : (
                <Button size="sm" onClick={() => setLimit(20)}>
                  Show first 20 assertions
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
