import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  ProvenanceChip,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { fieldLabel } from '../lib/revision-fields.js';

export interface LedgerEntry {
  id: string;
  at: string;
  op: string;
  source: string;
  subject_kind: string;
  subject_id: string;
  rev: number;
  title: string | null;
  type: string | null;
  changed: string[];
}

interface LedgerPage {
  entries: LedgerEntry[];
  next_before: string | null;
}

/** The operation, as a verb a person would use (never the raw enum alone). */
export function opLabel(op: string): string {
  switch (op) {
    case 'create':
      return 'created';
    case 'update':
      return 'edited';
    case 'append':
      return 'note appended to';
    case 'delete':
      return 'deleted';
    case 'restore':
      return 'restored';
    case 'merge':
      return 'merged';
    default:
      return op;
  }
}

/**
 * The Ledger (SRS FR-PROV-002): what changed since you last looked. Every
 * mutation already writes a revision in the same transaction; this screen is
 * that history as a reverse-chronological feed. Entries label themselves from
 * their stored snapshots, so a deleted record still shows the name it had.
 */
export function Ledger() {
  // Pages accumulate; the cursor is the timestamp the previous page ended on.
  const [pages, setPages] = useState<LedgerPage[]>([]);
  const cursor = pages.length ? pages[pages.length - 1].next_before : undefined;
  const first = useQuery({
    queryKey: ['ledger'],
    queryFn: () => api.get<LedgerPage>('/ledger?limit=50'),
  });
  const more = useQuery({
    queryKey: ['ledger', cursor],
    queryFn: () => api.get<LedgerPage>(`/ledger?limit=50&before=${encodeURIComponent(cursor!)}`),
    enabled: false,
  });

  const entries = [...(first.data?.entries ?? []), ...pages.flatMap((p) => p.entries)];
  const nextBefore = pages.length ? cursor : (first.data?.next_before ?? null);

  async function loadMore() {
    const res = await more.refetch();
    if (res.data) setPages((prev) => [...prev, res.data]);
  }

  return (
    <div className="page">
      <PageHeader
        title="Ledger"
        subtitle="Every change to the record, newest first: the history every write already keeps."
        help={
          <InfoPopover title="Where this comes from">
            <p>
              Every mutation writes a revision in the same transaction as the change itself:
              the operation, a snapshot, the exact fields that moved, and the source it came
              from. The Ledger reads that history back. Nothing here is derived or inferred.
              A row exists because a write happened.
            </p>
          </InfoPopover>
        }
      />

      <Section title="What changed" meta={first.isSuccess ? entries.length : undefined}>
        {first.isError ? (
          <ErrorState
            title="Couldn't load the ledger"
            detail={(first.error as Error | null)?.message}
            onRetry={() => void first.refetch()}
          />
        ) : first.isLoading ? (
          <div role="status" aria-label="Loading the ledger">
            <SkeletonRows rows={6} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            glyph="journal"
            title="No changes yet"
            hint="Capture something and its revision appears here. Every write keeps its history."
          />
        ) : (
          <>
            <ul className="ledger-list">
              {entries.map((entry) => (
                <li key={entry.id} className="row" data-op={entry.op}>
                  <EntityGlyph type={entry.type ?? 'document'} size="sm" />
                  <div className="row__main">
                    <div className="row__title">
                      <span>{opLabel(entry.op)}</span>{' '}
                      {entry.subject_kind === 'node' && entry.subject_id ? (
                        <Link to={`/n/${entry.subject_id}`}>{entry.title ?? 'a record'}</Link>
                      ) : (
                        <span>{entry.title ?? entry.subject_kind.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                    <div className="row__sub">
                      <Mono>{entry.at.slice(0, 10)}</Mono> · rev <Mono>{entry.rev}</Mono>
                      {entry.changed.length > 0 && (
                        <>
                          {' '}
                          ·{' '}
                          {entry.changed.slice(0, 4).map((field) => (
                            <Chip key={field} mono>
                              {fieldLabel(field)}
                            </Chip>
                          ))}
                          {entry.changed.length > 4 && (
                            <span> and {entry.changed.length - 4} more</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <ProvenanceChip source={entry.source} />
                </li>
              ))}
            </ul>
            {nextBefore && (
              <Button onClick={() => void loadMore()} disabled={more.isFetching}>
                {more.isFetching ? 'Loading...' : 'Load older changes'}
              </Button>
            )}
            {more.isError && (
              <ErrorState
                title="Couldn't load older changes"
                detail={(more.error as Error | null)?.message}
                onRetry={() => void loadMore()}
              />
            )}
          </>
        )}
      </Section>
    </div>
  );
}
