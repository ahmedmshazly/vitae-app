import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  FilterGroup,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';

type AssertionStatus = 'proposed' | 'accepted' | 'rejected' | 'conflict' | 'superseded';
interface Assertion {
  id: string;
  run_id: string;
  subject_id: string;
  subject_kind: string;
  field: string;
  value: unknown;
  current_value?: unknown;
  basis: 'explicit' | 'inferred' | 'manual';
  confidence: number;
  status: AssertionStatus;
  reason: string;
  observed_at: string;
  valid_from: string | null;
  citation: { locator: string; excerpt?: string; record_id: string };
}
interface SourceRecord {
  id: string;
  title: string;
  occurred_at: string | null;
  learned_at: string;
  category: string;
  direction: 'in' | 'out' | 'self' | 'unknown';
  participant_addresses: string[];
  locator: string;
}
function isPersonCandidate(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).identity_kind === 'person',
  );
}
interface KnowledgeData {
  summary: {
    sources: number;
    runs: number;
    records: number;
    pending: number;
    conflicts: number;
    linked_entities: number;
  };
  sources: Array<{
    id: string;
    title: string;
    system: string;
    imported_at: string;
    coverage: { records: number; complete: boolean; limitations: string[] };
  }>;
  runs: Array<{
    id: string;
    status: string;
    started_at: string;
    coverage: { examined: number; extracted: number; skipped: number; complete: boolean };
    limitations: string[];
  }>;
  assertions: Assertion[];
  subjects: Record<string, { id: string; type: string; title: string }>;
}

type Filter = 'review' | 'conflicts' | 'accepted' | 'all';
const FILTERS = [
  { key: 'review', label: 'Needs review' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'all', label: 'All evidence' },
] as const;
function display(value: unknown): string {
  if (value === undefined) return 'Not recorded';
  if (value === null || value === '') return 'Empty';
  if (value && typeof value === 'object' && (value as Record<string, unknown>).identity_kind) {
    const candidate = value as Record<string, unknown>;
    const props = candidate.props as Record<string, unknown> | undefined;
    const email = Array.isArray(props?.emails)
      ? props.emails.find((item): item is string => typeof item === 'string')
      : undefined;
    return [candidate.title, email].filter(Boolean).join(' · ') || 'Identity candidate';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function Knowledge() {
  const [filter, setFilter] = useState<Filter>('review');
  const [recordOffset, setRecordOffset] = useState(0);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => api.get<KnowledgeData>('/knowledge'),
  });
  const records = useQuery({
    queryKey: ['knowledge', 'records', recordOffset],
    queryFn: () =>
      api.get<{ records: SourceRecord[]; total: number }>(
        `/knowledge/records?limit=20&offset=${recordOffset}`,
      ),
  });
  const decision = useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: 'apply' | 'reject' | 'defer' }) =>
      api.post(`/knowledge/assertions/${id}/decision`, { choice }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
  const assertions = useMemo(
    () =>
      (query.data?.assertions ?? []).filter((item) => {
        if (filter === 'review') return item.status === 'proposed' || item.status === 'conflict';
        if (filter === 'conflicts') return item.status === 'conflict';
        if (filter === 'accepted') return item.status === 'accepted';
        return true;
      }),
    [filter, query.data?.assertions],
  );

  if (query.isError)
    return (
      <div className="page data-workspace-page">
        <PageHeader title="Knowledge review" />
        <ErrorState
          title="Couldn't load knowledge evidence"
          detail={(query.error as Error).message}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  return (
    <div className="page data-workspace-page knowledge-page">
      <PageHeader
        title="Knowledge review"
        subtitle="See what each source supports, settle conflicts, and keep every change reversible."
      />
      <RegisterRule />
      {query.isLoading || !query.data ? (
        <SkeletonRows rows={7} />
      ) : (
        <>
          <dl className="knowledge-meter" aria-label="Knowledge coverage">
            {[
              ['Sources', query.data.summary.sources],
              ['Runs', query.data.summary.runs],
              ['Records examined', query.data.summary.records],
              ['Linked entities', query.data.summary.linked_entities],
              ['Needs review', query.data.summary.pending],
              ['Conflicts', query.data.summary.conflicts],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <Section title="Source runs" meta={query.data.runs.length || undefined}>
            {query.data.runs.length === 0 ? (
              <p className="text-sm text-muted">
                No knowledge source has been examined yet. Local Gmail runs appear here after the
                import command completes.
              </p>
            ) : (
              <ol className="knowledge-runs">
                {query.data.runs.map((run) => (
                  <li key={run.id}>
                    <span
                      className="data-state-dot"
                      data-tone={
                        run.status === 'review'
                          ? 'warning'
                          : run.status === 'failed'
                            ? 'danger'
                            : 'success'
                      }
                    />
                    <div>
                      <strong>{run.status.replace('_', ' ')}</strong>
                      <small>
                        {run.coverage.examined} examined · {run.coverage.extracted} evidence items ·{' '}
                        {run.coverage.skipped} excluded
                      </small>
                    </div>
                    <Chip mono>
                      {run.coverage.complete ? 'complete coverage' : 'partial coverage'}
                    </Chip>
                    <Mono className="text-xs text-faint">{run.started_at.slice(0, 10)}</Mono>
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <Section title="Source records" meta={records.data?.total || undefined}>
            <p className="knowledge-ledger-note">
              A compact evidence ledger: dates, participants, direction, and locators are retained;
              full message bodies stay in Gmail.
            </p>
            {records.isError ? (
              <ErrorState
                title="Couldn't load source records"
                detail={(records.error as Error | null)?.message}
                onRetry={() => void records.refetch()}
                retrying={records.isFetching}
              />
            ) : records.isLoading || !records.data ? (
              <SkeletonRows rows={3} />
            ) : (
              <>
                <ol className="knowledge-records">
                  {records.data.records.map((record) => (
                    <li key={record.id}>
                      <div className="knowledge-records__meta">
                        <Chip mono>{record.direction}</Chip>
                        <span>{record.category}</span>
                        <time dateTime={record.occurred_at ?? record.learned_at}>
                          {(record.occurred_at ?? record.learned_at).slice(0, 10)}
                        </time>
                      </div>
                      <strong>{record.title || 'Untitled message'}</strong>
                      {record.participant_addresses.length > 0 && (
                        <span className="knowledge-records__participants">
                          {record.participant_addresses.slice(0, 3).join(' · ')}
                          {record.participant_addresses.length > 3
                            ? ` · +${record.participant_addresses.length - 3}`
                            : ''}
                        </span>
                      )}
                      <Mono className="text-xs text-faint">{record.locator}</Mono>
                    </li>
                  ))}
                </ol>
                {records.data.total > recordOffset + records.data.records.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRecordOffset((offset) => offset + 20)}
                  >
                    Show older records
                  </Button>
                )}
              </>
            )}
          </Section>
          <Section
            title="Assertions"
            meta={assertions.length || undefined}
            actions={
              <FilterGroup
                label="Filter evidence"
                options={FILTERS}
                value={filter}
                onChange={setFilter}
              />
            }
          >
            {assertions.length === 0 ? (
              <EmptyState
                glyph="check"
                title="Nothing in this view"
                hint={
                  filter === 'review'
                    ? 'Every suggestion has been settled.'
                    : 'Choose another evidence filter.'
                }
              />
            ) : (
              <ol className="knowledge-assertions">
                {assertions.map((assertion) => {
                  const subject = query.data.subjects[assertion.subject_id];
                  const actionable =
                    assertion.status === 'proposed' &&
                    assertion.subject_kind === 'node' &&
                    ((!assertion.field.startsWith('$') && Boolean(subject)) ||
                      (assertion.subject_id.startsWith('candidate:') &&
                        assertion.field === '$record' &&
                        isPersonCandidate(assertion.value)));
                  return (
                    <li key={assertion.id} data-status={assertion.status}>
                      <header>
                        <div>
                          <Chip mono>{assertion.status}</Chip>{' '}
                          <span className="text-xs text-faint">
                            {assertion.basis} · {Math.round(assertion.confidence * 100)}%
                          </span>
                        </div>
                        {subject ? (
                          <Link to={`/n/${subject.id}`}>{subject.title}</Link>
                        ) : (
                          <span>
                            {assertion.subject_id.startsWith('candidate:')
                              ? 'New identity candidate'
                              : assertion.subject_id}
                          </span>
                        )}
                      </header>
                      <div className="knowledge-comparison">
                        <div>
                          <small>Curated fact</small>
                          <strong>{display(assertion.current_value)}</strong>
                        </div>
                        <div aria-hidden="true" className="knowledge-comparison__axis">
                          →
                        </div>
                        <div>
                          <small>Source says</small>
                          <strong>{display(assertion.value)}</strong>
                        </div>
                      </div>
                      {assertion.citation.excerpt && (
                        <blockquote>“{assertion.citation.excerpt}”</blockquote>
                      )}
                      <footer>
                        <Mono className="text-xs text-faint">{assertion.citation.locator}</Mono>
                        {(actionable || assertion.status === 'conflict') && (
                          <span>
                            {actionable && (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={decision.isPending}
                                onClick={() =>
                                  decision.mutate({ id: assertion.id, choice: 'apply' })
                                }
                              >
                                {assertion.subject_id.startsWith('candidate:')
                                  ? 'Create person'
                                  : 'Accept fact'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={decision.isPending}
                              onClick={() =>
                                decision.mutate({ id: assertion.id, choice: 'reject' })
                              }
                            >
                              Reject
                            </Button>
                          </span>
                        )}
                      </footer>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
