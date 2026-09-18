import { useId, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Banner,
  Button,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Field,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { fieldLabel } from '../lib/revision-fields.js';
import { todayIso, toLocalIsoDate } from '../lib/dates.js';

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

const OPERATIONS = [
  ['create', 'Created'],
  ['update', 'Edited'],
  ['append', 'Note appended'],
  ['archive', 'Archived'],
  ['delete', 'Deleted'],
  ['restore', 'Restored'],
  ['merge', 'Merged'],
];
const KINDS = [
  ['node', 'Records'],
  ['edge', 'Connections'],
  ['other', 'Other entries'],
];
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
});

/** Stored keys remain available as titles; labels are written for the reader. */
function readable(value: string): string {
  const field = fieldLabel(value);
  if (field === 'notes_md') return 'Notes';
  const words = field.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function subjectName(entry: LedgerEntry): string {
  if (entry.title?.trim()) return entry.title;
  if (entry.subject_kind === 'edge') return entry.type ? `${entry.type} connection` : 'Connection';
  if (entry.subject_kind === 'atom') return 'Résumé evidence';
  return entry.subject_kind === 'node' ? 'Untitled record' : readable(entry.subject_kind);
}
function timestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function opLabel(op: string): string {
  switch (op) {
    case 'create':
      return 'created';
    case 'update':
      return 'edited';
    case 'append':
      return 'note appended to';
    case 'archive':
      return 'archived';
    case 'delete':
      return 'deleted';
    case 'restore':
      return 'restored';
    case 'merge':
      return 'merged';
    default:
      return op.replace(/_/g, ' ');
  }
}

/**
 * Living Ledger: an inspectable revision register, not a stream of system keys.
 * The date/time margin anchors a readable action and subject. Local filters
 * explicitly cover loaded entries; the existing API has no server-side filters.
 */
export function Ledger() {
  const ids = useId();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const operation = params.get('op') ?? '';
  const kind = params.get('kind') ?? '';
  const loadingMore = useRef(false);
  const query = useInfiniteQuery({
    queryKey: ['ledger', 'feed'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<LedgerPage>(
        `/ledger?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (lastPage) => lastPage.next_before || undefined,
  });
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.entries) ?? []).filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }, [query.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (operation && entry.op !== operation) return false;
      const category =
        entry.subject_kind === 'node' || entry.subject_kind === 'edge'
          ? entry.subject_kind
          : 'other';
      if (kind && category !== kind) return false;
      return (
        !needle ||
        [
          subjectName(entry),
          entry.source,
          entry.type,
          entry.subject_kind,
          opLabel(entry.op),
          ...(entry.changed ?? []).map(readable),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(needle)
      );
    });
  }, [entries, search, operation, kind]);
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of filtered) {
    const date = timestamp(entry.at);
    const key = date ? toLocalIsoDate(date) : 'unknown';
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const filteredView = Boolean(search || operation || kind);
  function setFilter(key: string, value: string, replace = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace },
    );
  }
  function clearFilters() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const key of ['q', 'op', 'kind']) next.delete(key);
      return next;
    });
  }
  async function loadMore() {
    if (loadingMore.current || query.isFetching || !query.hasNextPage) return;
    loadingMore.current = true;
    try {
      await query.fetchNextPage({ cancelRefetch: false });
    } finally {
      loadingMore.current = false;
    }
  }
  const firstError = query.isError && !query.data;
  const backgroundError = query.isRefetchError && Boolean(query.data);
  const unknownOperation = operation && !OPERATIONS.some(([value]) => value === operation);
  const unknownKind = kind && !KINDS.some(([value]) => value === kind);

  return (
    <div className="page page--ledger">
      <PageHeader
        title="Ledger"
        subtitle="Changes to your records, newest first."
        actions={
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isRefetching && !query.isFetchingNextPage ? 'Refreshing…' : 'Refresh changes'}
          </Button>
        }
        help={
          <InfoPopover title="About this history" triggerLabel="About this history">
            <p>
              Entries come from stored revisions. Each names the action, the source, and the fields
              recorded by that write.
            </p>
            <p>
              Record names reflect their revision snapshot, even after a rename or deletion. Open a
              record to read its retained before-and-after history.
            </p>
            <p>
              Filters search only the entries loaded here. Load older changes to include more
              history. Times use your device’s timezone.
            </p>
          </InfoPopover>
        }
      />
      <div className="ledger-filters">
        <Field label="Search loaded changes" htmlFor={`${ids}-search`}>
          <Input
            id={`${ids}-search`}
            type="search"
            placeholder="Record, field, or source…"
            value={search}
            onChange={(event) => setFilter('q', event.target.value, true)}
          />
        </Field>
        <Field label="Action" htmlFor={`${ids}-operation`}>
          <select
            id={`${ids}-operation`}
            className="vt-inp"
            value={operation}
            onChange={(event) => setFilter('op', event.target.value)}
          >
            <option value="">All actions</option>
            {OPERATIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {unknownOperation && <option value={operation}>{readable(operation)}</option>}
          </select>
        </Field>
        <Field label="Entry type" htmlFor={`${ids}-kind`}>
          <select
            id={`${ids}-kind`}
            className="vt-inp"
            value={kind}
            onChange={(event) => setFilter('kind', event.target.value)}
          >
            <option value="">All entry types</option>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {unknownKind && <option value={kind}>{readable(kind)}</option>}
          </select>
        </Field>
      </div>
      <div className="ledger-filter-summary">
        <p role="status">
          {query.data
            ? `${filtered.length} shown · ${entries.length} loaded${query.hasNextPage ? ' · Older history available' : ''}`
            : 'Filters apply to loaded entries.'}
        </p>
        {filteredView && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
      <Section title="What changed">
        {firstError ? (
          <ErrorState
            title="Couldn't load the ledger"
            detail={query.error instanceof Error ? query.error.message : undefined}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.isLoading ? (
          <SkeletonRows rows={6} label="Loading the ledger" />
        ) : (
          <>
            {backgroundError && (
              <Banner tone="warning" title="Couldn't refresh the ledger">
                <p>Your loaded history is still available. Use Refresh changes to try again.</p>
              </Banner>
            )}
            {entries.length === 0 ? (
              <EmptyState
                glyph="journal"
                title="No changes yet"
                hint="Capture a record to start its history. Retained revisions will appear here."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                glyph="search"
                title="No matching loaded changes"
                detail={
                  query.hasNextPage
                    ? 'Clear the filters or load older changes to extend your search.'
                    : 'Try another record, action, or entry type.'
                }
                  action={<Button onClick={clearFilters}>Show all loaded changes</Button>}
              />
            ) : (
              <div className="ledger-days">
                {[...groups.entries()].map(([day, dayEntries]) => {
                  const date = timestamp(dayEntries[0].at);
                  return (
                    <section className="ledger-day" key={day} aria-labelledby={`${ids}-day-${day}`}>
                      <h3 id={`${ids}-day-${day}`}>
                        {day === todayIso()
                          ? 'Today'
                          : date
                            ? dayFormat.format(date)
                            : 'Date unavailable'}
                      </h3>
                      <ul className="ledger-list">
                        {dayEntries.map((entry) => (
                          <LedgerRow key={entry.id} entry={entry} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
            {query.isFetchNextPageError && (
              <ErrorState
                title="Couldn't load older changes"
                detail="Your loaded entries are unchanged. Try the same page again."
                onRetry={() => void loadMore()}
                retrying={query.isFetchingNextPage}
              />
            )}
            {query.hasNextPage && !query.isFetchNextPageError && (
              <Button
                className="ledger-load-more"
                onClick={() => void loadMore()}
                disabled={query.isFetching}
              >
                {query.isFetchingNextPage ? 'Loading older changes…' : 'Load older changes'}
              </Button>
            )}
            {!query.hasNextPage && entries.length > 0 && (
              <p className="ledger-end">No older changes available.</p>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const title = subjectName(entry);
  const date = timestamp(entry.at);
  const fields = entry.changed ?? [];
  const isNode = entry.subject_kind === 'node' && Boolean(entry.subject_id);
  return (
    <li className="ledger-entry" data-op={entry.op}>
      <div className="ledger-entry__time">
        {date ? (
          <time dateTime={entry.at} title={fullDateFormat.format(date)}>
            {clockFormat.format(date)}
          </time>
        ) : (
          <span>Time unavailable</span>
        )}
      </div>
      <EntityGlyph
        type={entry.type ?? 'document'}
        glyph={entry.subject_kind === 'edge' ? 'link' : undefined}
        size="sm"
      />
      <div className="ledger-entry__body">
        <div className="ledger-entry__title">
          <span className="ledger-entry__verb">{opLabel(entry.op)}</span>{' '}
          {isNode ? <Link to={`/n/${entry.subject_id}`}>{title}</Link> : <span>{title}</span>}
        </div>
        <div className="ledger-entry__meta">
          <span>
            {entry.subject_kind === 'edge'
              ? 'Connection'
              : entry.type
                ? readable(entry.type)
                : readable(entry.subject_kind)}
          </span>
          <Mono>Revision {entry.rev}</Mono>
          <span className="ledger-entry__source">
            Source: {entry.source ? entry.source.replace(/^import_/, '') : 'unknown'}
          </span>
        </div>
        {fields.length > 0 ? (
          <details className="ledger-entry__fields">
            <summary
              aria-label={`${fields.length} changed fields for ${title}, revision ${entry.rev}`}
            >
              {fields.length} changed {fields.length === 1 ? 'field' : 'fields'}
            </summary>
            <ul>
              {fields.map((field) => (
                <li key={field} title={field}>
                  {readable(field)}
                </li>
              ))}
            </ul>
            {isNode && <Link to={`/n/${entry.subject_id}`}>Open record and history</Link>}
          </details>
        ) : (
          <p className="ledger-entry__no-diff">No field-level changes recorded.</p>
        )}
      </div>
    </li>
  );
}
