import { useMemo, useState } from 'react';
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
  Input,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
  StrengthDonut,
} from '@vitae/ui';
import { edgeTypeGroup, personRelationLabel } from '@vitae/core';
import { api } from '../lib/api.js';
import { InteractionLogger } from '../features/InteractionLogger.js';
import { AddConnection } from '../features/forms/AddConnection.js';
import { ConnectionRow } from '../features/forms/ConnectionRow.js';
import { KnowsEditor } from '../features/forms/KnowsEditor.js';
import { NodeFormDialog } from '../features/forms/NodeFormDialog.js';
import { BulkUnlinkBar, BulkUnlinkConfirm, useBulkEdgeDelete } from '../features/BulkEdgeDelete.js';
import { SelectAllRow, useVisibleSelection } from '../features/BulkNodeDelete.js';
import { entityHref } from '../lib/entity-href.js';
import { useToast } from '../features/Toast.js';

interface Strength {
  strength: number;
  intensity: number;
  status: string;
  daysSinceLast: number | null;
  medianGapDays: number | null;
  factors: { closeness: number; intensity: number };
}
interface Favor {
  /** Absent on favors written straight into the KNOWS edge by a seed or a
   * bundle - they never passed through POST /favors, which is what assigns
   * one. PATCH /:favorId is the only way to settle a favor, so those cannot
   * be settled at all; the row says so rather than firing a request that 404s. */
  id?: string;
  direction: 'owed_to_me' | 'owed_by_me';
  /** The canonical field is `what` - the client read `note`, which the API
   * stopped sending, so every favor rendered as "(no note)". */
  what: string;
  settled?: boolean;
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
  favors: Favor[];
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
      at: n.props?.occurred_at ?? n.created_at ?? '',
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
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
  const dated = log.filter((i) => i.at).slice(0, MAX_INTERACTION_TICKS);
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
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
  const [editing, setEditing] = useState(false);
  const [editingRel, setEditingRel] = useState(false);
  const [addingConn, setAddingConn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favorNote, setFavorNote] = useState('');
  const [showAllInteractions, setShowAllInteractions] = useState(false);
  const bulk = useBulkEdgeDelete();
  const summaryUnavailable = sum.isError && sum.data === undefined;
  const profileUnavailable = profile.isError && profile.data === undefined;

  const addFavor = useMutation({
    mutationFn: (direction: 'owed_to_me' | 'owed_by_me') =>
      api.post(`/people/${id}/favors`, { direction, what: favorNote }),
    onSuccess: (_data, direction) => {
      setFavorNote('');
      void qc.invalidateQueries({ queryKey: ['person-summary', id] });
      flash(direction === 'owed_to_me' ? 'Recorded: they owe you' : 'Recorded: you owe them');
    },
  });
  const settleFavor = useMutation({
    mutationFn: (favorId: string) =>
      api.patch(`/people/${id}/favors/${favorId}`, { settled: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['person-summary', id] });
      flash('Favor marked settled');
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/nodes/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries();
      flash(`Moved ${rec.data?.node.title ?? 'person'} to trash`);
      navigate('/data/trash');
    },
    onError: (error) =>
      flash(error instanceof Error ? error.message : 'This person could not be moved to trash.', {
        variant: 'error',
      }),
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

  const edgeIds = useMemo(() => relationEdges.map((e) => e.id), [relationEdges]);
  const { allVisibleSelected } = useVisibleSelection(edgeIds, bulk.selected);

  if (rec.isError && rec.data === undefined)
    return (
      <div className="page page--network page--person-dossier">
        <PageHeader title="Person" />
        <RegisterRule />
        <ErrorState
          title="Couldn’t load this person"
          detail={(rec.error as Error | null)?.message}
          onRetry={() => void rec.refetch()}
        />
      </div>
    );
  if (rec.isLoading || !rec.data)
    return (
      <div className="page page--network page--person-dossier">
        <PageHeader title="Person" subtitle="Loading…" />
        <RegisterRule />
        <SkeletonRows rows={6} />
      </div>
    );
  const { node, edges, neighbors } = rec.data;
  const props = node.props;
  const s = sum.data?.strength;
  const rel = sum.data?.relationship;
  const favors = sum.data?.favors ?? [];
  const openFavors = favors.filter((f) => !f.settled);

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
    <div className="page page--network page--person-dossier">
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
              <Button size="sm" glyph="edit" onClick={() => setEditing(true)}>
                Edit record
              </Button>
              <Button
                size="sm"
                variant="primary"
                glyph="interaction"
                onClick={() => setLogging(true)}
              >
                Log interaction
              </Button>
              <Button
                size="sm"
                variant="danger"
                glyph="trash"
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </>
          }
        />
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
                <Mono>Loading…</Mono>
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
                {interactions[0]?.at ? interactions[0].at.slice(0, 10) : 'No interaction yet'}
              </Mono>
            </dd>
          </div>
          <div>
            <dt>Profile evidence</dt>
            <dd>
              {profileUnavailable ? (
                <span className="network-dossier__unavailable">Unavailable</span>
              ) : profile.isLoading ? (
                <Mono>Loading…</Mono>
              ) : (
                <Mono>
                  {profile.data?.counts.records ?? 0} records · {profile.data?.counts.skills ?? 0}{' '}
                  skills
                </Mono>
              )}
            </dd>
          </div>
        </dl>
      </div>
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
            <Button size="sm" onClick={() => void rec.refetch()}>
              Retry record
            </Button>
          }
        >
          Showing the last verified dossier while the latest record is unavailable.
        </Banner>
      )}
      {sum.isError && sum.data && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="Relationship intelligence is unavailable"
          action={
            <Button size="sm" onClick={() => void sum.refetch()}>
              Retry strength
            </Button>
          }
        >
          Showing the last verified strength, cadence, topics, and favors.
        </Banner>
      )}
      {profile.isError && profile.data && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="Profile evidence is unavailable"
          action={
            <Button size="sm" onClick={() => void profile.refetch()}>
              Retry evidence
            </Button>
          }
        >
          Showing the last verified career records and skills.
        </Banner>
      )}

      {editing && <NodeFormDialog open onOpenChange={setEditing} type="person" nodeId={id} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Move “${node.title}” to trash?`}
        body="It stays recoverable from Trash for 30 days; connections are preserved."
        confirmLabel={remove.isPending ? 'Moving…' : 'Move to trash'}
        destructive
        busy={remove.isPending}
        onConfirm={() => {
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
                <Button size="sm" onClick={() => setEditingRel(true)}>
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
                  <div className="stack network-fact-list">
                    {rel?.relation && (
                      <div className="spread">
                        <span className="u-muted">Relation</span>
                        <Chip>{personRelationLabel(rel.relation)}</Chip>
                      </div>
                    )}
                    <div className="spread">
                      <span className="u-muted">Closeness</span>
                      {rel?.edgeId ? (
                        <button
                          type="button"
                          className="person__editable"
                          // Distinct from the region's own "Edit relationship":
                          // two controls with the same accessible name in one
                          // region is ambiguous to anyone navigating by name.
                          aria-label="Edit closeness"
                          title="Edit closeness"
                          onClick={() => setEditingRel(true)}
                        >
                          <ClosenessDots value={rel.closeness} />
                        </button>
                      ) : (
                        <ClosenessDots value={rel?.closeness ?? null} />
                      )}
                    </div>
                    <div className="spread">
                      <span className="u-muted">Cadence target</span>
                      <Mono
                        style={{
                          color:
                            rel?.cadenceTargetDays != null &&
                            s.daysSinceLast != null &&
                            s.daysSinceLast > rel.cadenceTargetDays
                              ? 'var(--ae-warning)'
                              : undefined,
                        }}
                      >
                        {rel?.cadenceTargetDays ? `${rel.cadenceTargetDays}d` : '—'}
                      </Mono>
                    </div>
                    {s.daysSinceLast != null && (
                      <div className="spread">
                        <span className="u-muted">Quiet</span>
                        <Mono>{Math.round(s.daysSinceLast)}d</Mono>
                      </div>
                    )}
                    {s.medianGapDays != null && (
                      <div className="spread">
                        <span className="u-muted">Median gap</span>
                        <Mono>{Math.round(s.medianGapDays)}d</Mono>
                      </div>
                    )}
                    {rel?.doNotPing && (
                      <div className="spread">
                        <span className="u-muted">Reconnect</span>
                        <Chip tone="warning">do not ping</Chip>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                glyph="interaction"
                title="No relationship signal yet"
                hint="Log an interaction or set closeness to give this relationship a traceable strength."
                action={
                  <Button size="sm" onClick={() => setLogging(true)}>
                    Log first interaction
                  </Button>
                }
              />
            )}
          </Section>

          {/* What this person has actually done - their own records only. */}
          <Section
            title="Profile"
            meta={profile.data ? `${profile.data.counts.records} records` : '…'}
          >
            {profileUnavailable ? (
              <ErrorState
                title="Profile evidence could not be loaded"
                detail={(profile.error as Error | null)?.message}
                onRetry={() => void profile.refetch()}
                retryLabel="Retry evidence"
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
                {(profile.data?.sections ?? []).map((section) => (
                  <div key={section.type} className="stack network-profile-ledger__group">
                    <div className="network-profile-ledger__label">
                      {section.label} <Mono className="u-faint">{section.entries.length}</Mono>
                    </div>
                    {section.entries.slice(0, 8).map((entry) => (
                      <Link
                        key={entry.id}
                        to={entityHref(section.type, entry.id)}
                        className="spread u-link network-profile-ledger__entry"
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
                    ))}
                    {section.entries.length > 8 ? (
                      <span className="network-profile-ledger__more">
                        + {section.entries.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ))}
                {(profile.data?.skills ?? []).length > 0 ? (
                  <div className="stack network-profile-ledger__group">
                    <div className="network-profile-ledger__label">
                      Skills <Mono className="u-faint">{profile.data?.skills.length ?? 0}</Mono>
                    </div>
                    <div className="chips">
                      {(profile.data?.skills ?? []).slice(0, 24).map((s) => (
                        <Chip key={s.id}>{s.name}</Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Section>

          {/* Contact + topics */}
          <Section title="Details">
            <div className="stack network-fact-list">
              <div className="spread">
                <span className="u-muted">Email</span>
                <Mono>
                  {(props.email as string) ?? ((props.emails as string[]) ?? [])[0] ?? '—'}
                </Mono>
              </div>
              <div className="spread">
                <span className="u-muted">Phone</span>
                <Mono>{(props.phone as string) ?? '—'}</Mono>
              </div>
              <div className="spread">
                <span className="u-muted">City</span>
                <Mono>{(props.city as string) ?? '—'}</Mono>
              </div>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <span className="u-muted">Topics</span>
                <div className="chips">
                  {(rel?.topics ?? []).length === 0 ? (
                    <span className="u-faint">-</span>
                  ) : (
                    (rel?.topics ?? []).map((t) => <Chip key={t}>{t}</Chip>)
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* Favor ledger */}
          <Section
            title="Favor ledger"
            meta={openFavors.length ? `${openFavors.length} open` : 'balanced'}
          >
            {favors.length === 0 && (
              <p className="network-section-note">
                No favors recorded. Add only a concrete commitment you would be comfortable acting
                on later.
              </p>
            )}
            {favors.map((f, i) => (
              <div key={f.id ?? `favor-${i}`} className="row network-favor">
                {/* Never colour alone: the direction is spelled out. */}
                <Chip tone={f.direction === 'owed_to_me' ? 'success' : 'warning'}>
                  {f.direction === 'owed_to_me' ? 'They owe you' : 'You owe them'}
                </Chip>
                <div className="row__main">
                  <div
                    className="row__title"
                    style={
                      f.settled
                        ? { textDecoration: 'line-through', color: 'var(--ae-faint)' }
                        : undefined
                    }
                  >
                    {f.what || '(no description)'}
                  </div>
                </div>
                {!f.settled &&
                  (f.id ? (
                    <Button
                      size="sm"
                      disabled={settleFavor.isPending}
                      onClick={() => settleFavor.mutate(f.id!)}
                    >
                      {settleFavor.isPending && settleFavor.variables === f.id
                        ? 'Settling…'
                        : 'Settle'}
                    </Button>
                  ) : (
                    <span
                      className="font-mono text-xs text-faint"
                      title="This favor predates the ledger's ids, so there is nothing to address. Re-add it to settle it."
                    >
                      not settleable
                    </span>
                  ))}
              </div>
            ))}
            <div className="hstack network-favor__composer">
              <Input
                className="input"
                aria-label="Favor description"
                placeholder="e.g. Owes you an intro to Yara"
                value={favorNote}
                onChange={(e) => setFavorNote(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!favorNote.trim() || addFavor.isPending}
                onClick={() => addFavor.mutate('owed_to_me')}
              >
                {addFavor.isPending && addFavor.variables === 'owed_to_me'
                  ? 'Recording…'
                  : 'They owe'}
              </Button>
              <Button
                size="sm"
                disabled={!favorNote.trim() || addFavor.isPending}
                onClick={() => addFavor.mutate('owed_by_me')}
              >
                {addFavor.isPending && addFavor.variables === 'owed_by_me' ? 'Recording…' : 'I owe'}
              </Button>
            </div>
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
                  <Button size="sm" onClick={() => setLogging(true)}>
                    Log interaction
                  </Button>
                }
              />
            ) : (
              <>
                <ul className="m-0 list-none p-0">
                  {shownInteractions.map((i) => (
                    <li key={i.id}>
                      <Link
                        to={entityHref('interaction', i.id)}
                        className="-mx-2 flex min-h-9 items-center gap-3 rounded-sm border-b border-hairline px-2 py-2 text-ink no-underline last:border-b-0 hover:bg-raised hover:no-underline network-interaction"
                      >
                        <EntityGlyph type="interaction" size="sm" />
                        {/* Kind and date were both in the payload and neither
                            was shown - a relationship log with no "when" on it
                            cannot answer the question the page exists for. */}
                        {i.kind && <Chip mono>{i.kind}</Chip>}
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <Mono className="text-xs text-muted">
                          {i.at ? i.at.slice(0, 10) : 'undated'}
                        </Mono>
                      </Link>
                    </li>
                  ))}
                </ul>
                {interactions.length > INTERACTION_PAGE && (
                  <button
                    type="button"
                    className="mt-2 min-h-8 text-sm text-muted hover:text-ink-strong"
                    onClick={() => setShowAllInteractions((v) => !v)}
                  >
                    {showAllInteractions
                      ? 'Show recent only'
                      : `Show all ${interactions.length} interactions`}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section
            title="Connections"
            meta={relationEdges.length}
            actions={
              <>
                <BulkUnlinkBar
                  selectedCount={bulk.selectedCount}
                  onClear={bulk.clear}
                  onUnlink={() => bulk.setConfirmUnlink(true)}
                />
                <Button size="sm" glyph="plus" onClick={() => setAddingConn(true)}>
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
                  <Button size="sm" onClick={() => setAddingConn(true)}>
                    Add first connection
                  </Button>
                }
              />
            ) : (
              <>
                <SelectAllRow
                  allSelected={allVisibleSelected}
                  onToggle={() => bulk.toggleAll(edgeIds, allVisibleSelected)}
                />
                {relationEdges.map((e) => (
                  <ConnectionRow
                    key={e.id}
                    edge={e}
                    nodeId={node.id}
                    neighbors={neighbors}
                    selected={bulk.isSelected(e.id)}
                    onToggleSelect={() => bulk.toggleOne(e.id)}
                  />
                ))}
              </>
            )}
          </Section>
        </div>
      </div>

      {logging && (
        <InteractionLogger
          personId={id}
          personName={node.title}
          onClose={() => setLogging(false)}
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
        busy={bulk.busy}
        onConfirm={() => {
          void bulk.unlinkSelected();
        }}
      />
    </div>
  );
}
