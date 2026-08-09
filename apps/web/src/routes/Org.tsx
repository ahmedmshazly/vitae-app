import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  SkeletonRows,
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

export function Org() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [editing, setEditing] = useState(false);
  const [addingConn, setAddingConn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
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
      navigate('/trash');
    },
    onError: (err) =>
      flash(err instanceof Error ? err.message : 'The organization could not be moved to trash.', {
        variant: 'error',
      }),
  });

  if (isError) {
    return (
      <div className="page">
        <PageHeader title="Organization" />
        <RegisterRule />
        <ErrorState
          title="Couldn’t load this organization"
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title="Organization" subtitle="Loading…" />
        <RegisterRule />
        <SkeletonRows rows={5} />
      </div>
    );
  }
  const org = data.org;

  return (
    <div className="page">
      <PageHeader
        title={org.title}
        subtitle={
          <>
            {[org.kind, org.domain, org.city].filter(Boolean).join(' · ') || 'Organization'}
            {' · '}
            <Mono className="text-faint">{org.peopleCount}</Mono> known
            {' · affinity '}
            <Mono className="text-faint">{org.affinity.toFixed(2)}</Mono>
          </>
        }
        actions={
          <>
            {/* Open roles are computed by the API and shown on the Orgs list,
                but the profile never rendered them, so the one fact that makes
                an org worth acting on vanished the moment you opened it. */}
            {org.openRoles > 0 && (
              <Chip tone="accent" mono glyph="role">
                {org.openRoles} open {org.openRoles === 1 ? 'role' : 'roles'}
              </Chip>
            )}
            <Button size="sm" glyph="edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" glyph="plus" onClick={() => setAddingConn(true)}>
              Add connection
            </Button>
            <Button variant="danger" size="sm" glyph="trash" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        }
      />
      {/* An organization has no revision-like scale to encode, so the rule
          carries no ticks rather than faked ones. */}
      <RegisterRule />

      {editing && <NodeFormDialog open onOpenChange={setEditing} type="organization" nodeId={id} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Move “${org.title}” to trash?`}
        body="It stays recoverable from Trash for 30 days; connections are preserved."
        confirmLabel="Move to trash"
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
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
          org.relatedOrgs.map((r) => (
            <Link key={r.edgeId} to={entityHref('organization', r.id)} className="row">
              <EntityGlyph type="organization" size="sm" />
              <div className="row__main">
                <div className="row__title">{r.title}</div>
                <div className="row__sub">
                  {/* Direction as a word: a bare arrow made the reader work out
                      which way a parent/subsidiary link pointed. */}
                  {[
                    r.direction === 'in' ? `${orgRelationKindLabel(r.kind)} of this org` : orgRelationKindLabel(r.kind),
                    r.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Chip mono>{orgRelationKindLabel(r.kind)}</Chip>
            </Link>
          ))
        )}
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Inroads" meta={org.inroads.length}>
          {org.inroads.length === 0 ? (
            <EmptyState
              glyph="person"
              title="No inroads yet"
              hint="Capture people who work here and Vitae ranks who to ask first."
            />
          ) : (
            org.inroads.map((i) => (
              <Link key={i.person.id} to={entityHref('person', i.person.id)} className="row">
                <Mono className="w-5 text-faint">{i.rank}</Mono>
                <EntityGlyph type="person" size="sm" />
                <div className="row__main">
                  <div className="row__title">{i.person.title}</div>
                  <div className="row__sub">{i.person.headline ?? i.reason}</div>
                </div>
                {/* Was accent above 0.6 and muted below, two colours banding a
                    continuous value. One hue, and the number is always there. */}
                <StrengthBar value={i.person.strength} label="tie strength" />
              </Link>
            ))
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
            org.roles.map((r) => (
              <Link key={r.id} to={entityHref('role', r.id)} className="row">
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
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
