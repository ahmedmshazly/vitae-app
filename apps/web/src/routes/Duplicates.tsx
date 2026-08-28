import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Glyph,
  InfoPopover,
  Modal,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import type { MatchSignal, NodeType } from '@vitae/core';
import { api, type ApiError } from '../lib/api.js';
import { useToast } from '../features/Toast.js';
import { entityHref } from '../lib/entity-href.js';

export interface MemberSummary {
  id: string;
  type: NodeType;
  title: string;
  meta: string;
  rev: number;
}

export interface DupPair {
  a: MemberSummary;
  b: MemberSummary;
  weight: number;
  verdict: 'possible' | 'probable';
  evidence: string[];
  signals: MatchSignal[];
  contradictions: MatchSignal[];
  fingerprint: string;
}

export interface DupCluster {
  id: string;
  type: NodeType;
  verdict: 'possible' | 'probable';
  score: number;
  members: MemberSummary[];
  pairs: DupPair[];
}

interface MergeSummary {
  id: string;
  keep_id: string;
  drop_id: string;
  merged_at: string;
  undone_at: string | null;
  keep_title: string;
  drop_title: string;
}

interface DedupAlias {
  id: string;
  type: NodeType;
  alias: string;
  canonical_id: string;
  canonical_title: string;
}

interface NodeFull {
  id: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  notes_md: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  source: string;
  confidence: number;
  rev: number;
  created_at: string;
  updated_at: string;
  props: Record<string, unknown>;
}

interface NodeResp {
  node: NodeFull;
  edges: Array<{
    id: string;
    type: string;
    src: string;
    dst: string;
    props: Record<string, unknown>;
  }>;
  neighbors: Record<string, { id: string; type: NodeType; title: string }>;
}

const STEPS = ['Identity', 'Survivor', 'Fields', 'Relations', 'Confirm'] as const;

export function typeLabel(type: NodeType): string {
  return type.replace(/_/g, ' ');
}

/**
 * Short label for a cluster used in headings and action names. Two titles is
 * the common case; longer clusters keep the first two and a count so every
 * "Audit" / "Not the same" button stays distinguishable.
 */
export function clusterHeading(cluster: Pick<DupCluster, 'members' | 'type'>): string {
  const names = cluster.members.map((member) => member.title.trim()).filter(Boolean);
  if (names.length === 0) return typeLabel(cluster.type);
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} · ${names[1]}`;
  return `${names[0]} · ${names[1]} +${names.length - 2}`;
}

/** Resolve candidate duplicates with evidence; merge without fear. */
export function Duplicates() {
  const [audit, setAudit] = useState<DupCluster | null>(null);
  const qc = useQueryClient();
  const { flash } = useToast();

  const result = useQuery({
    queryKey: ['duplicates'],
    queryFn: () => api.get<{ pairs: DupPair[]; clusters: DupCluster[] }>('/duplicates'),
  });
  const merges = useQuery({
    queryKey: ['merges'],
    queryFn: () => api.get<{ merges: MergeSummary[] }>('/duplicates/merges'),
  });
  const aliases = useQuery({
    queryKey: ['dedup-aliases'],
    queryFn: () => api.get<{ aliases: DedupAlias[] }>('/duplicates/aliases'),
  });

  const dismiss = useMutation({
    mutationFn: async (cluster: DupCluster) => {
      await Promise.all(
        cluster.pairs.map((pair) =>
          api.post('/duplicates/dismiss', { aId: pair.a.id, bId: pair.b.id }),
        ),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['duplicates'] });
      flash('Decision remembered until one of these records changes');
    },
  });

  const undo = useMutation({
    mutationFn: (id: string) => api.post(`/duplicates/merges/${id}/undo`),
    onSuccess: () => {
      void qc.invalidateQueries();
      flash('Merge undone. Both records restored.');
    },
    onError: (err) => {
      const error = err as ApiError;
      flash(
        error.code === 'MERGE_CONFLICT'
          ? "Can't undo safely because an affected record changed after the merge."
          : `Undo failed: ${error.message}`,
      );
    },
  });
  const rescan = useMutation({
    mutationFn: () => api.post('/duplicates/rescan'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['duplicates'] });
      flash('Fresh identity scan complete');
    },
  });
  const removeAlias = useMutation({
    mutationFn: (id: string) => api.del(`/duplicates/aliases/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dedup-aliases'] });
      flash('Learned alias removed');
    },
  });

  const clusters = result.data?.clusters ?? [];
  // Only the tick the reader is standing on takes the accent. This used to be
  // pinned to 0, so auditing the seventh cluster still marked the first.
  const auditIndex = audit ? clusters.slice(0, 12).findIndex((c) => c.id === audit.id) : -1;
  const probable = clusters.filter((cluster) => cluster.verdict === 'probable').length;
  const typeCount = new Set(clusters.map((cluster) => cluster.type)).size;
  const mergeCount = merges.data?.merges.filter((merge) => !merge.undone_at).length ?? 0;

  return (
    <div className="page dedup-page data-workspace-page data-identity-page">
      <PageHeader
        title="Identity audit"
        subtitle="Explainable matching across every record type. Vitae suggests; you decide."
        help={
          <InfoPopover title="How matching works">
            <p>
              Candidates are scored with evidence you can read (shared emails, names, orgs), not an
              opaque similarity percentage alone. Probable pairs default toward caution.
            </p>
            <p>
              Merges tombstone the dropped record and rewire relationships. Each merge can be undone
              safely for 30 days.
            </p>
          </InfoPopover>
        }
        actions={
          <div className="hstack">
            <Button
              size="sm"
              disabled={rescan.isPending || result.isLoading}
              onClick={() => rescan.mutate()}
            >
              {rescan.isPending ? 'Scanning...' : 'Rescan'}
            </Button>
            <Link to="/data/imports" className="vt-btn vt-btn--sm">
              Back to imports
            </Link>
          </div>
        }
      />
      <RegisterRule
        ticks={
          clusters.length > 0
            ? clusters.slice(0, 12).map((cluster, i, all) => ({
                at: all.length === 1 ? 0.5 : i / (all.length - 1),
                label: `${clusterHeading(cluster)} · ${cluster.verdict}`,
              }))
            : undefined
        }
        activeIndex={auditIndex >= 0 ? auditIndex : undefined}
        label={clusters.length > 0 ? 'Candidate clusters in the queue' : undefined}
      />

      <nav className="data-process" aria-label="Identity audit workflow">
        <ol>
          <li
            data-state={
              result.isLoading || rescan.isPending
                ? 'current'
                : result.isSuccess
                  ? 'done'
                  : 'upcoming'
            }
            aria-current={result.isLoading || rescan.isPending ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Scan records</strong>
              <small>Build explainable candidates</small>
            </span>
          </li>
          <li
            data-state={audit ? 'done' : clusters.length > 0 ? 'current' : 'upcoming'}
            aria-current={!audit && clusters.length > 0 ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Compare identity</strong>
              <small>Read matches and contradictions</small>
            </span>
          </li>
          <li data-state={audit ? 'current' : 'upcoming'} aria-current={audit ? 'step' : undefined}>
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Consolidate</strong>
              <small>Choose survivor and fields</small>
            </span>
          </li>
          <li data-state={mergeCount > 0 ? 'done' : 'upcoming'}>
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Recover if needed</strong>
              <small>Conflict-safe undo window</small>
            </span>
          </li>
        </ol>
      </nav>

      <div className="data-operation-trace">
        {rescan.isPending ? (
          <StatusTrace
            tone="live"
            label="Scanning current records"
            detail="Existing decisions stay intact"
          />
        ) : rescan.isError ? (
          <StatusTrace
            tone="danger"
            label="Identity scan stopped"
            detail={(rescan.error as Error).message}
          />
        ) : dismiss.isPending ? (
          <StatusTrace
            tone="live"
            label="Remembering identity decision"
            detail="Updating the candidate queue"
          />
        ) : dismiss.isError ? (
          <StatusTrace
            tone="danger"
            label="Identity decision was not saved"
            detail={(dismiss.error as Error).message}
          />
        ) : undo.isPending ? (
          <StatusTrace
            tone="live"
            label="Restoring merged records"
            detail="Checking for later conflicts"
          />
        ) : undo.isError ? (
          <StatusTrace
            tone="danger"
            label="Merge could not be undone"
            detail={(undo.error as Error).message}
          />
        ) : removeAlias.isPending ? (
          <StatusTrace
            tone="live"
            label="Removing learned alias"
            detail="Canonical record stays unchanged"
          />
        ) : removeAlias.isError ? (
          <StatusTrace
            tone="danger"
            label="Learned alias was not removed"
            detail={(removeAlias.error as Error).message}
          />
        ) : result.isSuccess && clusters.length === 0 ? (
          <StatusTrace
            tone="success"
            label="Identity scan is clear"
            detail="No candidate clusters"
          />
        ) : result.isSuccess ? (
          <StatusTrace
            tone={probable > 0 ? 'warning' : 'neutral'}
            label={`${clusters.length} ${clusters.length === 1 ? 'cluster awaits' : 'clusters await'} review`}
            detail={probable > 0 ? `${probable} marked probable` : 'All candidates marked possible'}
          />
        ) : null}
      </div>

      {/* This gate used to wrap all three Sections, so one failed scan also
          erased merge history and learned aliases, taking the Undo for an
          already-merged pair with it. It now covers only what it loaded. */}
      <Section title="Queue" meta={result.isSuccess ? clusters.length : undefined}>
        {result.isError ? (
          <ErrorState
            title="Couldn't load the identity queue"
            detail={(result.error as Error | null)?.message}
            onRetry={() => void result.refetch()}
            retrying={result.isFetching}
          />
        ) : result.isLoading ? (
          <SkeletonRows rows={6} label="Loading identity queue" />
        ) : (
          <>
            <div className="dedup-summary" role="group" aria-label="Queue summary">
              <strong>
                <Mono>{clusters.length}</Mono> candidate{' '}
                {clusters.length === 1 ? 'cluster' : 'clusters'}
              </strong>
              <span>
                <Mono>{probable}</Mono> probable across <Mono>{typeCount}</Mono>{' '}
                {typeCount === 1 ? 'record type' : 'record types'}
              </span>
            </div>

            {clusters.length === 0 ? (
              <EmptyState
                glyph="merge"
                title="No duplicates detected"
                hint="Imports and new records are checked automatically. Rescan if you just added records elsewhere."
                action={
                  <Button size="sm" disabled={rescan.isPending} onClick={() => rescan.mutate()}>
                    {rescan.isPending ? 'Scanning...' : 'Rescan'}
                  </Button>
                }
              />
            ) : (
              <div className="dedup-clusters">
                {clusters.map((cluster) => {
                  const heading = clusterHeading(cluster);
                  return (
                    <article
                      key={cluster.id}
                      className="dedup-cluster"
                      aria-labelledby={`cluster-${cluster.id}`}
                    >
                      <header className="dedup-cluster__head">
                        <div className="hstack">
                          <Chip tone={cluster.verdict === 'probable' ? 'danger' : 'warning'} mono>
                            {cluster.verdict}
                          </Chip>
                          <Mono className="u-faint">
                            {Math.round(cluster.score)}% · {typeLabel(cluster.type)}
                          </Mono>
                        </div>
                        <Mono className="u-faint">{cluster.members.length} records</Mono>
                      </header>
                      <div className="dedup-cluster__body">
                        <div className="dedup-cluster__identity">
                          <h3 id={`cluster-${cluster.id}`} className="dedup-cluster__title">
                            {heading}
                          </h3>
                          <div className="dedup-cluster__members">
                            {cluster.members.map((member, index) => (
                              <div key={member.id} className="dedup-cluster__member">
                                <span className="dedup-cluster__node" aria-hidden>
                                  {index + 1}
                                </span>
                                <Link to={entityHref(member.type, member.id)}>
                                  <strong>{member.title}</strong>
                                  <span>{member.meta}</span>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="dedup-cluster__evidence">
                          <span className="dedup-cluster__evidence-label">Match evidence</span>
                          <div className="chips">
                            {[...new Set(cluster.pairs.flatMap((pair) => pair.evidence))]
                              .slice(0, 6)
                              .map((item) => (
                                <Chip key={item} mono>
                                  {item}
                                </Chip>
                              ))}
                            {cluster.pairs.some((pair) => pair.contradictions.length) ? (
                              <Chip tone="warning" mono>
                                has contradictions
                              </Chip>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="dedup-cluster__actions">
                        <Button
                          size="sm"
                          disabled={dismiss.isPending}
                          onClick={() => dismiss.mutate(cluster)}
                          aria-label={`Mark not the same: ${heading}`}
                        >
                          Not the same
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setAudit(cluster)}
                          aria-label={`Audit cluster: ${heading}`}
                        >
                          Review evidence
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title="Merge history"
        meta={merges.isSuccess ? merges.data.merges.length : undefined}
      >
        {merges.isError ? (
          <ErrorState
            title="Couldn't load merge history"
            detail={(merges.error as Error | null)?.message}
            onRetry={() => void merges.refetch()}
          />
        ) : merges.isLoading ? (
          <SkeletonRows rows={3} label="Loading merge history" />
        ) : (merges.data?.merges.length ?? 0) === 0 ? (
          <EmptyState
            glyph="merge"
            title="No merges yet"
            hint="When you consolidate a cluster, it appears here with conflict-safe undo for 30 days."
          />
        ) : (
          <ul className="dedup-list" aria-label="Merges">
            {merges.data!.merges.map((merge) => {
              // One undo runs at a time, so every button greys out. Only
              // the row that is actually running says so.
              const undoing = undo.isPending && undo.variables === merge.id;
              return (
                <li key={merge.id} className="dedup-list__row">
                  <Mono className="u-faint dedup-list__stamp">{merge.merged_at.slice(0, 10)}</Mono>
                  <div className="row__main">
                    <div className="row__title">
                      {merge.drop_title} → {merge.keep_title}
                    </div>
                  </div>
                  {merge.undone_at ? (
                    <Chip mono>undone</Chip>
                  ) : (
                    <Button
                      size="sm"
                      disabled={undo.isPending}
                      onClick={() => undo.mutate(merge.id)}
                      aria-label={`Undo merge of ${merge.drop_title} into ${merge.keep_title}`}
                    >
                      {undoing ? 'Undoing...' : 'Undo'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Learned aliases"
        meta={aliases.isSuccess ? aliases.data.aliases.length : undefined}
      >
        {aliases.isError ? (
          <ErrorState
            title="Couldn't load learned aliases"
            detail={(aliases.error as Error | null)?.message}
            onRetry={() => void aliases.refetch()}
          />
        ) : aliases.isLoading ? (
          <SkeletonRows rows={3} label="Loading learned aliases" />
        ) : (aliases.data?.aliases.length ?? 0) === 0 ? (
          <EmptyState
            glyph="merge"
            title="No learned aliases"
            hint="Aliases appear when a merge preserves an alternate name as an inspectable prior identity."
          />
        ) : (
          <ul className="dedup-list" aria-label="Learned aliases">
            {aliases.data!.aliases.map((alias) => (
              <li key={alias.id} className="dedup-list__row">
                <Mono className="u-faint dedup-list__stamp dedup-list__stamp--wide">
                  {typeLabel(alias.type)}
                </Mono>
                <div className="row__main">
                  <div className="row__title">
                    {alias.alias} → {alias.canonical_title}
                  </div>
                </div>
                <Link className="vt-btn vt-btn--sm" to={entityHref(alias.type, alias.canonical_id)}>
                  Open
                </Link>
                <Button
                  size="sm"
                  disabled={removeAlias.isPending}
                  onClick={() => removeAlias.mutate(alias.id)}
                  aria-label={`Forget alias ${alias.alias}`}
                >
                  {removeAlias.isPending && removeAlias.variables === alias.id
                    ? 'Forgetting...'
                    : 'Forget'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {audit ? (
        <ClusterAudit
          cluster={audit}
          onClose={() => setAudit(null)}
          onComplete={async () => {
            setAudit(null);
            await qc.invalidateQueries();
            flash('Identity consolidated. Original records remain recoverable for 30 days.');
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * What one consolidation run actually wrote. The loop applies one merge per
 * dropped record, so stopping halfway leaves part of the cluster consolidated;
 * that is a reportable outcome, not a plain failure.
 */
interface MergeOutcome {
  merged: string[];
  blocked: { title: string; reason: string } | null;
  total: number;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.join(' · ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ClusterAudit({
  cluster,
  onClose,
  onComplete,
}: {
  cluster: DupCluster;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [includedIds, setIncludedIds] = useState(
    () => new Set(cluster.members.map((member) => member.id)),
  );
  const [keepId, setKeepId] = useState(cluster.members[0]?.id ?? '');
  const [fieldSource, setFieldSource] = useState<Record<string, string>>({});
  // Drops the server has already absorbed. A run that stops halfway has written
  // part of the cluster, so a retry has to work on what is left of it.
  const [consolidated, setConsolidated] = useState<string[]>([]);
  const { flash } = useToast();
  const qc = useQueryClient();
  const queries = useQueries({
    queries: cluster.members.map((member) => ({
      queryKey: ['node', member.id],
      queryFn: () => api.get<NodeResp>(`/nodes/${member.id}`),
    })),
  });
  const records = queries.flatMap((query) => (query.data ? [query.data] : []));
  const loadError = queries.find((query) => query.isError)?.error as Error | undefined;
  const loading = records.length !== cluster.members.length && !loadError;
  const included = records.filter((record) => includedIds.has(record.node.id));
  const keep = records.find((record) => record.node.id === keepId);

  // Not memoized by hand: `included` is a fresh array every render, so the
  // dependency never matched and the memo never hit. Holding onto it only
  // stopped the compiler from memoizing the component at all.
  const envelopeKeys = ['title', 'subtitle', 'notes_md', 'start_date', 'end_date', 'status'];
  const propKeys = [
    ...new Set(included.flatMap((record) => Object.keys(record.node.props))),
  ].sort();
  const fields = [
    ...envelopeKeys.map((key) => ({ key, label: key.replace(/_/g, ' '), prop: false })),
    ...propKeys.map((key) => ({ key, label: key.replace(/_/g, ' '), prop: true })),
  ];

  function valueFor(record: NodeResp, key: string, prop: boolean): unknown {
    return prop ? record.node.props[key] : (record.node as unknown as Record<string, unknown>)[key];
  }

  function sourceFor(field: { key: string; prop: boolean }): NodeResp | undefined {
    const explicit = included.find((record) => record.node.id === fieldSource[field.key]);
    if (explicit) return explicit;
    if (keep && displayValue(valueFor(keep, field.key, field.prop)) !== '—') return keep;
    return (
      included.find((record) => displayValue(valueFor(record, field.key, field.prop)) !== '—') ??
      keep
    );
  }

  const hasValidMergeSet =
    included.length >= 2 &&
    included.length === includedIds.size &&
    includedIds.has(keepId) &&
    Boolean(keep);

  function toggleIncluded(memberId: string) {
    const next = new Set(includedIds);
    if (next.has(memberId)) {
      if (next.size === 1) {
        flash('Keep at least one record in the identity audit.');
        return;
      }
      next.delete(memberId);
    } else {
      next.add(memberId);
    }

    const nextKeepId = next.has(keepId)
      ? keepId
      : (cluster.members.find((member) => next.has(member.id))?.id ?? '');

    setIncludedIds(next);
    setKeepId(nextKeepId);
    setFieldSource((current) =>
      Object.fromEntries(Object.entries(current).filter(([, sourceId]) => next.has(sourceId))),
    );
  }

  const remainingDrops = included.filter(
    (record) => record.node.id !== keepId && !consolidated.includes(record.node.id),
  );

  const consolidate = useMutation({
    mutationFn: async (): Promise<MergeOutcome> => {
      if (!hasValidMergeSet || !keep) {
        throw new Error(
          'Choose at least two records and a canonical survivor before consolidating.',
        );
      }
      const props = { ...keep.node.props };
      const patch: Record<string, unknown> = {};
      for (const field of fields) {
        const source = sourceFor(field);
        if (!source) throw new Error(`No selected source is available for ${field.label}.`);
        let value = valueFor(source, field.key, field.prop);
        if (field.prop && ['emails', 'phones'].includes(field.key)) {
          value = [
            ...new Set(
              included.flatMap((record) => {
                const candidate = record.node.props[field.key];
                return Array.isArray(candidate) ? candidate : [];
              }),
            ),
          ];
        }
        if (field.prop) {
          if (value !== undefined) props[field.key] = value;
        } else if (displayValue(value) !== '—') {
          patch[field.key] = value;
        }
      }
      patch.props = props;
      await api.patch(`/nodes/${keepId}`, patch);
      // Apply the reviewed canonical snapshot first. Each following merge keeps
      // survivor values while unioning contacts and rewiring edges, so the last
      // merge remains immediately undoable and earlier merges can be unwound in
      // reverse history order without a post-merge edit invalidating every undo.
      const merged: string[] = [];
      for (const drop of remainingDrops) {
        try {
          await api.post('/duplicates/merge', { keepId, dropId: drop.node.id, fields: {} });
          merged.push(drop.node.id);
        } catch (err) {
          // Everything before this one is already written. Report that rather
          // than a flat failure the user would retry against a stale cluster.
          return {
            merged,
            blocked: { title: drop.node.title, reason: (err as Error).message },
            total: remainingDrops.length,
          };
        }
      }
      return { merged, blocked: null, total: remainingDrops.length };
    },
    onSuccess: (outcome) => {
      setConsolidated((current) => [...current, ...outcome.merged]);
      if (!outcome.blocked) {
        void onComplete();
        return;
      }
      void qc.invalidateQueries({ queryKey: ['duplicates'] });
      void qc.invalidateQueries({ queryKey: ['merges'] });
      flash(
        `Merged ${outcome.merged.length} of ${outcome.total}. ${outcome.blocked.title} was not merged.`,
        { variant: 'error' },
      );
    },
  });

  const relationCount = included.reduce((sum, record) => sum + record.edges.length, 0);
  const priorNames = included
    .filter((record) => record.node.id !== keepId)
    .map((record) => record.node.title);

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Audit ${typeLabel(cluster.type)} identity`}
      description="A complete, evidence-first review. No entity is merged until the final confirmation."
      size="lg"
      footer={
        <>
          <Button onClick={step === 0 ? onClose : () => setStep((value) => value - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              disabled={!hasValidMergeSet || loading || Boolean(loadError)}
              onClick={() => setStep((value) => value + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={consolidate.isPending || !hasValidMergeSet || loading || Boolean(loadError)}
              onClick={() => consolidate.mutate()}
            >
              {consolidate.isPending
                ? 'Consolidating...'
                : consolidated.length > 0
                  ? `Retry ${remainingDrops.length} record${remainingDrops.length === 1 ? '' : 's'}`
                  : `Merge ${includedIds.size} records`}
            </Button>
          )}
        </>
      }
    >
      <nav className="dedup-audit__steps" aria-label="Merge audit progress">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={index === step ? 'is-active' : index < step ? 'is-done' : ''}
            aria-current={index === step ? 'step' : undefined}
            aria-label={`Step ${index + 1}: ${label}`}
            disabled={index > step}
            onClick={() => index < step && setStep(index)}
          >
            <span aria-hidden>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {consolidate.isPending ? (
        <StatusTrace
          tone="live"
          label="Consolidating identity"
          detail={`${remainingDrops.length} into ${keep?.node.title ?? 'the survivor'}`}
        />
      ) : consolidate.isError ? (
        <StatusTrace
          tone="danger"
          label="Nothing was merged"
          detail={(consolidate.error as Error).message}
        />
      ) : consolidate.data?.blocked ? (
        <StatusTrace
          tone="danger"
          label={`Merged ${consolidate.data.merged.length} of ${consolidate.data.total}. ${consolidate.data.blocked.title} was not merged`}
          detail={consolidate.data.blocked.reason}
        />
      ) : null}

      {loadError ? (
        <ErrorState
          title="Couldn't load cluster records"
          detail={loadError.message}
          onRetry={() => void Promise.all(queries.map((query) => query.refetch()))}
          retrying={queries.some((query) => query.isFetching)}
        />
      ) : null}

      {loading ? (
        <div className="dedup-audit__loading">
          <SkeletonRows rows={5} label="Loading cluster records" />
        </div>
      ) : null}

      {!loading && !loadError && step === 0 ? (
        <section className="dedup-audit__pane">
          <h3>Are these the same real-world {typeLabel(cluster.type)}?</h3>
          <p className="u-muted">Inspect evidence and remove any false member before continuing.</p>
          {cluster.members.map((member) => {
            const related = cluster.pairs.filter(
              (pair) => pair.a.id === member.id || pair.b.id === member.id,
            );
            return (
              <label key={member.id} className="dedup-audit__identity">
                <input
                  type="checkbox"
                  checked={includedIds.has(member.id)}
                  aria-label={`Include ${member.title} in this merge`}
                  onChange={() => toggleIncluded(member.id)}
                />
                <div>
                  <strong>{member.title}</strong>
                  <Mono>
                    {member.meta} · rev {member.rev}
                  </Mono>
                  <div className="chips">
                    {[...new Set(related.flatMap((pair) => pair.evidence))].map((evidence) => (
                      <Chip key={evidence} mono>
                        {evidence}
                      </Chip>
                    ))}
                    {[
                      ...new Set(
                        related.flatMap((pair) => pair.contradictions.map((item) => item.label)),
                      ),
                    ].map((item) => (
                      <Chip key={item} tone="warning" mono>
                        {item}
                      </Chip>
                    ))}
                  </div>
                </div>
              </label>
            );
          })}
        </section>
      ) : null}

      {!loading && !loadError && step === 1 ? (
        <section className="dedup-audit__pane">
          <h3>Choose the canonical survivor</h3>
          <p className="u-muted">
            The survivor keeps its stable URL and becomes the destination for every relationship.
          </p>
          {included.map((record) => (
            <button
              key={record.node.id}
              type="button"
              className={`dedup-audit__survivor${keepId === record.node.id ? ' is-selected' : ''}`}
              aria-pressed={keepId === record.node.id}
              aria-label={`Keep ${record.node.title} as survivor`}
              onClick={() => setKeepId(record.node.id)}
            >
              <span>
                <strong>{record.node.title}</strong>
                <small>
                  {record.node.source} · confidence {record.node.confidence.toFixed(2)}
                </small>
              </span>
              {/* Selection used to be carried by border-colour and background
                  alone, two near-black tones apart, on the choice that decides
                  which record keeps its URL and which get tombstoned. */}
              <span className="dedup-audit__survivor-meta">
                <Mono>
                  {record.edges.length} relations · rev {record.node.rev}
                </Mono>
                {keepId === record.node.id ? (
                  <span className="dedup-audit__survivor-mark">
                    <Glyph name="check" size={14} />
                    <Chip mono>survivor</Chip>
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {!loading && !loadError && step === 2 ? (
        <section className="dedup-audit__pane">
          <h3>Audit every field</h3>
          <p className="u-muted">
            Choose the source of truth for every envelope and type-specific property. Contact arrays
            are still safely unioned by the server.
          </p>
          <div className="dedup-audit__fields">
            {fields.map((field) => (
              <div
                key={`${field.prop ? 'prop' : 'node'}:${field.key}`}
                className="dedup-audit__field"
              >
                <strong>{field.label}</strong>
                <div>
                  {included.map((record) => {
                    const selected = sourceFor(field)?.node.id === record.node.id;
                    return (
                      <button
                        key={record.node.id}
                        type="button"
                        className={selected ? 'is-selected' : ''}
                        aria-pressed={selected}
                        aria-label={`Use ${record.node.title} for ${field.label}`}
                        onClick={() =>
                          setFieldSource((current) => ({ ...current, [field.key]: record.node.id }))
                        }
                      >
                        <small>{record.node.title}</small>
                        <span>{displayValue(valueFor(record, field.key, field.prop))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !loadError && step === 3 ? (
        <section className="dedup-audit__pane">
          <h3>Relationship impact</h3>
          <p className="u-muted">
            {relationCount} relationship endpoints will be examined. Exact duplicates and self-loops
            are tombstoned; unique edges move to the survivor.
          </p>
          <div className="dedup-audit__relations">
            {included.map((record) => (
              <div key={record.node.id}>
                <strong>{record.node.title}</strong>
                <ul aria-label={`Relationships of ${record.node.title}`}>
                  {record.edges.length ? (
                    record.edges.map((edge) => {
                      const otherId = edge.src === record.node.id ? edge.dst : edge.src;
                      return (
                        <li key={edge.id}>
                          <Mono>{edge.type}</Mono>
                          {record.neighbors[otherId]?.title ?? otherId}
                        </li>
                      );
                    })
                  ) : (
                    <li className="u-muted">No relationships</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !loadError && step === 4 && keep ? (
        <section className="dedup-audit__pane dedup-audit__confirm">
          <div className="dedup-audit__seal" aria-hidden>
            <Glyph name="check" size={22} />
          </div>
          <h3>Ready to consolidate into {keep.node.title}</h3>
          <ul>
            <li>
              {includedIds.size - 1} duplicate record{includedIds.size === 2 ? '' : 's'} will be
              tombstoned, never hard-deleted.
            </li>
            <li>{relationCount} relationship endpoints will be rewired or deduplicated.</li>
            <li>
              {priorNames.length ? priorNames.join(', ') : 'No alternate names'} will remain
              recoverable as prior identity values.
            </li>
            <li>Each merge has conflict-safe undo for 30 days.</li>
          </ul>
        </section>
      ) : null}
    </Modal>
  );
}
