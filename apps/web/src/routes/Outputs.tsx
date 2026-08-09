import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  Input,
  Mono,
  PageHeader,
  Select,
  Sheet,
  ErrorState,
  RegisterRule,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

interface Resume {
  id: string;
  name: string;
  target_id?: string;
  template_key: string;
  template_version?: string;
  status: string;
  pages: number | null;
  coverage: { weightedPct: number; gaps?: Array<{ term: string }> } | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  is_base?: boolean;
  target?: { company?: string; role_title?: string } | null;
  base_diff?: { added?: string[]; removed?: string[]; changed?: string[] } | null;
  artifact_ids?: { pdf?: string; tex?: string };
  selection?: { entries?: Array<{ atomId: string; text: string; emphasis: string }> };
  artifacts?: Array<{ artifact_kind: string; filename: string; bytes: number; sha256: string }>;
  fit_decisions?: Array<{
    iteration: number;
    action: 'concise-swap' | 'drop';
    atomId: string;
    pagesBefore: number;
  }>;
  needs_manual_trim?: boolean;
}

export function Outputs() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('focus'));
  const [archive, setArchive] = useState<Resume | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      setSelectedId(focus);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const listQuery = useQuery({
    queryKey: ['resumes', status === 'archived'],
    queryFn: () =>
      api.get<{ resumes: Resume[] }>(`/resumes?includeDeleted=${status === 'archived'}`),
  });
  const detailQuery = useQuery({
    queryKey: ['resume', selectedId],
    queryFn: () => api.get<{ resume: Resume }>(`/resumes/${selectedId}?includeDeleted=true`),
    enabled: Boolean(selectedId),
  });
  const data = listQuery.data;
  const isLoading = listQuery.isLoading;
  const detailData = detailQuery.data;
  const detailLoading = detailQuery.isLoading;
  /** Everything the server returned, before this screen's own filters. */
  const total = data?.resumes.length ?? 0;

  const resumes = useMemo(
    () =>
      (data?.resumes ?? []).filter((resume) => {
        if (status === 'archived' && !resume.deleted_at) return false;
        if (status && status !== 'archived' && resume.status !== status) return false;
        if (template && resume.template_key !== template) return false;
        const haystack =
          `${resume.name} ${resume.target?.company ?? ''} ${resume.target?.role_title ?? ''}`.toLowerCase();
        return !q || haystack.includes(q.toLowerCase());
      }),
    [data, q, status, template],
  );

  const mutate = useMutation({
    mutationFn: async ({ action, resume }: { action: string; resume: Resume }) => {
      if (action === 'sent') return api.post(`/resumes/${resume.id}/mark-sent`);
      if (action === 'base') return api.post(`/resumes/${resume.id}/set-base`);
      if (action === 'duplicate') return api.post(`/resumes/${resume.id}/duplicate`);
      if (action === 'restore') return api.post(`/resumes/${resume.id}/restore`);
      if (action === 'reexport') return api.post(`/resumes/${resume.id}/reexport`);
      return api.del(`/resumes/${resume.id}`);
    },
    onSuccess: async (_data, variables) => {
      const { action, resume } = variables;
      setArchive(null);
      setDownloadError(null);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      await qc.invalidateQueries({ queryKey: ['resume'] });
      await qc.invalidateQueries({ queryKey: ['resume-overview'] });
      if (action === 'reexport') {
        setSelectedId(resume.id);
      }
      // Six actions ran through this mutation and not one of them said
      // anything. The verb has to match the button that was pressed.
      const said: Record<string, string> = {
        sent: 'Marked as sent',
        base: 'Set as the base résumé. New finals diff against it.',
        duplicate: 'Duplicated. The copy is in your outputs.',
        restore: 'Restored',
        reexport: 'Artifacts rebuilt',
        archive: 'Archived',
      };
      // Archiving is reversible and `restore` is an action in this very switch,
      // so there was never a reason for it to be a one-way door.
      flash(said[action] ?? 'Done', {
        undo:
          action === 'archive'
            ? async () => {
                await api.post(`/resumes/${resume.id}/restore`);
                await qc.invalidateQueries({ queryKey: ['resumes'] });
                await qc.invalidateQueries({ queryKey: ['resume-overview'] });
              }
            : undefined,
      });
    },
    onError: (error) => {
      setDownloadError(error instanceof Error ? error.message : 'Request failed.');
    },
  });

  async function openArtifact(resume: Resume, kind: 'pdf' | 'tex') {
    setDownloadError(null);
    try {
      const result = await api.get<{ url: string }>(`/resumes/${resume.id}/artifacts/${kind}`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : 'This output has no stored artifact. Use Rebuild artifacts.',
      );
    }
  }

  const missingPdf = (resume: Resume) => !resume.artifact_ids?.pdf;

  /**
   * A row's name for assistive tech. `resume.name` alone does not identify a
   * row: several outputs can share a target and a day, and forty-four of them
   * here collapse to five distinct names. The creation time is what actually
   * tells them apart, and is the thing you would use to choose between them.
   */
  function rowName(resume: Resume): string {
    return `${resume.name}, made ${resume.created_at.slice(0, 16).replace('T', ' ')}`;
  }

  const detail = detailData?.resume;
  return (
    <div className="page resume-page">
      <PageHeader
        title="Outputs"
        subtitle="Search, inspect, compare, download, duplicate, and track every reproducible résumé artifact."
        actions={
          <Button variant="primary" onClick={() => navigate('/resume/tailor')}>
            New résumé
          </Button>
        }
      />
      <RegisterRule />
      <div className="resume-toolbar card">
        <Input
          aria-label="Search outputs"
          placeholder="Search role, company, or output…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          value={status || undefined}
          onChange={(value) => setStatus(value ?? '')}
          label="Filter by status"
          placeholder="All statuses"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'final', label: 'Final' },
            { value: 'sent', label: 'Sent' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <Select
          value={template || undefined}
          onChange={(value) => setTemplate(value ?? '')}
          label="Filter by template"
          placeholder="All templates"
          options={[
            { value: 'cobalt', label: 'Cobalt' },
            { value: 'onyx', label: 'Onyx' },
            { value: 'argon', label: 'Argon' },
          ]}
        />
        <Mono className="u-faint">
          {listQuery.data ? (resumes.length === total ? `${total}` : `${resumes.length} of ${total}`) : '—'} outputs
        </Mono>
      </div>
      {downloadError ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {downloadError}
        </p>
      ) : null}
      {listQuery.isError ? (
        // `isError` was unread, so a failed load rendered the empty panel and
        // invited you to go and tailor résumés you may already have.
        <ErrorState
          title="Couldn’t load your outputs"
          detail={(listQuery.error as Error | null)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : isLoading ? (
        <SkeletonRows rows={5} />
      ) : total === 0 ? (
        <EmptyState
          glyph="resume"
          title="No outputs yet"
          hint="Finalized and draft résumés appear here with their target snapshot and build artifacts."
          action={
            <Button variant="primary" onClick={() => navigate('/resume/tailor')}>
              Tailor a résumé
            </Button>
          }
        />
      ) : resumes.length === 0 ? (
        // The old panel's title said "No matching outputs" while its hint
        // described a first run - two different situations in one message.
        <EmptyState
          glyph="filter"
          title="No outputs match these filters"
          hint={`All ${total} of your outputs are hidden by the current search, status or template.`}
          action={
            <Button
              onClick={() => {
                setQ('');
                setStatus('');
                setTemplate('');
              }}
            >
              Clear the filters
            </Button>
          }
        />
      ) : (
        <div className="output-list">
          {resumes.map((resume) => (
            <article className="output-row" key={resume.id}>
              <button className="output-row__main" onClick={() => setSelectedId(resume.id)}>
                <div className="output-row__identity">
                  <strong>{resume.name}</strong>
                  <span>
                    {resume.target?.company ?? 'Saved target'} ·{' '}
                    {resume.target?.role_title ?? 'Résumé'} · {resume.created_at.slice(0, 10)}
                  </span>
                </div>
                <div className="chips">
                  {resume.is_base && <Chip tone="accent">Base</Chip>}
                  <Chip mono>
                    {resume.template_key} {resume.template_version && `v${resume.template_version}`}
                  </Chip>
                  {resume.pages != null && <Chip mono>{resume.pages}p</Chip>}
                  {resume.coverage && (
                    <Chip mono>{Math.round(resume.coverage.weightedPct * 100)}% coverage</Chip>
                  )}
                  <Chip
                    tone={
                      resume.status === 'final' || resume.status === 'sent' ? 'accent' : 'default'
                    }
                  >
                    {resume.status}
                  </Chip>
                </div>
              </button>
              <div className="output-row__actions">
                {resume.artifact_ids?.pdf ? (
                  <Button size="sm" aria-label={`Open the PDF for ${rowName(resume)}`} onClick={() => void openArtifact(resume, 'pdf')}>
                    PDF
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Rebuild the artifacts for ${rowName(resume)}`}
                    disabled={mutate.isPending}
                    onClick={() => mutate.mutate({ action: 'reexport', resume })}
                  >
                    {mutate.isPending && mutate.variables?.resume.id === resume.id
                      ? 'Rebuilding…'
                      : 'Rebuild'}
                  </Button>
                )}
                {/* Forty-four rows each offered a "PDF" and a "Details": one
                    name apiece across the whole list, for assistive tech and
                    for anything trying to address a particular row. */}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Details for ${rowName(resume)}`}
                  onClick={() => setSelectedId(resume.id)}
                >
                  Details
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={detail?.name ?? 'Output details'}
        wide
        footer={
          detail && (
            <>
              {detail.deleted_at ? (
                <Button onClick={() => mutate.mutate({ action: 'restore', resume: detail })}>
                  Restore
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setArchive(detail)}>
                  Archive
                </Button>
              )}
              <span style={{ flex: 1 }} />
              <Button
                disabled={Boolean(detail.deleted_at)}
                onClick={() => mutate.mutate({ action: 'duplicate', resume: detail })}
              >
                Duplicate
              </Button>
              {!detail.deleted_at &&
                !detail.is_base &&
                ['final', 'sent'].includes(detail.status) && (
                  <Button onClick={() => mutate.mutate({ action: 'base', resume: detail })}>
                    Set as base
                  </Button>
                )}
              {!detail.deleted_at && detail.status === 'final' && (
                <Button
                  variant="primary"
                  onClick={() => mutate.mutate({ action: 'sent', resume: detail })}
                >
                  Mark sent
                </Button>
              )}
            </>
          )
        }
      >
        {detailQuery.isError ? (
          // `!detail` held forever when the lookup failed, so the sheet span a
          // spinner with nothing to read - the same shape the Life map had.
          <ErrorState
            title="Couldn’t load this output"
            detail={(detailQuery.error as Error | null)?.message}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : detailLoading || !detail ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            <div className="output-detail-hero">
              <div>
                <span>Target</span>
                <strong>{detail.target?.role_title ?? '—'}</strong>
                <p>{detail.target?.company ?? '—'}</p>
              </div>
              <div>
                <span>Final gate</span>
                <strong>{detail.status}</strong>
                <p>
                  {detail.pages ?? '—'} page ·{' '}
                  {detail.coverage
                    ? `${Math.round(detail.coverage.weightedPct * 100)}% coverage`
                    : 'not compiled'}
                </p>
              </div>
            </div>
            <div>
              <h3>Private artifacts</h3>
              <div className="hstack" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                {detail.artifacts?.map((artifact) => (
                  <Button
                    key={artifact.artifact_kind}
                    onClick={() =>
                      void openArtifact(detail, artifact.artifact_kind as 'pdf' | 'tex')
                    }
                  >
                    {artifact.artifact_kind.toUpperCase()} · {Math.ceil(artifact.bytes / 1024)} KB
                  </Button>
                ))}
                {(missingPdf(detail) || !detail.artifacts?.length) && (
                  <>
                    <span className="u-muted">
                      No stored PDF/TeX. Rebuild from this output&apos;s saved selection.
                    </span>
                    <Button
                      variant="primary"
                      disabled={mutate.isPending || Boolean(detail.deleted_at)}
                      onClick={() => mutate.mutate({ action: 'reexport', resume: detail })}
                    >
                      {mutate.isPending && mutate.variables?.action === 'reexport'
                        ? 'Rebuilding…'
                        : 'Rebuild artifacts'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {detail.base_diff && (
              <div>
                <h3>Compared with base</h3>
                <div className="resume-diff">
                  <div>
                    <strong>+{detail.base_diff.added?.length ?? 0}</strong>
                    <span>added</span>
                  </div>
                  <div>
                    <strong>−{detail.base_diff.removed?.length ?? 0}</strong>
                    <span>removed</span>
                  </div>
                  <div>
                    <strong>{detail.base_diff.changed?.length ?? 0}</strong>
                    <span>reworded</span>
                  </div>
                </div>
              </div>
            )}
            {(detail.fit_decisions?.length || detail.needs_manual_trim) && (
              <div>
                <h3>Fit loop</h3>
                <div className="chips" style={{ marginTop: 8 }}>
                  {detail.needs_manual_trim && <Chip>needs manual trim</Chip>}
                  {(detail.fit_decisions ?? []).map((decision) => (
                    <Chip key={`${decision.iteration}-${decision.atomId}`} mono>
                      #{decision.iteration}{' '}
                      {decision.action === 'concise-swap' ? '→ concise' : 'dropped'} ·{' '}
                      {decision.pagesBefore}p
                    </Chip>
                  ))}
                  {!detail.fit_decisions?.length && !detail.needs_manual_trim && (
                    <span className="u-muted">No auto-trim steps.</span>
                  )}
                </div>
              </div>
            )}
            <div>
              <h3>Selected evidence</h3>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                {detail.selection?.entries?.map((entry) => (
                  <div className="output-bullet" key={entry.atomId}>
                    <Chip mono>{entry.emphasis}</Chip>
                    <span>{entry.text}</span>
                  </div>
                )) ?? <span className="u-muted">No atom selection stored.</span>}
              </div>
            </div>
            {detail.coverage?.gaps?.length ? (
              <div>
                <h3>Coverage gaps</h3>
                <div className="chips" style={{ marginTop: 8 }}>
                  {detail.coverage.gaps.map((gap) => (
                    <Chip key={gap.term}>{gap.term}</Chip>
                  ))}
                </div>
              </div>
            ) : null}
            {detail.target_id && (
              <Button
                variant="ghost"
                onClick={() => navigate(`/resume/tailor?target=${detail.target_id}`)}
              >
                Open target workspace →
              </Button>
            )}
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={Boolean(archive)}
        onOpenChange={(open) => !open && setArchive(null)}
        title="Archive this output?"
        body="The output remains recoverable and its private artifacts stay associated with it."
        // The detail sheet behind this dialog has its own "Archive" button and
        // stays open, so both were on screen wearing one name - the spec had to
        // reach for `.last()` to tell them apart.
        confirmLabel="Archive output"
        destructive
        busy={mutate.isPending}
        onConfirm={() => archive && mutate.mutate({ action: 'archive', resume: archive })}
      />
    </div>
  );
}
