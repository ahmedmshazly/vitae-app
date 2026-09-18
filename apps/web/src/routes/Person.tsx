import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ClosenessDots,
  ConfirmDialog,
  EmptyState,
  EntityGlyph,
  ErrorState,
  FactorChip,
  Inline,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
  StrengthDonut,
} from '@vitae/ui';
import { edgeDisplayLabel, edgeTypeGroup, personRelationLabel } from '@vitae/core';
import { api } from '../lib/api.js';
import { rememberViewed } from '../lib/last-viewed.js';
import { CorrespondencePanel } from '../features/CorrespondencePanel.js';
import { InteractionLogger } from '../features/InteractionLogger.js';
import { LogIntroduction } from '../features/LogIntroduction.js';
import { AddConnection } from '../features/forms/AddConnection.js';
import { ConnectionRow } from '../features/forms/ConnectionRow.js';
import { KnowsEditor } from '../features/forms/KnowsEditor.js';
import { NodeFormDialog } from '../features/forms/NodeFormDialog.js';
import { BulkUnlinkBar, BulkUnlinkConfirm, useBulkEdgeDelete } from '../features/BulkEdgeDelete.js';
import { SelectAllRow, useVisibleSelection } from '../features/BulkNodeDelete.js';
import { entityHref } from '../lib/entity-href.js';
import { useToast } from '../features/Toast.js';
import { EntityEvidence } from '../features/EntityEvidence.js';
import { PersonFavors, type PersonFavor } from '../features/PersonFavors.js';
import { PersonDetails } from '../features/PersonDetails.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

interface Strength {
  strength: number;
  intensity: number;
  status: string;
  daysSinceLast: number | null;
  medianGapDays: number | null;
  factors: { closeness: number; intensity: number };
}
interface Summary {
  strength: Strength;
  relationship: {
    relation: string | null;
    closeness: number | null;
    cadenceTargetDays: number | null;
    metVia: string | null;
    topics: string[];
    edgeId: string | null;
    doNotPing: boolean;
    metOn: string | null;
    knowsProps: Record<string, unknown>;
  };
  favors: PersonFavor[];
}
interface RecordResp {
  node: {
    id: string;
    title: string;
    subtitle?: string;
    source: string;
    props: Record<string, unknown>;
  };
  edges: Array<{
    id: string;
    type: string;
    src: string;
    dst: string;
    props: Record<string, unknown>;
  }>;
  neighbors: Record<string, { id: string; type: string; title: string }>;
}

const GROUP_ORDER = ['Career', 'Education', 'Social', 'Content', 'Location', 'Other'] as const;

/** A neighbour node, as `/nodes/:id` actually sends it - the whole record, not
 * the {id,type,title} projection the page used to assume. `occurred_at` and
 * `kind` were on the wire all along; the log just never read them. */
export interface InteractionNode {
  id: string;
  type: string;
  title: string;
  created_at?: string;
  props?: { kind?: string; occurred_at?: string; note?: string };
}

export interface LoggedInteraction {
  id: string;
  title: string;
  kind?: string;
  /** ISO instant this actually happened, falling back to when it was recorded. */
  at: string;
}

/** How many rows before the log starts crowding out the rest of the profile. */
const INTERACTION_PAGE = 10;
/** Entries shown per profile group, and skills shown, before the group folds. */
const PROFILE_PAGE = 8;
const SKILL_PAGE = 24;
/** Beyond this the rule is a smear, not a scale. */
const MAX_INTERACTION_TICKS = 40;

/**
 * Newest first, by when it happened rather than by edge insertion order.
 * The list was `.reverse()`d edge order, which is only accidentally chronological.
 *
 * De-duplicated by id: a person can be joined to one interaction by more than
 * one WITH edge, and the log was rendering that interaction once per edge -
 * duplicate rows, and duplicate React keys, on every well-connected person.
 */
export function toInteractionLog(nodes: InteractionNode[]): LoggedInteraction[] {
  const byId = new Map<string, InteractionNode>();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()]
    .map((n) => ({
      id: n.id,
      title: n.title,
      kind: n.props?.kind,
      at:
        [n.props?.occurred_at, n.created_at].find(
          (date) => date && Number.isFinite(Date.parse(date)),
        ) ?? '',
    }))
    .sort((a, b) => (a.at ? (b.at ? Date.parse(b.at) - Date.parse(a.at) : -1) : b.at ? 1 : 0));
}

/**
 * Ticks placed by *date*, not evenly - so the rule shows the shape of the
 * relationship: bunched to the right means recent contact, a long empty
 * stretch means it is drifting. Active is the most recent.
 */
export function interactionTicks(log: LoggedInteraction[]): {
  ticks: Array<{ at: number; label: string }>;
  index: number;
} {
  const dated = log
    .filter((i) => Number.isFinite(Date.parse(i.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_INTERACTION_TICKS);
  if (dated.length === 0) return { ticks: [], index: -1 };
  const times = dated.map((i) => new Date(i.at).getTime()).filter((t) => Number.isFinite(t));
  if (times.length === 0) return { ticks: [], index: -1 };
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span = last - first;
  // Oldest first, so the newest sits at the right-hand end where "now" reads.
  const ordered = [...dated].reverse();
  return {
    ticks: ordered.map((i) => {
      const t = new Date(i.at).getTime();
      // A single interaction, or several on one day, sit at the centre rather
      // than dividing by zero.
      const pos = span > 0 ? (t - first) / span : 0.5;
      return {
        at: 0.02 + pos * 0.96,
        label: `${i.kind ?? 'interaction'} on ${i.at.slice(0, 10)}`,
      };
    }),
    index: ordered.length - 1,
  };
}

/** Records this person owns, grouped as a CV reads (GET /people/:id/profile). */
interface Profile {
  person: { id: string; title: string; isSelf: boolean; isPlaceholder: boolean };
  sections: Array<{
    type: string;
    label: string;
    entries: Array<{
      id: string;
      title: string;
      org?: string;
      start_date?: string;
      end_date?: string;
    }>;
  }>;
  skills: Array<{ id: string; name: string; category?: string }>;
  counts: { records: number; skills: number };
}
export function Person() {
  const { id = '' } = useParams();
  return <PersonDossier key={id} id={id} />;
}

function PersonDossier({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const removing = useRef(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  useEffect(() => {
    if (id) rememberViewed(id);
  }, [id]);
  const rec = useQuery({
    queryKey: ['node', id],
    queryFn: () => api.get<RecordResp>(`/nodes/${id}`),
  });
  const sum = useQuery({
    queryKey: ['person-summary', id],
    queryFn: () => api.get<Summary>(`/people/${id}/summary`),
  });
  const profile = useQuery({
    queryKey: ['person-profile', id],
    queryFn: () => api.get<Profile>(`/people/${id}/profile`),
  });
  const [logging, setLogging] = useState(false);
  const [introducing, setIntroducing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingRel, setEditingRel] = useState(false);
  const [addingConn, setAddingConn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAllInteractions, setShowAllInteractions] = useState(false);
  /** Which profile groups the reader has asked to see in full, by group key. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const bulk = useBulkEdgeDelete();
  const [connectionLimit, setConnectionLimit] = useState(20);
  const hasSelection = bulk.selectedCount > 0;
  const [bulkHeight, setBulkHeight] = useState(0);
  useLayoutEffect(() => {
    if (!hasSelection) return;
    const bar = document.querySelector('[aria-label="Connection bulk actions"]');
    if (!bar) return;
    const measure = () => setBulkHeight(Math.ceil(bar.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hasSelection]);
  const summaryUnavailable = sum.isError && sum.data === undefined;
  const profileUnavailable = profile.isError && profile.data === undefined;

  /**
   * The two supporting queries, each of which can fail while still holding a
   * usable previous answer. They used to raise one `role="alert"` banner each,
   * so a network blip fired two assertive announcements at once and left two
   * near-identical Retry buttons to choose between.
   */
  const degraded = [
    {
      what: 'relationship intelligence',
      failed: sum.isError && sum.data !== undefined,
      busy: sum.isFetching,
      retry: () => void sum.refetch(),
    },
    {
      what: 'profile evidence',
      failed: profile.isError && profile.data !== undefined,
      busy: profile.isFetching,
      retry: () => void profile.refetch(),
    },
  ].filter((q) => q.failed);
  const degradedNames = degraded.map((q) => q.what).join(' and ');
  const degradedBusy = degraded.some((q) => q.busy);

  const remove = useMutation({
    mutationFn: () => api.del(`/nodes/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries();
      flash(`Moved ${rec.data?.node.title ?? 'person'} to trash`);
      navigate('/data/trash');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'This person could not be moved to trash.';
      setDeleteError(message);
    },
    onSettled: () => {
      removing.current = false;
    },
  });

  // All edges except interaction WITH rows (those live under Interactions).
  const relationEdges = useMemo(() => {
    const edges = rec.data?.edges ?? [];
    const neighbors = rec.data?.neighbors ?? {};
    return edges
      .filter((e) => !(e.type === 'WITH' && neighbors[e.src]?.type === 'interaction'))
      .slice()
      .sort((a, b) => {
        const ga = GROUP_ORDER.indexOf(edgeTypeGroup(a.type) as (typeof GROUP_ORDER)[number]);
        const gb = GROUP_ORDER.indexOf(edgeTypeGroup(b.type) as (typeof GROUP_ORDER)[number]);
        return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb) || a.type.localeCompare(b.type);
      });
  }, [rec.data]);

  const visibleConnections = useMemo(
    () => relationEdges.slice(0, connectionLimit),
    [relationEdges, connectionLimit],
  );
  const reconcileSelection = bulk.reconcile;
  useEffect(() => {
    if (rec.isSuccess && !rec.isFetching && !bulk.busy)
      reconcileSelection(relationEdges.map((edge) => edge.id));
  }, [rec.isSuccess, rec.isFetching, relationEdges, bulk.busy, reconcileSelection]);
  const edgeIds = useMemo(() => visibleConnections.map((e) => e.id), [visibleConnections]);
  const { allVisibleSelected } = useVisibleSelection(edgeIds, bulk.selected);

  if (rec.isError && rec.data === undefined)
    return (
      <div className="page page--network page--person-dossier">
        <PageHeader title="Person" />
        <RegisterRule />
        <ErrorState
          title="Couldn't load this person"
          detail={(rec.error as Error | null)?.message}
          onRetry={() => void rec.refetch()}
          retrying={rec.isFetching}
        />
      </div>
    );
  if (rec.isLoading || !rec.data)
    return (
      <div className="page page--network page--person-dossier">
        <PageHeader title="Person" subtitle="Loading..." />
        <RegisterRule />
        <SkeletonRows rows={6} label="Loading person" />
      </div>
    );
  const { node, edges, neighbors } = rec.data;
  const props = node.props;
  const s = sum.data?.strength;
  const rel = sum.data?.relationship;
  const favors = sum.data?.favors ?? [];
  const openFavors = favors.filter((f) => !f.settled);
  /** Past the cadence the user set for this person. */
  const cadenceOverdue =
    rel?.cadenceTargetDays != null &&
    s?.daysSinceLast != null &&
    s.daysSinceLast > rel.cadenceTargetDays;

  const interactions = toInteractionLog(
    edges
      .filter((e) => e.type === 'WITH' && neighbors[e.src]?.type === 'interaction')
      .map((e) => neighbors[e.src] as InteractionNode),
  );
  const register = interactionTicks(interactions);
  const shownInteractions = showAllInteractions
    ? interactions
    : interactions.slice(0, INTERACTION_PAGE);

  return (
    <div
      className="page page--network page--person-dossier"
      style={{ paddingBottom: hasSelection ? bulkHeight + 48 : undefined }}
    >
      <div className="network-dossier network-dossier--person">
        <PageHeader
          title={node.title}
          subtitle={
            <>
              {[(props.headline as string) ?? node.subtitle, props.city as string]
                .filter(Boolean)
                .join(' · ') || 'Person'}
              {rel?.metVia && ` · met via ${rel.metVia}`}
            </>
          }
          actions={
            <>
              <Button size="sm" glyph="edit" disabled={!canWrite} onClick={() => setEditing(true)}>
                Edit record
              </Button>
              <Button
                size="sm"
                variant="primary"
                glyph="interaction"
                disabled={!canWrite}
                onClick={() => setLogging(true)}
              >
                Log interaction
              </Button>
              <Button
                size="sm"
                variant="danger"
                glyph="trash"
                disabled={!canWrite || remove.isPending}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
            </>
          }
        />
        {props.do_not_contact === true && (
          <p className="person-contact-preference">
            <strong>Do not contact</strong> · Saved contact preference
          </p>
        )}
        <dl className="network-dossier__facts" aria-label="Relationship dossier facts">
          <div>
            <dt>Record source</dt>
            <dd>
              <ProvenanceChip source={node.source} />
            </dd>
          </div>
          <div>
            <dt>Relationship</dt>
            <dd>
              {summaryUnavailable ? (
                <span className="network-dossier__unavailable">Unavailable</span>
              ) : sum.isLoading ? (
                <Mono>Loading...</Mono>
              ) : rel?.relation ? (
                <Chip>{personRelationLabel(rel.relation)}</Chip>
              ) : (
                'Not set'
              )}
            </dd>
          </div>
          <div>
            <dt>Last contact</dt>
            <dd>
              <Mono>
                {interactions[0]?.at
                  ? interactions[0].at.slice(0, 10)
                  : interactions.length
                    ? 'Date not recorded'
                    : 'No interaction yet'}
              </Mono>
            </dd>
          </div>
          <div>
            <dt>Profile evidence</dt>
            <dd>
              {profileUnavailable ? (
                <span className="network-dossier__unavailable">Unavailable</span>
              ) : profile.isLoading ? (
                <Mono>Loading...</Mono>
              ) : (
                <Mono>
                  {profile.data?.counts.records ?? 0}{' '}
                  {profile.data?.counts.records === 1 ? 'record' : 'records'} ·{' '}
                  {profile.data?.counts.skills ?? 0}{' '}
                  {profile.data?.counts.skills === 1 ? 'skill' : 'skills'}
                </Mono>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {!canWrite && (
        <p role="status" className="text-sm text-muted">
          {WRITE_LOCK_HINT}
        </p>
      )}
      {/* One tick per logged interaction, placed by date - so the rule shows
          whether contact is clustered or drifting, not just how much there is. */}
      <RegisterRule
        ticks={register.ticks}
        activeIndex={register.index >= 0 ? register.index : undefined}
        label={register.ticks.length ? 'Interactions over time' : undefined}
      />

      {rec.isFetching && (
        <StatusTrace
          className="network-trace"
          tone="live"
          label="Refreshing this dossier"
          detail="Keeping the last verified record in view"
        />
      )}
      {rec.isError && rec.data !== undefined && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="This person could not be refreshed"
          action={
            <Button size="sm" disabled={rec.isFetching} onClick={() => void rec.refetch()}>
              {rec.isFetching ? 'Retrying...' : 'Retry record'}
            </Button>
          }
        >
          Showing the last verified dossier while the latest record is unavailable.
        </Banner>
      )}
      {degraded.length > 0 && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title={`Couldn't refresh ${degradedNames}`}
          action={
            <Button
              size="sm"
              disabled={degradedBusy}
              onClick={() => degraded.forEach((q) => q.retry())}
            >
              {degradedBusy ? 'Retrying...' : 'Retry'}
            </Button>
          }
        >
          Showing the last verified {degradedNames} while the newest answer is unavailable.
        </Banner>
      )}

      {editing && <NodeFormDialog open onOpenChange={setEditing} type="person" nodeId={id} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (removing.current) return;
          setConfirmDelete(open);
          if (!open) setDeleteError(null);
        }}
        title={`Move '${node.title}' to trash?`}
        body={
          <>
            <p>It stays recoverable from Trash for 30 days; connections are preserved.</p>
            {!canWrite && <p role="status">{WRITE_LOCK_HINT}</p>}
            {deleteError && (
              <Banner tone="danger" title="Couldn’t move this person to Trash">
                {deleteError} Check your connection and try again.
              </Banner>
            )}
          </>
        }
        confirmLabel={remove.isPending ? 'Moving...' : 'Move to trash'}
        destructive
        busy={remove.isPending || !canWrite}
        cancelDisabled={remove.isPending}
        initialFocus="cancel"
        onConfirm={() => {
          if (!canWrite || removing.current) return;
          removing.current = true;
          setDeleteError(null);
          remove.mutate();
        }}
      />

      <div className="grid-2 network-dossier__body">
        <div className="network-dossier__evidence">
          {/* Strength */}
          <Section
            title="Relationship strength"
            actions={
              rel?.edgeId && !editingRel ? (
                <Button size="sm" disabled={!canWrite} onClick={() => setEditingRel(true)}>
                  Edit relationship
                </Button>
              ) : undefined
            }
          >
            {summaryUnavailable ? (
              <ErrorState
                title="Relationship strength could not be verified"
                detail={(sum.error as Error | null)?.message}
                onRetry={() => void sum.refetch()}
                retryLabel="Retry strength"
                retrying={sum.isFetching}
              />
            ) : sum.isLoading ? (
              <SkeletonRows rows={3} label="Loading relationship strength" />
            ) : editingRel && rel?.edgeId ? (
              <KnowsEditor
                personId={id}
                edgeId={rel.edgeId}
                knowsProps={rel.knowsProps}
                onDone={() => setEditingRel(false)}
              />
            ) : s ? (
              <div className="network-strength">
                <StrengthDonut strength={s.strength} label={s.status} />
                <div className="network-strength__body">
                  <p className="network-strength__summary">
                    Strength combines the closeness you set with the timing and frequency of logged
                    contact.
                  </p>
                  <div className="factorbar network-strength__factors">
                    <span>
                      <FactorChip
                        label="closeness"
                        value={s.factors.closeness}
                        detail="Your 1–5 relationship rating, weighted at 45%."
                      />
                      <small>Your declared relationship rating.</small>
                    </span>
                    <span>
                      <FactorChip
                        label="contact"
                        value={s.factors.intensity}
                        detail="Recent and frequent interactions, with older contact fading over 90 days."
                      />
                      <small>Recent contact carries more weight.</small>
                    </span>
                  </div>
                  {/* A definition ledger, so every value is programmatically
                      paired with the label it answers. It was a run of sibling
                      spans, which a screen reader reads as unrelated text. */}
                  <dl className="m-0 stack network-fact-list">
                    {rel?.relation && (
                      <div className="spread">
                        <dt className="u-muted">Relation</dt>
                        <dd className="m-0">
                          <Chip>{personRelationLabel(rel.relation)}</Chip>
                        </dd>
                      </div>
                    )}
                    <div className="spread">
                      <dt className="u-muted">Closeness</dt>
                      <dd className="m-0">
                        {rel?.edgeId ? (
                          <button
                            type="button"
                            disabled={!canWrite}
                            className="person__editable"
                            // Distinct from the region's own "Edit relationship":
                            // two controls with the same accessible name in one
                            // region is ambiguous to anyone navigating by name.
                            // The rating itself is in the name because an
                            // aria-label overrides the value the dots state.
                            aria-label={
                              rel.closeness != null
                                ? `Edit closeness, currently ${rel.closeness} of 5`
                                : 'Edit closeness, not set'
                            }
                            title="Edit closeness"
                            onClick={() => setEditingRel(true)}
                          >
                            <ClosenessDots value={rel.closeness} />
                          </button>
                        ) : (
                          <ClosenessDots value={rel?.closeness ?? null} />
                        )}
                      </dd>
                    </div>
                    <div className="spread">
                      <dt className="u-muted">Cadence target</dt>
                      <dd className="m-0">
                        {/* Overdue used to be the warning hue on the number and
                            nothing else, so the most actionable fact on the page
                            was invisible without colour. */}
                        <Inline gap={2}>
                          <Mono>{rel?.cadenceTargetDays ? `${rel.cadenceTargetDays}d` : '—'}</Mono>
                          {cadenceOverdue && (
                            <Chip tone="warning" glyph="bell">
                              overdue
                            </Chip>
                          )}
                        </Inline>
                      </dd>
                    </div>
                    {s.daysSinceLast != null && (
                      <div className="spread">
                        <dt className="u-muted">Quiet</dt>
                        <dd className="m-0">
                          <Mono>{Math.round(s.daysSinceLast)}d</Mono>
                        </dd>
                      </div>
                    )}
                    {s.medianGapDays != null && (
                      <div className="spread">
                        <dt className="u-muted">Median gap</dt>
                        <dd className="m-0">
                          <Mono>{Math.round(s.medianGapDays)}d</Mono>
                        </dd>
                      </div>
                    )}
                    {rel?.doNotPing && (
                      <div className="spread">
                        <dt className="u-muted">Reconnect</dt>
                        <dd className="m-0">
                          <Chip tone="warning">do not ping</Chip>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            ) : (
              <EmptyState
                glyph="interaction"
                title="No relationship signal yet"
                hint="Log an interaction or set closeness to give this relationship a traceable strength."
                action={
                  <Button size="sm" disabled={!canWrite} onClick={() => setLogging(true)}>
                    Log first interaction
                  </Button>
                }
              />
            )}
          </Section>

          <PersonDetails
            props={props}
            topics={rel?.topics ?? []}
            topicsUnavailable={summaryUnavailable}
            topicsLoading={sum.isLoading}
          />

          {/* What this person has actually done - their own records only. */}
          <Section
            title="Profile"
            meta={
              profileUnavailable
                ? 'unavailable'
                : profile.data
                  ? `${profile.data.counts.records} ${profile.data.counts.records === 1 ? 'record' : 'records'}`
                  : '...'
            }
          >
            {profileUnavailable ? (
              <ErrorState
                title="Profile evidence could not be loaded"
                detail={(profile.error as Error | null)?.message}
                onRetry={() => void profile.refetch()}
                retryLabel="Retry evidence"
                retrying={profile.isFetching}
              />
            ) : profile.isLoading ? (
              <SkeletonRows rows={4} label="Loading profile evidence" />
            ) : profile.data &&
              profile.data.sections.length === 0 &&
              profile.data.skills.length === 0 ? (
              <EmptyState
                glyph="person"
                title="No profile evidence yet"
                hint="Connect roles, projects, education, or skills to build a verified profile for this person."
              />
            ) : (
              <div className="stack network-profile-ledger">
                {/* Each group is a heading over a real list. It used to be a
                    plain div over a run of bare links, so the Career/Education/
                    Skills structure existed only in the pixels. The truncated
                    tail was inert text; it is a disclosure now. */}
                {(profile.data?.sections ?? []).map((section) => {
                  const open = openGroups[section.type] ?? false;
                  const shown = open ? section.entries : section.entries.slice(0, PROFILE_PAGE);
                  return (
                    <div key={section.type} className="stack network-profile-ledger__group">
                      <h3 className="network-profile-ledger__label">
                        {section.label} <Mono className="u-faint">{section.entries.length}</Mono>
                      </h3>
                      <ul className="network-profile-ledger__entries">
                        {shown.map((entry) => (
                          <li key={entry.id}>
                            <Link
                              to={entityHref(section.type, entry.id)}
                              className="spread network-profile-ledger__entry"
                            >
                              <span>
                                {entry.title}
                                {entry.org ? <span className="u-faint"> · {entry.org}</span> : null}
                              </span>
                              <Mono className="u-faint">
                                {[entry.start_date?.slice(0, 4), entry.end_date?.slice(0, 4)]
                                  .filter(Boolean)
                                  .join('–') || '—'}
                              </Mono>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {section.entries.length > PROFILE_PAGE && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open}
                          onClick={() => setOpenGroups((g) => ({ ...g, [section.type]: !open }))}
                        >
                          {open
                            ? `Show first ${PROFILE_PAGE} of ${section.label.toLowerCase()}`
                            : `Show all ${section.entries.length} of ${section.label.toLowerCase()}`}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {(profile.data?.skills ?? []).length > 0
                  ? (() => {
                      const skills = profile.data?.skills ?? [];
                      const open = openGroups.skills ?? false;
                      const shown = open ? skills : skills.slice(0, SKILL_PAGE);
                      return (
                        <div className="stack network-profile-ledger__group">
                          <h3 className="network-profile-ledger__label">
                            Skills <Mono className="u-faint">{skills.length}</Mono>
                          </h3>
                          <ul className="chips network-profile-ledger__skills">
                            {shown.map((skill) => (
                              <li key={skill.id}>
                                <Chip>{skill.name}</Chip>
                              </li>
                            ))}
                          </ul>
                          {skills.length > SKILL_PAGE && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-expanded={open}
                              onClick={() => setOpenGroups((g) => ({ ...g, skills: !open }))}
                            >
                              {open
                                ? `Show first ${SKILL_PAGE} skills`
                                : `Show all ${skills.length} skills`}
                            </Button>
                          )}
                        </div>
                      );
                    })()
                  : null}
              </div>
            )}
          </Section>

          {/* Favor ledger */}
          {/* The ledger reads from the same summary query the strength region
              guards, and used to render unguarded: while the request was in
              flight, and permanently after it failed, the header said
              "balanced" and the body said "No favors recorded" for a person who
              might owe three. It states only what it has now. */}
          <Section
            title="Favor ledger"
            meta={
              summaryUnavailable
                ? 'unavailable'
                : sum.isLoading
                  ? '...'
                  : openFavors.length
                    ? `${openFavors.length} open`
                    : 'balanced'
            }
          >
            {summaryUnavailable ? (
              <ErrorState
                title="The favor ledger could not be verified"
                detail={(sum.error as Error | null)?.message}
                onRetry={() => void sum.refetch()}
                retryLabel="Retry favors"
                retrying={sum.isFetching}
              />
            ) : sum.isLoading ? (
              <SkeletonRows rows={2} label="Loading favor ledger" />
            ) : (
              <PersonFavors personId={id} favors={favors} hasRelationship={Boolean(rel?.edgeId)} />
            )}
          </Section>
        </div>

        <div className="network-dossier__activity">
          <Section title="Interactions" meta={interactions.length}>
            {interactions.length === 0 ? (
              <EmptyState
                glyph="interaction"
                title="No interactions logged"
                hint="Log a coffee, call, or message so relationship strength has dated evidence behind it."
                action={
                  <Button size="sm" disabled={!canWrite} onClick={() => setLogging(true)}>
                    Log interaction
                  </Button>
                }
              />
            ) : (
              <>
                <ul className="network-rows" aria-label="Logged interactions">
                  {shownInteractions.map((i) => (
                    <li key={i.id}>
                      <Link
                        to={entityHref('interaction', i.id)}
                        className="-mx-2 flex min-h-9 items-center gap-3 rounded-sm px-2 py-2 text-ink no-underline hover:bg-raised hover:no-underline network-interaction"
                      >
                        <EntityGlyph type="interaction" size="sm" />
                        {/* Kind and date were both in the payload and neither
                            was shown - a relationship log with no "when" on it
                            cannot answer the question the page exists for. */}
                        {i.kind && <Chip mono>{i.kind}</Chip>}
                        <span className="network-interaction__title">{i.title}</span>
                        <Mono className="network-interaction__date text-xs text-muted">
                          {i.at ? i.at.slice(0, 10) : 'undated'}
                        </Mono>
                      </Link>
                    </li>
                  ))}
                </ul>
                {interactions.length > INTERACTION_PAGE && (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="ghost"
                    // Was a bare 32px text button with nothing saying whether
                    // the list was currently truncated.
                    aria-expanded={showAllInteractions}
                    onClick={() => setShowAllInteractions((v) => !v)}
                  >
                    {showAllInteractions
                      ? 'Show recent only'
                      : `Show all ${interactions.length} interactions`}
                  </Button>
                )}
              </>
            )}
          </Section>

          {/* SRS FR-COMM-001: the correspondence profile, beside the log it
              derives from so every figure can name its interactions; the
              introduction recorder is FR-COMM-003's surface. */}
          <Section
            title="Correspondence"
            actions={
              <Button
                size="sm"
                variant="ghost"
                disabled={!canWrite}
                onClick={() => setIntroducing(true)}
              >
                Log introduction
              </Button>
            }
          >
            <CorrespondencePanel personId={id!} interactions={interactions} />
          </Section>

          <Section
            title="Connections"
            meta={relationEdges.length}
            actions={
              <>
                <BulkUnlinkBar
                  selectedCount={bulk.selectedCount}
                  busy={bulk.busy}
                  onClear={bulk.clear}
                  onUnlink={() => bulk.setConfirmUnlink(true)}
                />
                <Button
                  size="sm"
                  glyph="plus"
                  disabled={!canWrite}
                  onClick={() => setAddingConn(true)}
                >
                  Add connection
                </Button>
              </>
            }
          >
            {relationEdges.length === 0 ? (
              <EmptyState
                glyph="graph"
                title="No connections yet"
                hint="Link schools, roles, skills, reporting lines, or organizations to place this person in your network."
                action={
                  <Button size="sm" disabled={!canWrite} onClick={() => setAddingConn(true)}>
                    Add first connection
                  </Button>
                }
              />
            ) : (
              <>
                <SelectAllRow
                  allSelected={allVisibleSelected}
                  disabled={bulk.busy || !canWrite}
                  onToggle={() => bulk.toggleAll(edgeIds, allVisibleSelected)}
                />
                <ul className="person-connections" aria-label="Connections">
                  {visibleConnections.map((e) => (
                    <li key={e.id}>
                      <ConnectionRow
                        edge={e}
                        nodeId={node.id}
                        neighbors={neighbors}
                        selected={bulk.isSelected(e.id)}
                        busy={bulk.busy}
                        onToggleSelect={() => bulk.toggleOne(e.id)}
                      />
                    </li>
                  ))}
                </ul>
                {visibleConnections.length < relationEdges.length && (
                  <Button
                    size="sm"
                    disabled={bulk.busy}
                    onClick={() => setConnectionLimit((limit) => limit + 20)}
                  >
                    Show more connections ({relationEdges.length - visibleConnections.length}{' '}
                    remaining)
                  </Button>
                )}
              </>
            )}
          </Section>
          <EntityEvidence entityId={node.id} />
        </div>
      </div>

      {logging && (
        <InteractionLogger
          personId={id}
          personName={node.title}
          onClose={() => setLogging(false)}
        />
      )}
      {introducing && (
        <LogIntroduction
          open
          onOpenChange={(next) => !next && setIntroducing(false)}
          personId={id}
          personName={node.title}
        />
      )}
      <AddConnection
        open={addingConn}
        onOpenChange={setAddingConn}
        nodeId={id}
        nodeType="person"
        nodeTitle={node.title}
      />
      <BulkUnlinkConfirm
        open={bulk.confirmUnlink}
        onOpenChange={bulk.setConfirmUnlink}
        selectedCount={bulk.selectedCount}
        titles={relationEdges
          .filter((edge) => bulk.isSelected(edge.id))
          .map((edge) => {
            const otherId = edge.src === id ? edge.dst : edge.src;
            return `${neighbors[otherId]?.title ?? 'Unknown record'} · ${edgeDisplayLabel(
              edge.type,
              edge.src === id ? 'out' : 'in',
              {
                relation: typeof edge.props.relation === 'string' ? edge.props.relation : undefined,
                kind: typeof edge.props.kind === 'string' ? edge.props.kind : undefined,
              },
            )}`;
          })}
        busy={bulk.busy}
        onConfirm={() => {
          void bulk.unlinkSelected();
        }}
      />
    </div>
  );
}
