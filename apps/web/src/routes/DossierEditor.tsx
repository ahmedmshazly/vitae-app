/**
 * One dossier: the selection you edit, and the document it compiles to
 * (SRS FR-DOS-001, FR-DOS-002).
 *
 * The compiled model is fetched whole and shown whole, including when it does
 * not satisfy its grammar. That is deliberate on both sides of the wire: the
 * server answers `/compile` rather than erroring, and this screen lists the
 * violations as named work instead of replacing the packet with a red wall. An
 * operator opens this page precisely because something is missing, and hiding
 * the half that is already right helps nobody.
 *
 * The two kinds of trouble are not the same and are not phrased the same. A
 * citation whose record is gone is a fact the appendix prints, and the document
 * still compiles. A missing required section means the packet is not yet the
 * thing it claims to be. `blocking` is the server's word for that difference
 * and this screen repeats it rather than deciding for itself.
 *
 * Nothing here holds a copy of the grammar. Section headings, purposes and
 * limits arrive from `/dossiers/audiences`, so a rule changed on the server is
 * a rule changed on this form.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import type { Dossier, DossierSection, DossierSectionGrammar } from '@vitae/core';
import { ApiError, api } from '../lib/api.js';
import {
  DossierAppendix,
  appendixEntryId,
  appendixKey,
  type CitedRecord,
} from '../features/DossierAppendix.js';
import {
  DossierClaimForm,
  type ClaimDraft,
} from '../features/DossierClaimForm.js';
import {
  admitsSentence,
  audiencePhrase,
  citationsSentence,
  claimsSentence,
  newClaimId,
  useDossierAudiences,
  withClaimAdded,
  withClaimRemoved,
} from '../features/DossierGrammar.js';
import { useToast } from '../features/Toast.js';

interface CompiledClaim {
  id: string;
  text: string;
  cites: CitedRecord[];
}

interface CompiledSection {
  grammar_id: string;
  heading: string;
  purpose: string;
  claims: CompiledClaim[];
}

interface DossierViolation {
  rule: string;
  section: string;
  claim?: string;
  message: string;
}

interface CompiledDossier {
  dossier: Dossier;
  subject: { id: string; title: string } | null;
  sections: CompiledSection[];
  appendix: CitedRecord[];
  violations: DossierViolation[];
  blocking: boolean;
}

const APPENDIX_PREFIX = 'dossier';

export function DossierEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const compile = useQuery({
    queryKey: ['dossier', id, 'compile'],
    queryFn: () => api.get<CompiledDossier>(`/dossiers/${id}/compile`),
  });
  const audiences = useDossierAudiences();

  const compiled = compile.data ?? null;
  const dossier = compiled?.dossier ?? null;
  const grammar: DossierSectionGrammar[] = useMemo(() => {
    if (!dossier) return [];
    return audiences.data?.find((entry) => entry.audience === dossier.audience)?.sections ?? [];
  }, [audiences.data, dossier]);

  /** Where each cited record sits in the appendix, so a claim can point at it. */
  const appendixPosition = useMemo(() => {
    const positions = new Map<string, number>();
    (compiled?.appendix ?? []).forEach((record, index) => {
      positions.set(appendixKey(record), index + 1);
    });
    return positions;
  }, [compiled]);

  /** Violations that name one entry, so the entry can carry its own. */
  const violationsByClaim = useMemo(() => {
    const byClaim = new Map<string, DossierViolation[]>();
    for (const violation of compiled?.violations ?? []) {
      if (!violation.claim) continue;
      byClaim.set(violation.claim, [...(byClaim.get(violation.claim) ?? []), violation]);
    }
    return byClaim;
  }, [compiled]);

  const headingFor = (grammarId: string): string =>
    grammar.find((section) => section.id === grammarId)?.heading ??
    compiled?.sections.find((section) => section.grammar_id === grammarId)?.heading ??
    grammarId;

  const save = useMutation({
    mutationFn: (sections: DossierSection[]) => {
      if (!dossier) throw new Error('This dossier is not loaded yet.');
      // expected_rev makes a concurrent edit a refusal rather than a silent
      // overwrite of whatever the other window had already stored.
      return api.patch<{ dossier: Dossier }>(`/dossiers/${id}`, {
        sections,
        expected_rev: dossier.rev,
      });
    },
    onSuccess: async () => {
      setSaveError(null);
      setConflict(null);
      await qc.invalidateQueries({ queryKey: ['dossier', id] });
      await qc.invalidateQueries({ queryKey: ['dossiers'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(error.message);
        setSaveError(null);
        return;
      }
      setConflict(null);
      setSaveError(error instanceof Error ? error.message : 'The change was not stored.');
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ dossier: Dossier }>(`/dossiers/${id}`),
    onSuccess: async () => {
      setConfirmDelete(false);
      await qc.invalidateQueries({ queryKey: ['dossiers'] });
      flash('Dossier deleted');
      navigate('/career/dossiers');
    },
    onError: (error) => {
      setConfirmDelete(false);
      setSaveError(error instanceof Error ? error.message : 'The dossier was not deleted.');
    },
  });

  async function addClaim(grammarId: string, draft: ClaimDraft): Promise<boolean> {
    if (!dossier) return false;
    const claim = {
      id: newClaimId(),
      text: draft.text,
      cites: draft.cites.map((cite) => ({ kind: cite.kind, id: cite.id })),
    };
    try {
      await save.mutateAsync(withClaimAdded(dossier.sections, grammarId, claim));
      flash('Entry added');
      return true;
    } catch {
      // Reported by the mutation's onError, above the form, with the draft
      // still in it so nothing the operator typed is lost.
      return false;
    }
  }

  function removeClaim(grammarId: string, claimId: string) {
    if (!dossier) return;
    save.mutate(withClaimRemoved(dossier.sections, grammarId, claimId));
  }

  const notFound = compile.error instanceof ApiError && compile.error.status === 404;

  if (compile.isPending) {
    return (
      <div className="page">
        <PageHeader title="Dossier" subtitle="Loading the selection and what it compiles to." />
        <RegisterRule />
        <div role="status" aria-label="Loading this dossier">
          <SkeletonRows rows={6} />
        </div>
      </div>
    );
  }

  if (compile.isError || !compiled || !dossier) {
    return (
      <div className="page">
        <PageHeader title="Dossier" />
        <RegisterRule />
        <ErrorState
          title={notFound ? 'This dossier no longer exists' : "Couldn't compile this dossier"}
          detail={
            notFound
              ? 'It was deleted, or the address is wrong. Your other dossiers are still listed.'
              : ((compile.error as Error | null)?.message ?? 'The request did not come back.')
          }
          onRetry={notFound ? undefined : () => void compile.refetch()}
          action={
            <Link className="vt-btn vt-btn--sm" to="/career/dossiers">
              Back to dossiers
            </Link>
          }
        />
      </div>
    );
  }

  const storedByGrammar = new Map(
    dossier.sections.map((section) => [section.grammar_id, section] as const),
  );

  return (
    <div className="page">
      <PageHeader
        title={dossier.title}
        subtitle={
          <>
            {audiencePhrase(dossier.audience)} · about{' '}
            {compiled.subject ? (
              <Link to={`/network/people/${compiled.subject.id}`}>{compiled.subject.title}</Link>
            ) : (
              // The subject is a live person when a dossier is created, so this
              // says the record went away afterwards rather than that the
              // dossier was made about nobody.
              <span>a subject record that has since been removed</span>
            )}
            {dossier.window && (
              <>
                {' '}
                · <Mono>{dossier.window.from}</Mono> to <Mono>{dossier.window.to}</Mono>
              </>
            )}
          </>
        }
        help={
          <InfoPopover title="How this compiles">
            <p>
              Sections come out in the order this audience's grammar declares, and every citation
              is resolved against the live graph each time the document is asked for, so nothing
              here is a copy that can go stale. The appendix prints each cited record once, in the
              order it was first cited, with its source, its confidence and its revision trail.
            </p>
          </InfoPopover>
        }
        actions={
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        }
      />
      <RegisterRule />

      {conflict && (
        <Banner
          tone="danger"
          title="This dossier was changed somewhere else"
          action={
            <Button size="sm" onClick={() => void compile.refetch()}>
              Reload it
            </Button>
          }
        >
          {conflict} Your change was not stored, and nothing the other window wrote was overwritten.
        </Banner>
      )}
      {saveError && (
        <Banner tone="danger" title="That change was not stored">
          {saveError}
        </Banner>
      )}

      <Section title="Work to do" meta={compiled.violations.length}>
        {compiled.violations.length === 0 ? (
          <EmptyState
            glyph="check"
            title="This dossier satisfies its grammar"
            hint="Every section this audience requires is present, every entry is within its limits, and every cited record resolves."
          />
        ) : (
          <>
            {/* Warning, not danger, and the sentence says which of the two kinds
                of trouble this is. A withdrawn record still compiles into a
                document; a missing section does not. */}
            <Banner
              tone="warning"
              title={
                compiled.blocking
                  ? 'This is a selection, not yet a document'
                  : 'The document compiles, with evidence a reader cannot follow'
              }
            >
              {compiled.blocking
                ? 'The compiled view below is offered either way, so you can see the half that is already right.'
                : 'Every problem below is a cited record that is gone. The appendix prints each one, so the gap is stated rather than hidden.'}
            </Banner>
            <ul className="m-0 list-none p-0" aria-label="Outstanding work on this dossier">
              {compiled.violations.map((violation, index) => (
                <li
                  key={`${violation.rule}-${violation.section}-${violation.claim ?? ''}-${index}`}
                  className="flex min-h-9 flex-wrap items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                >
                  <Chip mono>{violation.rule.replace(/_/g, ' ')}</Chip>
                  <span className="row__main">
                    <span className="row__title">{headingFor(violation.section)}</span>
                    <span className="row__sub">{violation.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="The selection" meta={dossier.sections.length}>
        {audiences.isError ? (
          // The form is grammar-driven and there is no local copy to fall back
          // on, by design. The compiled view below still renders, because it
          // carries its own headings from the server.
          <ErrorState
            title="Couldn't load this audience's sections"
            detail={
              (audiences.error as Error | null)?.message ??
              'Without them there is no way to say what each section will admit.'
            }
            onRetry={() => void audiences.refetch()}
          />
        ) : audiences.isPending ? (
          <div role="status" aria-label="Loading the section grammar">
            <SkeletonRows rows={4} />
          </div>
        ) : grammar.length === 0 ? (
          <EmptyState
            glyph="alert"
            title="This audience has no sections"
            hint={`The server published no grammar for ${audiencePhrase(dossier.audience)}, so there is nothing to fill in.`}
          />
        ) : (
          grammar.map((section) => {
            const stored = storedByGrammar.get(section.id);
            const claims = stored?.claims ?? [];
            const compiledSection = compiled.sections.find(
              (candidate) => candidate.grammar_id === section.id,
            );
            const full = section.maxClaims !== null && claims.length >= section.maxClaims;
            return (
              <div key={section.id} className="mb-6 border-b border-hairline pb-5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-semibold text-ink-strong">{section.heading}</h3>
                  <Chip>{section.required ? 'required' : 'optional'}</Chip>
                  <Mono className="ml-auto text-xs text-muted">
                    {claims.length} {claims.length === 1 ? 'entry' : 'entries'}
                  </Mono>
                </div>
                <p className="mt-1 text-sm text-muted">{section.purpose}</p>
                <p className="text-sm text-muted">
                  {admitsSentence(section)} {claimsSentence(section)} {citationsSentence(section)}
                </p>

                {claims.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Nothing in this section yet.</p>
                ) : (
                  <ol className="m-0 mt-2 list-none p-0" aria-label={`Entries under ${section.heading}`}>
                    {claims.map((claim, index) => {
                      const resolved = compiledSection?.claims.find(
                        (candidate) => candidate.id === claim.id,
                      );
                      const claimViolations = violationsByClaim.get(claim.id) ?? [];
                      return (
                        <li key={claim.id} className="border-b border-hairline py-2 last:border-b-0">
                          <div className="flex flex-wrap items-start gap-3">
                            <Mono className="text-muted">{index + 1}.</Mono>
                            <p className="m-0 flex-1">{claim.text}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remove entry ${index + 1} from ${section.heading}`}
                              disabled={save.isPending}
                              onClick={() => removeClaim(section.id, claim.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {claim.cites.length === 0 ? (
                              <span className="text-sm text-muted">No evidence attached.</span>
                            ) : (
                              (resolved?.cites ?? []).map((record) => (
                                <Chip
                                  key={appendixKey(record)}
                                  tone={record.presence === 'live' ? 'default' : 'warning'}
                                >
                                  {record.label ?? record.id}
                                  {record.presence !== 'live' &&
                                    (record.presence === 'deleted'
                                      ? ' (withdrawn)'
                                      : ' (never existed)')}
                                </Chip>
                              ))
                            )}
                          </div>
                          {claimViolations.map((violation) => (
                            <p key={violation.rule} className="mt-1 text-sm text-muted">
                              {violation.message}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ol>
                )}

                <div className="mt-3">
                  <DossierClaimForm
                    section={section}
                    sectionFull={full}
                    busy={save.isPending}
                    onAdd={(draft) => addClaim(section.id, draft)}
                  />
                </div>
              </div>
            );
          })
        )}
      </Section>

      <Section title="The compiled document" meta={compiled.sections.length}>
        {compiled.sections.length === 0 ? (
          <EmptyState
            glyph="document"
            title="Nothing to compile yet"
            hint="A section with entries in it appears here, in the order this audience's grammar declares."
          />
        ) : (
          compiled.sections.map((section) => (
            <article key={section.grammar_id} className="mb-5">
              <h3 className="m-0 text-sm font-semibold text-ink-strong">{section.heading}</h3>
              <p className="mt-1 text-sm text-muted">{section.purpose}</p>
              <ol className="m-0 mt-2 list-none p-0" aria-label={`${section.heading}, as compiled`}>
                {section.claims.map((claim, index) => (
                  <li key={claim.id} className="py-2">
                    <span className="flex flex-wrap items-start gap-2">
                      <Mono className="text-muted">{index + 1}.</Mono>
                      <span className="flex-1">
                        {claim.text}{' '}
                        {claim.cites.map((record) => {
                          const position = appendixPosition.get(appendixKey(record));
                          if (!position) return null;
                          return (
                            // The marker is the whole promise of the format: it
                            // leads to the record, not to a footnote about it.
                            <a
                              key={appendixKey(record)}
                              className="u-mono"
                              href={`#${appendixEntryId(APPENDIX_PREFIX, position)}`}
                              aria-label={`Appendix entry ${position}, ${record.label ?? record.id}`}
                            >
                              [{position}]
                            </a>
                          );
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          ))
        )}
      </Section>

      <Section title="Provenance appendix" meta={compiled.appendix.length}>
        {compiled.appendix.length === 0 ? (
          <EmptyState
            glyph="document"
            title="No records cited yet"
            hint="Every record an entry rests on is printed here once, with where it came from and every revision it has been through."
          />
        ) : (
          <DossierAppendix records={compiled.appendix} idPrefix={APPENDIX_PREFIX} />
        )}
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
        title="Delete this dossier?"
        body="The selection is removed from your list. The records it cited are untouched."
        confirmLabel="Delete this dossier"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
