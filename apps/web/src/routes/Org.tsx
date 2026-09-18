import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Skeleton,
  SkeletonRows,
  StatusTrace,
  StrengthBar,
} from '@vitae/ui';
import { orgRelationKindLabel } from '@vitae/core';
import { api } from '../lib/api.js';
import { AddConnection } from '../features/forms/AddConnection.js';
import { NodeFormDialog } from '../features/forms/NodeFormDialog.js';
import { entityHref } from '../lib/entity-href.js';
import { useToast } from '../features/Toast.js';
import { EntityEvidence } from '../features/EntityEvidence.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import {
  OrganizationDetails,
  OrganizationConnections,
  useOrganizationRecord,
} from '../features/OrganizationRecord.js';

interface PersonItem {
  id: string;
  title: string;
  headline: string | null;
  strength: number;
}
interface OrgProfile {
  id: string;
  title: string;
  kind: string | null;
  domain: string | null;
  city: string | null;
  peopleCount: number;
  affinity: number;
  openRoles: number;
  inroads: Array<{ rank: number; person: PersonItem; reason: string }>;
  roles: Array<{ id: string; title: string; open: boolean; holder: string | null }>;
  relatedOrgs: Array<{
    id: string;
    title: string;
    kind: string;
    direction: 'out' | 'in';
    edgeId: string;
    note: string | null;
  }>;
}

export function contactLensHrefForOrg(title: string): string {
  const params = new URLSearchParams({ lens: 'contact', need: 'intro', org: title, run: '1' });
  return `/network/intelligence?${params.toString()}`;
}

export function reachLensHrefForOrg(id: string): string {
  const params = new URLSearchParams({ lens: 'reach', org: id });
  return `/network/intelligence?${params.toString()}`;
}

export function Org() {
  const { id = '' } = useParams();
  return <OrganizationDossier key={id} id={id} />;
}

function OrganizationDossier({ id }: { id: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();
  const deleting = useRef(false);
  const record = useOrganizationRecord(id);
  const [relatedLimit, setRelatedLimit] = useState(20);
  const [peopleLimit, setPeopleLimit] = useState(20);
  const [rolesLimit, setRolesLimit] = useState(20);
  const [editing, setEditing] = useState(false);
  const [addingConn, setAddingConn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['org', id],
    queryFn: async () => {
      const result = await api.get<{ org: OrgProfile }>(`/orgs/${id}`);
      if (
        !result.org ||
        !Array.isArray(result.org.inroads) ||
        !Array.isArray(result.org.roles) ||
        !Array.isArray(result.org.relatedOrgs)
      )
        throw new Error('The organization profile was incomplete. Try again.');
      return result;
    },
  });

  // Was a bare `void del()`: outside useMutation it never reached the global
  // error toast, the dialog closed before it settled, and a failed delete left
  // the page looking as though nothing had been asked of it.
  const remove = useMutation({
    mutationFn: () => {
      if (!canWrite) throw new Error(WRITE_LOCK_HINT);
      return api.del(`/nodes/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      flash('Moved to trash');
      navigate('/data/trash');
    },
    onError: (err) => {
      const message =
        (err instanceof Error && err.message.trim()) ||
        'The organization could not be moved to trash.';
      setDeleteError(message);
    },
    onSettled: () => {
      deleting.current = false;
    },
  });

  if (isError && !data) {
    return (
      <div className="page page--network page--organization-dossier">
        <PageHeader title="Organization" />
        <Link to="/network/organizations">Back to organizations</Link>
        <RegisterRule />
        <ErrorState
          title="Couldn't load this organization"
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </div>
    );
  }
  if (isLoading || !data) {
    // Shaped like the dossier that arrives: a sunken masthead over four fact
    // cells, then the sections. Five generic rows meant the page changed shape
    // at the moment the data landed.
    return (
      <div className="page page--network page--organization-dossier">
        <div className="network-dossier network-dossier--organization">
          <PageHeader title="Organization" subtitle="Loading..." />
          <div className="network-dossier__facts">
            {['people', 'affinity', 'roles', 'location'].map((cell) => (
              <div key={cell} className="grid gap-2">
                <Skeleton height={11} width="60%" />
                <Skeleton height={16} width="40%" />
              </div>
            ))}
          </div>
        </div>
        <RegisterRule />
        <SkeletonRows rows={3} label="Loading organization dossier" />
      </div>
    );
  }
  const org = data.org;

  return (
    <div className="page page--network page--organization-dossier">
      <Link className="organization-back" to="/network/organizations">
        All organizations
      </Link>
      <div className="network-dossier network-dossier--organization">
        <PageHeader
          title={org.title}
          subtitle={[org.kind, org.domain, org.city].filter(Boolean).join(' · ') || 'Organization'}
          actions={
            <>
              <Button
                size="sm"
                disabled={isFetching || remove.isPending}
                onClick={() => {
                  void refetch();
                  void record.refetch();
                }}
              >
                Refresh
              </Button>
              {canWrite && (
                <>
                  <Button size="sm" glyph="edit" onClick={() => setEditing(true)}>
                    Edit record
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    glyph="plus"
                    onClick={() => setAddingConn(true)}
                  >
                    Add connection
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    glyph="trash"
                    disabled={remove.isPending}
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmDelete(true);
                    }}
                  >
                    Move to trash
                  </Button>
                </>
              )}
            </>
          }
        />
        <dl className="network-dossier__facts" aria-label="Organization relationship facts">
          <div>
            <dt>Known people</dt>
            <dd>
              <Mono>{Number.isFinite(org.peopleCount) ? org.peopleCount : 'Unavailable'}</Mono>
            </dd>
          </div>
          <div>
            <dt>Affinity</dt>
            <dd>
              <Mono>{Number.isFinite(org.affinity) ? org.affinity.toFixed(2) : 'Unavailable'}</Mono>
            </dd>
          </div>
          <div>
            <dt>Open roles</dt>
            <dd>
              <Mono>{Number.isFinite(org.openRoles) ? org.openRoles : 'Unavailable'}</Mono>
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{org.city || 'Not recorded'}</dd>
          </div>
        </dl>
        <div className="network-dossier__decision">
          <p>
            Affinity reflects your ties to people here on a 0–1 scale. Open roles are records in
            Vitae, not a live job feed. Review the people and evidence before reaching out.
          </p>
          <nav aria-label={`Ways to reach ${org.title}`}>
            <Link className="vt-btn vt-btn--sm" to={contactLensHrefForOrg(org.title)}>
              Rank contacts
            </Link>
            <Link className="vt-btn vt-btn--sm" to={reachLensHrefForOrg(org.id)}>
              Trace warm paths
            </Link>
          </nav>
        </div>
      </div>
      {/* An organization has no revision-like scale to encode, so the rule
          carries no ticks rather than faked ones. */}
      <RegisterRule />
      {!canWrite && <p role="status">{WRITE_LOCK_HINT}</p>}
      <nav className="organization-sections" aria-label="Organization sections">
        <a href="#organization-details">Details</a>
        <a href="#organization-people">People and roles</a>
        <a href="#organization-related">Related organizations</a>
        <a href="#organization-connections">All connections</a>
        <a href="#organization-evidence">Evidence</a>
      </nav>

      {isFetching && (
        <StatusTrace
          className="network-trace"
          tone="live"
          label="Refreshing this organization"
          detail="Keeping the last available profile in view"
        />
      )}
      {isError && data && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="This organization could not be refreshed"
          action={
            <Button size="sm" disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? 'Retrying...' : 'Retry record'}
            </Button>
          }
        >
          Showing the last available organization profile.
        </Banner>
      )}

      {editing && canWrite && (
        <NodeFormDialog open onOpenChange={setEditing} type="organization" nodeId={id} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (deleting.current) return;
          setConfirmDelete(open);
          if (!open) setDeleteError(null);
        }}
        title={`Move '${org.title}' to trash?`}
        body={
          <>
            <p>It stays recoverable from Trash for 30 days; connections are preserved.</p>
            {deleteError && (
              <div className="organization-trash-error" role="alert">
                <strong>Couldn’t move this organization to Trash</strong>
                <p>
                  {deleteError} Your record is still here. Try again when the service is available.
                </p>
              </div>
            )}
          </>
        }
        confirmLabel={remove.isPending ? 'Moving...' : 'Move to trash'}
        destructive
        busy={remove.isPending}
        initialFocus="cancel"
        onConfirm={() => {
          if (!canWrite || deleting.current) return;
          deleting.current = true;
          setDeleteError(null);
          remove.mutate();
        }}
      />
      <AddConnection
        open={addingConn && canWrite}
        onOpenChange={setAddingConn}
        nodeId={id}
        nodeType="organization"
        nodeTitle={org.title}
      />

      <div id="organization-details">
        <OrganizationDetails query={record} />
      </div>
      <div className="organization-body">
        <div id="organization-people" className="grid gap-x-8 lg:grid-cols-2 network-org-grid">
          <Section title="People who can help" meta={org.inroads.length}>
            <p className="organization-hint">
              Ranked by your recorded relationship strength. The role links explain who is connected
              here; a ranking does not confirm someone can make an introduction.
            </p>
            {org.inroads.length === 0 ? (
              <EmptyState
                glyph="person"
                title="No inroads yet"
                hint="Capture people who work here and Vitae ranks who to ask first."
              />
            ) : (
              /* Ordered, because the ranking is the point of this section. */
              <ol className="network-rows" aria-label="Inroads, strongest first">
                {org.inroads.slice(0, peopleLimit).map((i) => (
                  <li key={i.person.id}>
                    <Link to={entityHref('person', i.person.id)} className="row network-inroad">
                      {/* The marker is drawn rather than rendered by the list,
                        because the rows are ruled and unbulleted. An aria-label
                        on a plain span names nothing, so the rank is spoken as
                        part of the row title instead. */}
                      <Mono className="w-5 text-faint" aria-hidden="true">
                        #{i.rank}
                      </Mono>
                      <EntityGlyph type="person" size="sm" />
                      <div className="row__main">
                        <div className="row__title">
                          {i.person.title}
                          <span className="sr-only">
                            , rank {i.rank} of {org.inroads.length}
                          </span>
                        </div>
                        {i.person.headline && <div className="row__sub">{i.person.headline}</div>}
                        <div className="network-inroad__reason">Why this inroad · {i.reason}</div>
                      </div>
                      {/* Was accent above 0.6 and muted below, two colours banding
                        a continuous value. One hue, and the number is always
                        there. */}
                      {Number.isFinite(i.person.strength) ? (
                        <StrengthBar value={i.person.strength} label="tie strength" />
                      ) : (
                        <span>Strength unavailable</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {org.inroads.length > peopleLimit && (
              <Button onClick={() => setPeopleLimit((value) => value + 20)}>
                Show more people
              </Button>
            )}
          </Section>

          <Section title="Roles" meta={org.roles.length}>
            {org.roles.length === 0 ? (
              <EmptyState
                glyph="role"
                title="No linked roles"
                hint="Link a role to record who works here, and which openings you are watching."
              />
            ) : (
              <ul className="network-rows" aria-label="Roles">
                {org.roles.slice(0, rolesLimit).map((r) => (
                  <li key={r.id}>
                    <Link to={entityHref('role', r.id)} className="row">
                      <EntityGlyph type="role" size="sm" />
                      <div className="row__main">
                        <div className="row__title">{r.title}</div>
                        <div className="row__sub">{r.holder ?? 'No holder recorded'}</div>
                      </div>
                      {r.open && (
                        <Chip tone="accent" mono glyph="role">
                          open
                        </Chip>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {org.roles.length > rolesLimit && (
              <Button onClick={() => setRolesLimit((value) => value + 20)}>Show more roles</Button>
            )}
          </Section>
        </div>
        <div id="organization-related">
          <Section title="Related organizations" meta={org.relatedOrgs.length}>
            {org.relatedOrgs.length === 0 ? (
              <EmptyState
                glyph="org"
                title="No related organizations yet"
                hint="Add a related-organization connection to record a parent, partner or competitor."
              />
            ) : (
              <ul className="network-rows" aria-label="Related organizations">
                {org.relatedOrgs.slice(0, relatedLimit).map((r) => (
                  <li key={r.edgeId}>
                    <Link to={entityHref('organization', r.id)} className="row">
                      <EntityGlyph type="organization" size="sm" />
                      <div className="row__main">
                        <div className="row__title">{r.title}</div>
                        <div className="row__sub">
                          {/* Direction as a word: a bare arrow made the reader work
                          out which way a parent/subsidiary link pointed. */}
                          {[
                            r.direction === 'in'
                              ? `${orgRelationKindLabel(r.kind)} of this organization`
                              : orgRelationKindLabel(r.kind),
                            r.note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      {/* The chip used to repeat the subtitle's own words. It
                      carries the differentiator instead: which way the link
                      points. */}
                      <Chip mono glyph="link">
                        {r.direction === 'in' ? 'inbound' : 'outbound'}
                      </Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {org.relatedOrgs.length > relatedLimit && (
            <Button onClick={() => setRelatedLimit((value) => value + 20)}>
              Show more related organizations
            </Button>
          )}
        </div>
      </div>
      <div id="organization-connections">
        <OrganizationConnections query={record} id={id} />
      </div>
      <div id="organization-evidence">
        <EntityEvidence entityId={org.id} />
      </div>
    </div>
  );
}
