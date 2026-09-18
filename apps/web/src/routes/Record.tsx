/**
 * Record detail, the generic view for every node type that has no CRM hub of
 * its own (people and organizations keep theirs).
 *
 * It answers four questions in order: what is this, what do I know about it,
 * what is it connected to, and how did it get here. The register rule under
 * the header carries one tick per revision, which is the brand book's own
 * worked example of a rule that encodes something true.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { isNodeType } from '@vitae/core';
import { api } from '../lib/api.js';
import { rememberViewed } from '../lib/last-viewed.js';
import { fieldLabel } from '../lib/revision-fields.js';
import { AddConnection } from '../features/forms/AddConnection.js';
import { ConnectionRow } from '../features/forms/ConnectionRow.js';
import { NodeFormDialog } from '../features/forms/NodeFormDialog.js';
import { BulkUnlinkBar, BulkUnlinkConfirm, useBulkEdgeDelete } from '../features/BulkEdgeDelete.js';
import { SelectAllRow, useVisibleSelection } from '../features/BulkNodeDelete.js';
import { useToast } from '../features/Toast.js';
import { EntityEvidence } from '../features/EntityEvidence.js';

interface NodeFull {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  props: Record<string, unknown>;
  notes_md: string;
  source: string;
  source_ref?: string;
  confidence: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Sensitive records must not disclose their contents merely by opening a URL. */
  sensitivity?: 'normal' | 'sensitive';
}
interface Edge {
  id: string;
  type: string;
  src: string;
  dst: string;
  props: Record<string, unknown>;
}
interface RecordResp {
  node: NodeFull;
  edges: Edge[];
  neighbors: Record<string, { id: string; type: string; title: string }>;
}
interface Revision {
  op: string;
  at: string;
  rev: number;
  source?: string;
  /** Field-level changes the write recorded, `{field: {from, to}}` (FR-PROV-003). */
  diff?: Record<string, { from: unknown; to: unknown }>;
}

/** More ticks than this stops reading as a scale and starts reading as noise. */
const MAX_TICKS = 24;

/** `tech_stack` → `Tech stack`. Property keys are storage names, not labels. */
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Props worth showing: not null, not blank, not an empty list. */
export function shownProps(props: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(props).filter(
    ([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
  );
}

/** Health and account records remain private even when legacy imports lack a sensitivity bit. */
export function isSensitiveRecord(node: Pick<NodeFull, 'type' | 'sensitivity'>): boolean {
  return node.sensitivity === 'sensitive' || node.type === 'health_log' || node.type === 'account';
}

/** Imported data is not allowed to turn a credential-shaped value into dossier copy. */
export function isUnsafePropertyKey(key: string): boolean {
  return /(?:^|[_-])(password|passphrase|secret|token|credential|api[_-]?key|access[_-]?key|private[_-]?key)(?:$|[_-])/i.test(
    key,
  );
}

/**
 * One tick per revision, oldest to newest, active = the one being viewed ,
 * which for this page is always the latest. This is the brand book's worked
 * example for the register rule, so it gets the canonical treatment.
 */
export function revisionTicks(revisions: Revision[]): {
  ticks: Array<{ at: number; label: string }>;
  index: number;
  /** True when older revisions exist beyond the ticks drawn. */
  truncated: boolean;
} {
  const ordered = [...revisions].sort((a, b) => a.rev - b.rev).slice(-MAX_TICKS);
  if (ordered.length === 0) return { ticks: [], index: -1, truncated: false };
  return {
    ticks: ordered.map((r, i) => ({
      at: (i + 0.5) / ordered.length,
      label: `revision ${r.rev}: ${r.op}`,
    })),
    index: ordered.length - 1,
    // A rule this wide cannot draw two hundred ticks legibly, so it shows the
    // most recent MAX_TICKS. It has to say so: "one tick per revision" stops
    // being true the moment a record crosses that line, and silently drawing
    // 24 ticks for 29 revisions is the rule stating something untrue.
    truncated: revisions.length > ordered.length,
  };
}

export function Record() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [sensitiveDetailsVisible, setSensitiveDetailsVisible] = useState(false);
  useEffect(() => {
    if (id) {
      rememberViewed(id);
      // A route change must not carry the prior record's reveal choice into a
      // different private record.
      setSensitiveDetailsVisible(false);
    }
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addingConn, setAddingConn] = useState(false);
  const bulk = useBulkEdgeDelete();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['node', id],
    queryFn: () => api.get<RecordResp>(`/nodes/${id}`),
  });
  const revs = useQuery({
    queryKey: ['node', id, 'revisions'],
    queryFn: () => api.get<{ revisions: Revision[] }>(`/nodes/${id}/revisions`),
  });

  const edges = useMemo(() => data?.edges ?? [], [data?.edges]);
  const edgeIds = useMemo(() => edges.map((e) => e.id), [edges]);
  const { allVisibleSelected } = useVisibleSelection(edgeIds, bulk.selected);
  const revisions = useMemo(() => revs.data?.revisions ?? [], [revs.data]);
  const register = useMemo(() => revisionTicks(revisions), [revisions]);

  if (isError) {
    return (
      <div className="page">
        <PageHeader title="Record" />
        <RegisterRule />
        <ErrorState
          title="Couldn't load this record"
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title="Record" subtitle="Loading..." />
        <RegisterRule />
        <SkeletonRows rows={5} />
      </div>
    );
  }

  const { node, neighbors } = data;
  const props = shownProps(node.props);
  const sensitive = isSensitiveRecord(node);
  const showDetails = !sensitive || sensitiveDetailsVisible;

  async function del() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del(`/nodes/${id}`);
      await qc.invalidateQueries();
      navigate('/data/trash');
    } catch (err) {
      // Keep the destructive confirmation in place: closing it on a failed
      // request makes retry feel like it succeeded, while the record is still
      // present. The same action becomes the explicit recovery path.
      setDeleteError(err instanceof Error ? err.message : "Couldn't move this record to Trash.");
    } finally {
      setDeleting(false);
    }
  }

  async function togglePin() {
    const prev = qc.getQueryData<RecordResp>(['node', id]);
    const next = !prev?.node.pinned;
    if (prev)
      qc.setQueryData<RecordResp>(['node', id], { ...prev, node: { ...prev.node, pinned: next } });
    try {
      await api.patch(`/nodes/${id}`, { pinned: next });
      // The control says Pin; the confirmation says Pinned.
      flash(next ? 'Pinned' : 'Unpinned');
    } catch (err) {
      if (prev) qc.setQueryData(['node', id], prev);
      flash(err instanceof Error ? err.message : "Couldn't change the pin.", { variant: 'error' });
    } finally {
      await qc.invalidateQueries({ queryKey: ['node', id] });
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={showDetails ? node.title : `Sensitive ${node.type.replace(/_/g, ' ')} record`}
        subtitle={
          <>
            <span className="capitalize">{node.type.replace(/_/g, ' ')}</span>
            {showDetails && node.subtitle && ` · ${node.subtitle}`}
            {node.deleted_at && ' · in trash'}
          </>
        }
        actions={
          <>
            {sensitive && (
              <Button
                size="sm"
                aria-expanded={sensitiveDetailsVisible}
                onClick={() => setSensitiveDetailsVisible((visible) => !visible)}
              >
                {sensitiveDetailsVisible ? 'Hide sensitive details' : 'Reveal sensitive details'}
              </Button>
            )}
            <ProvenanceChip source={node.source} confidence={node.confidence} />
            {node.source_ref && (
              // The reference completes the provenance story (FR-PROV-001):
              // which batch, which upload, which sync this fact arrived in.
              <Mono className="text-xs text-faint" title="Source reference">
                {node.source_ref}
              </Mono>
            )}
            {!node.deleted_at && (
              <>
                {isNodeType(node.type) && (
                  <Button size="sm" glyph="edit" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  glyph="pin"
                  aria-pressed={node.pinned}
                  onClick={() => void togglePin()}
                >
                  {node.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  glyph="trash"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />
      {/* The book's own example: a tick per revision, active = the one shown. */}
      <RegisterRule
        ticks={register.ticks}
        activeIndex={register.index >= 0 ? register.index : undefined}
        label={
          register.ticks.length
            ? register.truncated
              ? `Revisions of this record, the most recent ${register.ticks.length} of ${revisions.length}`
              : 'Revisions of this record'
            : undefined
        }
      />

      {sensitive && !showDetails && (
        <p className="mb-6 max-w-2xl border-l-2 border-hairline pl-3 text-sm text-muted">
          <strong className="text-ink">Sensitive details are hidden on entry.</strong> Reveal this
          record only when it is safe to view its properties, notes, history, and evidence.
        </p>
      )}

      {editing && isNodeType(node.type) && (
        <NodeFormDialog open onOpenChange={setEditing} type={node.type} nodeId={node.id} />
      )}
      <AddConnection
        open={addingConn}
        onOpenChange={setAddingConn}
        nodeId={node.id}
        nodeType={node.type}
        nodeTitle={node.title}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setDeleteError(null);
        }}
        title={`Move '${node.title}' to trash?`}
        body={
          <>
            <p>It stays recoverable from Trash for 30 days; connections are preserved.</p>
            {deleteError && (
              <p role="alert" className="text-sm text-danger">
                <strong className="font-semibold">Couldn’t move this record to Trash.</strong>{' '}
                {deleteError}
              </p>
            )}
          </>
        }
        confirmLabel={deleting ? 'Moving...' : 'Move to trash'}
        destructive
        onConfirm={() => {
          void del();
        }}
        busy={deleting}
        initialFocus="cancel"
      />
      <BulkUnlinkConfirm
        open={bulk.confirmUnlink}
        onOpenChange={bulk.setConfirmUnlink}
        selectedCount={bulk.selectedCount}
        busy={bulk.busy}
        onConfirm={() => {
          void bulk.unlinkSelected();
        }}
      />

      <div className="grid gap-x-8 lg:grid-cols-2">
        <div>
          <Section title="Properties" meta={props.length || undefined}>
            {!showDetails ? (
              <p className="text-sm text-muted">
                Properties are hidden until you reveal this record.
              </p>
            ) : props.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing recorded yet. Use Edit to fill in what this {node.type.replace(/_/g, ' ')}{' '}
                is.
              </p>
            ) : (
              <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2">
                {props.map(([k, v]) => (
                  <div key={k} className="col-span-2 grid grid-cols-subgrid items-baseline">
                    {/* Storage keys are not labels: `tech_stack` was shown as-is. */}
                    <dt className="text-sm text-muted">{humanizeKey(k)}</dt>
                    <dd className="m-0 min-w-0">
                      <Mono className="block break-words text-sm text-ink">{formatVal(v, k)}</Mono>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section title="Notes">
            {!showDetails ? (
              <p className="text-sm text-muted">Notes are hidden until you reveal this record.</p>
            ) : node.notes_md ? (
              <p className="whitespace-pre-wrap text-ink-soft">{node.notes_md}</p>
            ) : (
              <p className="text-sm text-muted">
                No notes. Use Edit to add context you want to keep.
              </p>
            )}
          </Section>
        </div>

        <div>
          <Section
            title="Connections"
            meta={edges.length}
            actions={
              !node.deleted_at && (
                <>
                  <BulkUnlinkBar
                    selectedCount={bulk.selectedCount}
                    busy={bulk.busy}
                    onClear={bulk.clear}
                    onUnlink={() => bulk.setConfirmUnlink(true)}
                  />
                  <Button size="sm" glyph="plus" onClick={() => setAddingConn(true)}>
                    Add connection
                  </Button>
                </>
              )
            }
          >
            {edges.length === 0 ? (
              <EmptyState
                glyph="link"
                title="Nothing connected yet"
                hint="Connections are what make this a graph rather than a list."
              />
            ) : (
              <>
                {!node.deleted_at && (
                  <SelectAllRow
                    allSelected={allVisibleSelected}
                    disabled={bulk.busy}
                    onToggle={() => bulk.toggleAll(edgeIds, allVisibleSelected)}
                  />
                )}
                {edges.map((e) => (
                  <ConnectionRow
                    key={e.id}
                    edge={e}
                    nodeId={node.id}
                    neighbors={neighbors}
                    selected={bulk.isSelected(e.id)}
                    busy={bulk.busy}
                    onToggleSelect={node.deleted_at ? undefined : () => bulk.toggleOne(e.id)}
                  />
                ))}
              </>
            )}
          </Section>

          <Section title="History" meta={revisions.length || undefined}>
            {!showDetails ? (
              <p className="text-sm text-muted">History is hidden until you reveal this record.</p>
            ) : revs.isError ? (
              <p role="alert" className="text-sm text-danger">
                <strong className="font-semibold">Couldn't load the history.</strong> The record
                itself is fine.
              </p>
            ) : revs.isLoading ? (
              <SkeletonRows rows={2} />
            ) : revisions.length === 0 ? (
              // A record always has a create revision, so an empty list means
              // the history was pruned rather than "nothing has happened".
              <p className="text-sm text-muted">No revisions retained for this record.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {revisions.map((r) => {
                  const fields = Object.entries(r.diff ?? {});
                  const row = (
                    <>
                      <Chip mono>{r.op}</Chip>
                      {r.source && <span className="text-sm text-muted">{r.source}</span>}
                      {fields.length > 0 && (
                        <span className="text-xs text-faint">
                          {fields.length} field{fields.length === 1 ? '' : 's'}
                        </span>
                      )}
                      <Mono className="ml-auto text-xs text-faint">
                        {r.at.slice(0, 19).replace('T', ' ')}
                      </Mono>
                    </>
                  );
                  // History opens into what actually changed (FR-PROV-003):
                  // the stored revision carries the field diff, so a row with
                  // one is a disclosure, and a row without one stays a row.
                  return (
                    <li key={r.rev} className="border-b border-hairline last:border-b-0">
                      {fields.length > 0 ? (
                        <details className="record-history__entry">
                          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-3 py-2">
                            {row}
                          </summary>
                          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-2 pl-1 text-sm">
                            {fields.map(([field, change]) => (
                              <Fragment key={field}>
                                <dt className="text-muted">{humanizeKey(fieldLabel(field))}</dt>
                                <dd className="m-0">
                                  {change.from != null && change.from !== '' && (
                                    <>
                                      <s className="text-faint">
                                        {formatVal(change.from, field)}
                                      </s>{' '}
                                    </>
                                  )}
                                  <span>{formatVal(change.to, field)}</span>
                                </dd>
                              </Fragment>
                            ))}
                          </dl>
                        </details>
                      ) : (
                        <div className="flex min-h-9 items-center gap-3 py-2">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          {showDetails ? (
            <EntityEvidence entityId={node.id} />
          ) : (
            <Section title="Evidence">
              <p className="text-sm text-muted">Evidence is hidden until you reveal this record.</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatVal(v: unknown, propertyKey?: string): string {
  if (propertyKey && isUnsafePropertyKey(propertyKey)) {
    return 'Redacted: credentials are never displayed.';
  }
  // A record property is often structured (money, a list of contact methods,
  // or a row-based form field). JSON is storage syntax, not dossier copy: it
  // makes useful values hard to scan and exposes a misleading implementation
  // detail. Keep every key visible and recurse so nested credential-shaped
  // imports remain redacted.
  if (Array.isArray(v)) return v.map((x) => formatVal(x)).join(' · ');
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return 'Not recorded';
    return entries
      .map(([key, value]) => `${humanizeKey(key)}: ${formatVal(value, key)}`)
      .join(' · ');
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
