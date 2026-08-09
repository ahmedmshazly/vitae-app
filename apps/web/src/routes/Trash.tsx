import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

export interface TrashNode {
  id: string;
  type: string;
  title: string;
  deleted_at: string;
}

interface PurgePreview {
  retentionDays: number;
  cutoff: string;
  nodes: number;
  edges: number;
  revisions: number;
  dependents: number;
}

export const TRASH_RETENTION_DAYS = 30;

/**
 * Whole days remaining before a soft-deleted record is purged. Zero means it
 * is already in the purge window, the nightly job (or "Purge expired now")
 * will remove it.
 */
export function daysUntilPurge(deletedAt: string, nowMs = Date.now()): number {
  const elapsed = (nowMs - Date.parse(deletedAt)) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

export type PurgeUrgency = 'ok' | 'soon' | 'due';

/** Design: amber under 7 days; due when the countdown hits zero. */
export function purgeUrgency(daysLeft: number): PurgeUrgency {
  if (daysLeft <= 0) return 'due';
  if (daysLeft < 7) return 'soon';
  return 'ok';
}

/**
 * Trash & recovery (SRS P20, FR-ORG-002). Restore revives node + hidden edges.
 *
 * FR-006: the "then purged" half of the promise is now real, the API purges
 * expired trash daily (and on demand here). This page reports what the next
 * purge will remove rather than describing a policy nothing enforced.
 */
export function Trash() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const trash = useQuery({
    queryKey: ['trash'],
    queryFn: () => api.get<{ nodes: TrashNode[] }>('/nodes?includeDeleted=true&limit=500'),
    select: (d) => ({ nodes: d.nodes.filter((n) => Boolean(n.deleted_at)) }),
  });

  const purgePreview = useQuery({
    queryKey: ['retention-preview'],
    queryFn: () => api.get<PurgePreview>('/retention/preview'),
  });

  const purge = useMutation({
    mutationFn: () => api.post<PurgePreview>('/retention/purge'),
    onSuccess: (res) => {
      void qc.invalidateQueries();
      flash(
        res.nodes || res.edges
          ? `Purged ${res.nodes} record${res.nodes === 1 ? '' : 's'} past the 30-day window`
          : 'Nothing is past the retention window yet',
      );
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/nodes/${id}/restore`),
    onSuccess: (_result, id) => {
      const title = trash.data?.nodes.find((n) => n.id === id)?.title ?? 'Record';
      void qc.invalidateQueries({ queryKey: ['trash'] });
      void qc.invalidateQueries({ queryKey: ['retention-preview'] });
      flash(`Restored ${title}`);
    },
  });

  const nodes = trash.data?.nodes ?? [];
  const expired = purgePreview.data?.nodes ?? 0;
  const soonCount = nodes.filter((n) => purgeUrgency(daysUntilPurge(n.deleted_at)) !== 'ok').length;

  return (
    <div className="page">
      <PageHeader
        title="Trash"
        subtitle="Soft-deleted records stay recoverable for 30 days, then purge."
        help={
          <InfoPopover title="Retention">
            <p>
              Delete moves a record here with its connections preserved. Restore brings it back. After{' '}
              {TRASH_RETENTION_DAYS} days the nightly job hard-deletes it, or you can purge the expired window
              early when the button appears.
            </p>
          </InfoPopover>
        }
        actions={
          expired > 0 ? (
            <Button
              variant="danger"
              disabled={purge.isPending}
              onClick={() => purge.mutate()}
              aria-label={`Purge ${expired} expired record${expired === 1 ? '' : 's'} now`}
            >
              {purge.isPending ? 'Purging…' : `Purge ${expired} expired now`}
            </Button>
          ) : undefined
        }
      />
      <RegisterRule
        ticks={
          nodes.length > 0
            ? nodes.slice(0, 12).map((n, i, all) => ({
                at: all.length === 1 ? 0.5 : i / (all.length - 1),
                label: `${n.title} · ${daysUntilPurge(n.deleted_at)}d left`,
              }))
            : undefined
        }
        label={nodes.length > 0 ? 'Deleted records by purge countdown' : undefined}
      />

      {purgePreview.isError && (
        <ErrorState
          title="Couldn’t load the purge preview"
          detail={(purgePreview.error as Error | null)?.message}
          onRetry={() => void purgePreview.refetch()}
        />
      )}

      <Section
        title="Deleted records"
        meta={trash.isSuccess ? nodes.length : undefined}
        actions={
          soonCount > 0 ? (
            <Chip tone="warning" mono>
              {soonCount} nearing purge
            </Chip>
          ) : undefined
        }
      >
        {trash.isError ? (
          <ErrorState
            title="Couldn’t load trash"
            detail={(trash.error as Error | null)?.message}
            onRetry={() => void trash.refetch()}
          />
        ) : trash.isLoading ? (
          <div role="status" aria-label="Loading trash">
            <SkeletonRows rows={5} />
          </div>
        ) : nodes.length === 0 ? (
          <EmptyState
            glyph="trash"
            title="Trash is empty"
            hint="Deleted records land here and stay recoverable for 30 days before purging."
          />
        ) : (
          <div className="trash-list">
            {nodes.map((n) => {
              const left = daysUntilPurge(n.deleted_at);
              const urgency = purgeUrgency(left);
              const restoring = restore.isPending && restore.variables === n.id;
              return (
                <div key={n.id} className="row" style={{ padding: '8px 16px' }}>
                  <EntityGlyph type={n.type} size="sm" />
                  <div className="row__main">
                    <div className="row__title">{n.title}</div>
                    <div className="row__sub">
                      deleted <Mono>{n.deleted_at.slice(0, 10)}</Mono> ·{' '}
                      <Mono
                        style={{
                          color:
                            urgency === 'due'
                              ? 'var(--ae-danger)'
                              : urgency === 'soon'
                                ? 'var(--ae-warning)'
                                : undefined,
                        }}
                      >
                        {urgency === 'due' ? 'purge due' : `purges in ${left}d`}
                      </Mono>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    glyph="merge"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(n.id)}
                    aria-label={`Restore ${n.title}`}
                  >
                    {restoring ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
