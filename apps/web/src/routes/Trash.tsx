import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  EntityGlyph,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
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
  const [confirmPurge, setConfirmPurge] = useState(false);
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
      setConfirmPurge(false);
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

  const nodes = useMemo(
    () =>
      [...(trash.data?.nodes ?? [])].sort(
        (a, b) => Date.parse(a.deleted_at) - Date.parse(b.deleted_at),
      ),
    [trash.data],
  );
  const expired = purgePreview.data?.nodes ?? 0;
  const soonCount = nodes.filter((n) => purgeUrgency(daysUntilPurge(n.deleted_at)) !== 'ok').length;

  return (
    <div className="page data-workspace-page data-trash-page">
      <PageHeader
        title="Trash"
        subtitle="Soft-deleted records stay recoverable for 30 days, then purge."
        help={
          <InfoPopover title="Retention">
            <p>
              Delete moves a record here with its connections preserved. Restore brings it back.
              After {TRASH_RETENTION_DAYS} days the nightly job hard-deletes it, or you can purge
              the expired window early when the button appears.
            </p>
          </InfoPopover>
        }
        actions={
          expired > 0 ? (
            <Button
              variant="danger"
              disabled={purge.isPending}
              onClick={() => setConfirmPurge(true)}
              aria-label={`Purge ${expired} expired record${expired === 1 ? '' : 's'} now`}
            >
              {purge.isPending ? 'Purging...' : `Purge ${expired} expired now`}
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

      <nav className="data-process" aria-label="Deletion and recovery workflow">
        <ol>
          <li
            data-state={nodes.length > 0 ? 'done' : 'current'}
            aria-current={nodes.length === 0 ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Soft-delete</strong>
              <small>Hide records, preserve connections</small>
            </span>
          </li>
          <li
            data-state={expired > 0 ? 'done' : nodes.length > 0 ? 'current' : 'upcoming'}
            aria-current={nodes.length > 0 && expired === 0 ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Recovery window</strong>
              <small>{TRASH_RETENTION_DAYS} days to restore</small>
            </span>
          </li>
          <li
            data-state={expired > 0 ? 'current' : 'upcoming'}
            aria-current={expired > 0 ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Permanent purge</strong>
              <small>Expired records only</small>
            </span>
          </li>
        </ol>
      </nav>

      <div className="data-operation-trace">
        {purge.isPending ? (
          <StatusTrace tone="live" label="Purging expired records" detail="This cannot be undone" />
        ) : purge.isError ? (
          <StatusTrace
            tone="danger"
            label="Expired records were not purged"
            detail={(purge.error as Error).message}
          />
        ) : purge.isSuccess ? (
          <StatusTrace
            tone="success"
            label={purge.data.nodes > 0 ? 'Expired records purged' : 'Retention scan is clear'}
            detail={
              purge.data.nodes > 0
                ? `${purge.data.nodes} removed permanently`
                : 'Nothing was eligible'
            }
          />
        ) : restore.isPending ? (
          <StatusTrace
            tone="live"
            label="Restoring record"
            detail="Returning it to the active graph"
          />
        ) : restore.isError ? (
          <StatusTrace
            tone="danger"
            label="Record was not restored"
            detail={(restore.error as Error).message}
          />
        ) : restore.isSuccess ? (
          <StatusTrace
            tone="success"
            label="Record restored"
            detail="Its preserved connections are active again"
          />
        ) : purgePreview.isLoading ? (
          <StatusTrace
            tone="live"
            label="Checking the retention window"
            detail="No records are being changed"
          />
        ) : expired > 0 ? (
          <StatusTrace
            tone="danger"
            label={`${expired} expired ${expired === 1 ? 'record is' : 'records are'} eligible for purge`}
            detail="Review before removing permanently"
          />
        ) : soonCount > 0 ? (
          <StatusTrace
            tone="warning"
            label={`${soonCount} ${soonCount === 1 ? 'record enters' : 'records enter'} the final week`}
            detail="Restore before the countdown reaches zero"
          />
        ) : trash.isSuccess && nodes.length > 0 ? (
          <StatusTrace
            tone="neutral"
            label="Every deleted record is recoverable"
            detail="Nothing is due for purge"
          />
        ) : trash.isSuccess ? (
          <StatusTrace tone="success" label="Trash is clear" detail="No deleted records" />
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title={`Purge ${expired} expired ${expired === 1 ? 'record' : 'records'}?`}
        body={
          <p>
            This permanently removes the expired records, their retained revisions, and eligible
            relationship data. It cannot be undone.
          </p>
        }
        confirmLabel={purge.isPending ? 'Purging...' : 'Purge permanently'}
        destructive
        busy={purge.isPending}
        onConfirm={() => purge.mutate()}
      />

      {purgePreview.isError && (
        <ErrorState
          title="Couldn't load the purge preview"
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
            title="Couldn't load trash"
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
          <ul className="trash-list data-trash-ledger">
            {nodes.map((n) => {
              const left = daysUntilPurge(n.deleted_at);
              const urgency = purgeUrgency(left);
              const restoring = restore.isPending && restore.variables === n.id;
              return (
                <li key={n.id} className="row data-trash-row" data-urgency={urgency}>
                  <EntityGlyph type={n.type} size="sm" />
                  <div className="row__main">
                    <div className="row__title">{n.title}</div>
                    <div className="row__sub">
                      deleted <Mono>{n.deleted_at.slice(0, 10)}</Mono> ·{' '}
                      <Mono className="data-trash-row__countdown">
                        {urgency === 'due' ? 'purge due' : `purges in ${left}d`}
                      </Mono>
                    </div>
                    <meter
                      className="data-trash-row__meter"
                      min={0}
                      max={TRASH_RETENTION_DAYS}
                      value={left}
                      aria-label={`${left} days remaining in the recovery window for ${n.title}`}
                    >
                      {left} of {TRASH_RETENTION_DAYS} days remaining
                    </meter>
                  </div>
                  <Button
                    size="sm"
                    glyph="merge"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(n.id)}
                    aria-label={`Restore ${n.title}`}
                  >
                    {restoring ? 'Restoring...' : 'Restore'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
