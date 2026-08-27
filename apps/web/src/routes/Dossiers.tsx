/**
 * Dossiers (SRS FR-DOS-001, FR-DOS-002): every named selection of evidence
 * about you, and the door to making another one.
 *
 * A dossier is about one person, so this list is the dossiers whose subject is
 * the self record. That is a real dependency rather than a convenience: without
 * a self record there is no subject to make one about, and the screen says so
 * instead of showing an empty list that looks like a graph with no dossiers in
 * it.
 *
 * The audience choice is the whole shape of the document that follows, so the
 * picker shows each audience's sections and what each one is for. Those come
 * from `/dossiers/audiences`; this file knows none of them.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Sheet,
  SkeletonRows,
} from '@vitae/ui';
import type { Dossier, DossierAudience } from '@vitae/core';
import { api } from '../lib/api.js';
import { useSelfPerson } from '../features/forms/SubjectPicker.js';
import { audiencePhrase, useDossierAudiences } from '../features/DossierGrammar.js';
import { useToast } from '../features/Toast.js';

function claimCount(dossier: Dossier): number {
  return dossier.sections.reduce((total, section) => total + section.claims.length, 0);
}

export function Dossiers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const self = useSelfPerson();
  const [createOpen, setCreateOpen] = useState(false);
  const [audience, setAudience] = useState<DossierAudience | null>(null);
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Held as a const so the "there is a self record" narrowing survives into the
  // row callback below; reading self.data there would widen it back to nullable.
  const me = self.data ?? null;
  const selfId = me?.id;
  const dossiers = useQuery({
    queryKey: ['dossiers', selfId],
    queryFn: () => api.get<{ dossiers: Dossier[] }>(`/dossiers?subjectNode=${selfId}`),
    enabled: Boolean(selfId),
  });
  const audiences = useDossierAudiences();
  const rows = dossiers.data?.dossiers ?? [];

  const create = useMutation({
    mutationFn: async () => {
      if (!selfId) throw new Error('There is no self record to make a dossier about.');
      if (!audience) throw new Error('Choose the audience this dossier is written for.');
      if (!title.trim()) throw new Error('Give this dossier a title.');
      // Both ends or neither. A window with one date open would claim a period
      // nobody stated, and the schema would refuse it anyway.
      if (Boolean(from) !== Boolean(to)) {
        throw new Error('A window needs both a start and an end, or neither.');
      }
      return api.post<{ dossier: Dossier }>('/dossiers', {
        subject_node: selfId,
        audience,
        title: title.trim(),
        ...(from && to ? { window: { from, to } } : {}),
        sections: [],
      });
    },
    onSuccess: async (res) => {
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['dossiers'] });
      flash('Dossier created');
      navigate(`/career/dossiers/${res.dossier.id}`);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'The dossier was not created.');
    },
  });

  function startCreate() {
    setAudience(null);
    setTitle('');
    setFrom('');
    setTo('');
    setFormError(null);
    setCreateOpen(true);
  }

  return (
    <div className="page">
      <PageHeader
        title="Dossiers"
        subtitle="A named selection of evidence about one person, compiled into a document whose every sentence resolves to the records behind it."
        help={
          <InfoPopover title="What a dossier is">
            <p>
              A dossier holds claims, and every claim names the records it rests on. Compiling one
              produces the document and a provenance appendix in which each cited record is
              resolved back to its source, its confidence and its full revision trail. Nothing is
              inferred, summarised or generated: a dossier asserts only what you wrote and pointed
              at.
            </p>
          </InfoPopover>
        }
        actions={
          <Button variant="primary" glyph="plus" onClick={startCreate} disabled={!selfId}>
            New dossier
          </Button>
        }
      />
      <RegisterRule />

      {self.isError ? (
        <ErrorState
          title="Couldn’t check whose dossiers these are"
          detail={(self.error as Error | null)?.message}
          onRetry={() => void self.refetch()}
        />
      ) : self.isPending ? (
        <div role="status" aria-label="Loading your dossiers">
          <SkeletonRows rows={4} />
        </div>
      ) : !me ? (
        <EmptyState
          glyph="person"
          title="No self record yet"
          hint="A dossier is about one person, and Vitae does not yet know which record is you. Set that first, and this list becomes yours."
          action={
            <Link className="vt-btn vt-btn--primary" to="/settings/profile">
              Open Profile settings
            </Link>
          }
        />
      ) : dossiers.isError ? (
        <ErrorState
          title="Couldn’t load your dossiers"
          detail={(dossiers.error as Error | null)?.message}
          onRetry={() => void dossiers.refetch()}
        />
      ) : dossiers.isPending ? (
        <div role="status" aria-label="Loading your dossiers">
          <SkeletonRows rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          glyph="document"
          title="No dossiers yet"
          hint="Pick the audience a document is written for, and its sections tell you what evidence it wants."
          action={
            <Button variant="primary" onClick={startCreate}>
              New dossier
            </Button>
          }
        />
      ) : (
        // Newest first is the server's ordering, on updated_at. A dossier you
        // touched a minute ago is the one you came back for.
        <ul className="m-0 list-none p-0" aria-label="Dossiers, most recently changed first">
          {rows.map((dossier) => {
            const claims = claimCount(dossier);
            return (
              <li
                key={dossier.id}
                className="row flex min-h-9 flex-wrap items-center gap-3 border-b border-hairline py-2 last:border-b-0"
              >
                <div className="row__main">
                  <div className="row__title">
                    <Link to={`/career/dossiers/${dossier.id}`}>{dossier.title}</Link>
                  </div>
                  <div className="row__sub">
                    about {me.title} · {dossier.sections.length}{' '}
                    {dossier.sections.length === 1 ? 'section' : 'sections'} · {claims}{' '}
                    {claims === 1 ? 'entry' : 'entries'} · changed{' '}
                    <Mono>{dossier.updated_at.slice(0, 10)}</Mono>
                  </div>
                </div>
                <Chip>{audiencePhrase(dossier.audience)}</Chip>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={createOpen}
        onOpenChange={(open) => !open && setCreateOpen(false)}
        title="New dossier"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <span className="flex-1" />
            <Button
              variant="primary"
              disabled={create.isPending || !audience || !title.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Creating…' : 'Create dossier'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <Banner tone="danger" title="This dossier was not created">
              {formError}
            </Banner>
          )}

          <Field label="Title" htmlFor="dossier-new-title" required>
            <Input
              id="dossier-new-title"
              placeholder="What this packet is for…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <fieldset className="entity-form__section">
            <legend className="entity-form__legend">Audience</legend>
            {/* The audience decides the sections, so the choice is made with
                them in view rather than from three names. */}
            {audiences.isError ? (
              <ErrorState
                title="Couldn’t load the audiences"
                detail={(audiences.error as Error | null)?.message}
                onRetry={() => void audiences.refetch()}
              />
            ) : audiences.isPending ? (
              <div role="status" aria-label="Loading audiences">
                <SkeletonRows rows={3} />
              </div>
            ) : (
              (audiences.data ?? []).map((entry) => {
                const phrase = audiencePhrase(entry.audience);
                const sectionsId = `dossier-audience-${entry.audience}-sections`;
                return (
                  <div key={entry.audience} className="border-b border-hairline py-3 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`dossier-audience-${entry.audience}`}
                        name="dossier-audience"
                        value={entry.audience}
                        checked={audience === entry.audience}
                        aria-describedby={sectionsId}
                        onChange={() => setAudience(entry.audience)}
                      />
                      <label
                        className="text-sm font-semibold text-ink-strong"
                        htmlFor={`dossier-audience-${entry.audience}`}
                      >
                        {phrase}
                      </label>
                    </div>
                    <ol
                      className="m-0 mt-2 list-none p-0"
                      id={sectionsId}
                      aria-label={`Sections of a ${phrase} dossier`}
                    >
                      {entry.sections.map((section) => (
                        <li key={section.id} className="py-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm">{section.heading}</strong>
                            <Chip>{section.required ? 'required' : 'optional'}</Chip>
                          </span>
                          <span className="block text-sm text-muted">{section.purpose}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })
            )}
          </fieldset>

          {/* Optional, and it stays optional. A dossier with no window makes no
              claim about a period, which is not the same as claiming all time. */}
          <Field
            label="Window start"
            htmlFor="dossier-new-from"
            help="Optional. Leave both dates blank to make no claim about a period."
          >
            <Input
              id="dossier-new-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Window end" htmlFor="dossier-new-to" help="Optional.">
            <Input
              id="dossier-new-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
