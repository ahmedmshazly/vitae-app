import { useState } from 'react';
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [editing, setEditing] = useState(false);
  const [addingConn, setAddingConn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['org', id],
    queryFn: () => api.get<{ org: OrgProfile }>(`/orgs/${id}`),
  });

  // Was a bare `void del()`: outside useMutation it never reached the global
  // error toast, the dialog closed before it settled, and a failed delete left
  // the page looking as though nothing had been asked of it.
  const remove = useMutation({
    mutationFn: () => api.del(`/nodes/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries();
      flash('Moved to trash');
      navigate('/data/trash');
    },
    onError: (err) =>
      flash(err instanceof Error ? err.message : 'The organization could not be moved to trash.', {
        variant: 'error',
      }),
  });

  if (isError && !data) {
    return (
      <div className="page page--network page--organization-dossier">
        <PageHeader title="Organization" />
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
      <div className="network-dossier network-dossier--organization">
        <PageHeader
          title={org.title}
          subtitle={[org.kind, org.domain, org.city].filter(Boolean).join(' · ') || 'Organization'}
          actions={
            <>
              <Button size="sm" glyph="edit" onClick={() => setEditing(true)}>
                Edit record
              </Button>
              <Button size="sm" variant="primary" glyph="plus" onClick={() => setAddingConn(true)}>
                Add connection
              </Button>
              <Button
                variant="danger"
                size="sm"
                glyph="trash"
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </>
          }
        />
        <dl className="network-dossier__facts" aria-label="Organization relationship facts">
          <div>
            <dt>Known people</dt>
            <dd>
              <Mono>{org.peopleCount}</Mono>
            </dd>
          </div>
          <div>
            <dt>Affinity</dt>
            <dd>
              <Mono>{org.affinity.toFixed(2)}</Mono>
            </dd>
          </div>
          <div>
            <dt>Open roles</dt>
            <dd>
              <Mono>{org.openRoles}</Mono>
              {org.openRoles > 0 && <span> worth reviewing</span>}
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{org.city || 'Not recorded'}</dd>
          </div>
        </dl>
        <div className="network-dossier__decision">
          <p>
            Affinity summarizes recorded people and relationships on a 0–1 scale. Use the evidence
            below before acting on the number.
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

      {isFetching && (
        <StatusTrace
          className="network-trace"
          tone="live"
          label="Refreshing this organization"
          detail="Keeping verified relationship facts in view"
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
          Showing the last verified organization dossier.
        </Banner>
      )}

      {editing && <NodeFormDialog open onOpenChange={setEditing} type="organization" nodeId={id} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Move '${org.title}' to trash?`}
        body="It stays recoverable from Trash for 30 days; connections are preserved."
        confirmLabel={remove.isPending ? 'Moving...' : 'Move to trash'}
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <AddConnection
        open={addingConn}
        onOpenChange={setAddingConn}
        nodeId={id}
        nodeType="organization"
        nodeTitle={org.title}
      />

      <Section title="Related organizations" meta={org.relatedOrgs.length}>
        {org.relatedOrgs.length === 0 ? (
          <EmptyState
            glyph="org"
            title="No org links yet"
            hint="Use Add connection → Related org to record a parent, partner or competitor."
          />
        ) : (
          <ul className="network-rows" aria-label="Related organizations">
            {org.relatedOrgs.map((r) => (
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
                          ? `${orgRelationKindLabel(r.kind)} of this org`
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

      <div className="grid gap-x-8 lg:grid-cols-2 network-org-grid">
        <Section title="Inroads" meta={org.inroads.length}>
          {org.inroads.length === 0 ? (
            <EmptyState
              glyph="person"
              title="No inroads yet"
              hint="Capture people who work here and Vitae ranks who to ask first."
            />
          ) : (
            /* Ordered, because the ranking is the point of this section. */
            <ol className="network-rows" aria-label="Inroads, strongest first">
              {org.inroads.map((i) => (
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
                    <StrengthBar value={i.person.strength} label="tie strength" />
                  </Link>
                </li>
              ))}
            </ol>
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
              {org.roles.map((r) => (
                <li key={r.id}>
                  <Link to={entityHref('role', r.id)} className="row">
                    <EntityGlyph type="role" size="sm" />
                    <div className="row__main">
                      <div className="row__title">{r.title}</div>
                      <div className="row__sub">{r.holder ?? 'no one on record'}</div>
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
        </Section>
      </div>
    </div>
  );
}
