import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Inline,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  Sheet,
  SkeletonRows,
  StatusTrace,
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

/** The six things this screen can ask the server to do to an output. */
type OutputAction = 'sent' | 'base' | 'duplicate' | 'restore' | 'reexport' | 'archive';

/**
 * What each action says while it is still in flight. Every one of them ran
 * through a single mutation whose only visible effect was a `disabled`
 * attribute, so a click on Duplicate or Mark sent read as a click that missed.
 */
const PENDING_LABEL: Record<OutputAction, string> = {
  sent: 'Marking sent…',
  base: 'Setting as base…',
  duplicate: 'Duplicating…',
  restore: 'Restoring…',
  reexport: 'Rebuilding…',
  archive: 'Archiving…',
};

/** What each action says once the server has done it. */
const DONE_LABEL: Record<OutputAction, string> = {
  sent: 'Marked as sent',
  base: 'Set as the base résumé. New finals diff against it.',
  duplicate: 'Duplicated. The copy is in your outputs.',
  restore: 'Restored',
  reexport: 'Artifacts rebuilt',
  archive: 'Archived',
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'final', label: 'Final' },
  { value: 'sent', label: 'Sent' },
  { value: 'archived', label: 'Archived' },
];

const TEMPLATE_OPTIONS = [
  { value: 'cobalt', label: 'Cobalt' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'argon', label: 'Argon' },
];

/** The chosen option in its own words, so a filter can state what it is set to. */
function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
  fallback: string,
): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

/**
 * A ruled register of stated facts: term on the left, value on the right, a
 * hairline between. The detail sheet opened on two bordered boxes that gave
 * "Final gate" the same weight as the role the résumé was built for, and never
 * said which word was the term and which was the value.
 */
function Facts({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6">{children}</dl>;
}
function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid items-center border-b border-hairline py-2 last:border-b-0">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="m-0 flex min-w-0 justify-end text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Outputs() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archive, setArchive] = useState<Resume | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const focusId = searchParams.get('focus');
  const detailId = selectedId ?? focusId;
  // One query for the whole register, archive included. The archived flag used
  // to sit in the cache key, so choosing or clearing "Archived" started a
  // second fetch and put every row back through a skeleton. Which outputs to
  // show is a decision this screen already makes for search, status and
  // template; deleted_at is no different.
  const listQuery = useQuery({
    queryKey: ['resumes', 'all'],
    queryFn: () => api.get<{ resumes: Resume[] }>('/resumes?includeDeleted=true'),
  });
  const detailQuery = useQuery({
    queryKey: ['resume', detailId],
    queryFn: () => api.get<{ resume: Resume }>(`/resumes/${detailId}?includeDeleted=true`),
    enabled: Boolean(detailId),
  });
  const data = listQuery.data;
  const isLoading = listQuery.isLoading;
  const detailData = detailQuery.data;
  const detailLoading = detailQuery.isLoading;
  // A first load that failed has nothing to show and says so. A refresh that
  // failed still has the last good register, and throwing that away to report
  // the failure loses more than it tells you.
  const loadFailed = listQuery.isError && !data;
  const refreshFailed = listQuery.isError && Boolean(data);
  /** Everything the register holds, archive included, before this screen filters. */
  const total = data?.resumes.length ?? 0;

  const resumes = useMemo(
    () =>
      (data?.resumes ?? []).filter((resume) => {
        // The archive is its own view. Now that every output arrives in one
        // response, the live views have to exclude the archived ones.
        if (Boolean(resume.deleted_at) !== (status === 'archived')) return false;
        if (status && status !== 'archived' && resume.status !== status) return false;
        if (template && resume.template_key !== template) return false;
        const haystack =
          `${resume.name} ${resume.target?.company ?? ''} ${resume.target?.role_title ?? ''}`.toLowerCase();
        return !q || haystack.includes(q.toLowerCase());
      }),
    [data, q, status, template],
  );

  const mutate = useMutation({
    mutationFn: async ({ action, resume }: { action: OutputAction; resume: Resume }) => {
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
      setArtifactError(null);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      await qc.invalidateQueries({ queryKey: ['resume'] });
      await qc.invalidateQueries({ queryKey: ['resume-overview'] });
      if (action === 'reexport') {
        setSelectedId(resume.id);
      }
      // Six actions ran through this mutation and not one of them said
      // anything. The verb has to match the button that was pressed.
      // Archiving is reversible and `restore` is an action in this very switch,
      // so there was never a reason for it to be a one-way door.
      flash(DONE_LABEL[action], {
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
    // No local onError. The app's mutation cache already reports every failure
    // as a toast, so a second copy pinned under the toolbar said the same thing
    // twice and then stayed there after the next action succeeded.
  });

  /** The action in flight, if any, so each control can name its own state. */
  const pending = mutate.isPending ? mutate.variables?.action : undefined;

  async function openArtifact(resume: Resume, kind: 'pdf' | 'tex') {
    setArtifactError(null);
    try {
      const result = await api.get<{ url: string }>(`/resumes/${resume.id}/artifacts/${kind}`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setArtifactError(
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
  const detailArtifacts = detail?.artifacts ?? [];
  const detailSelection = detail?.selection?.entries ?? [];
  const detailFit = detail?.fit_decisions ?? [];
  return (
    <div className="page resume-page">
      <PageHeader
        title="Outputs"
        subtitle="Search, inspect, compare, download, duplicate, and track every reproducible résumé artifact."
        actions={
          <Button variant="primary" onClick={() => navigate('/career/resume/tailor')}>
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
          // Radix puts `label` on the trigger as its aria-label, and an
          // aria-label replaces the trigger's own text: a fixed "Filter by
          // status" read the same whether this was showing everything or four
          // sent finals. The value has to be part of the name.
          label={`Status: ${optionLabel(STATUS_OPTIONS, status, 'All statuses')}`}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
        />
        <Select
          value={template || undefined}
          onChange={(value) => setTemplate(value ?? '')}
          label={`Template: ${optionLabel(TEMPLATE_OPTIONS, template, 'All templates')}`}
          placeholder="All templates"
          options={TEMPLATE_OPTIONS}
        />
        {/* The count is the only report that a keystroke changed the register,
            and nothing moves focus when it does, so it has to be announced and
            not merely redrawn. Mounted whatever the state: a live region
            created together with its first message is one nothing was
            watching. */}
        <Mono className="u-faint" role="status" aria-live="polite" aria-label="Outputs shown">
          {data ? (resumes.length === total ? `${total}` : `${resumes.length} of ${total}`) : '—'}{' '}
          outputs
        </Mono>
      </div>
      {artifactError ? (
        // A red paragraph, undismissable, and shared with every mutation
        // failure, which the global toast already reported. This is now the
        // artifact fetches alone, which have no toast behind them.
        <Banner
          tone="danger"
          title="Couldn’t open that artifact"
          onDismiss={() => setArtifactError(null)}
        >
          {artifactError}
        </Banner>
      ) : null}
      {refreshFailed ? (
        <Banner
          tone="danger"
          title="Couldn’t refresh your outputs"
          action={
            <Button size="sm" onClick={() => void listQuery.refetch()}>
              Retry
            </Button>
          }
        >
          Showing the last register that loaded.
        </Banner>
      ) : null}
      {loadFailed ? (
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
            <Button variant="primary" onClick={() => navigate('/career/resume/tailor')}>
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
        // A run of sibling articles is a stack of divs to a screen reader: no
        // count, no position, no way to step through it as a list.
        <ul className="output-list m-0 list-none p-0" aria-label="Outputs">
          {resumes.map((resume) => {
            const rebuilding =
              mutate.isPending &&
              mutate.variables?.action === 'reexport' &&
              mutate.variables.resume.id === resume.id;
            return (
              <li className="output-row" key={resume.id}>
                {/* Forty-four rows each offered a button called "PDF" and one
                    called "Details", two names across the whole list. The row
                    itself opens the sheet, so the second button was the same
                    destination under a name nothing could address. */}
                <button
                  type="button"
                  className="output-row__main"
                  aria-label={`Details for ${rowName(resume)}`}
                  onClick={() => setSelectedId(resume.id)}
                >
                  <span className="output-row__identity">
                    <strong>{resume.name}</strong>
                    <span>
                      {resume.target?.company ?? 'Saved target'} ·{' '}
                      {resume.target?.role_title ?? 'Résumé'} · {resume.created_at.slice(0, 10)}
                    </span>
                  </span>
                </button>
                {/* Outside the button. Nine chips inside it made the name one
                    unpunctuated sentence of template, pages, coverage and
                    status before you reached what the button did. */}
                <div className="chips min-w-0 pr-3">
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
                <div className="output-row__actions">
                  {resume.artifact_ids?.pdf ? (
                    <Button
                      size="sm"
                      aria-label={`Open the PDF for ${rowName(resume)}`}
                      onClick={() => void openArtifact(resume, 'pdf')}
                    >
                      PDF
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      // An aria-label replaces the content, so the visible
                      // "Rebuilding…" never reached anyone listening.
                      aria-label={
                        rebuilding
                          ? `Rebuilding the artifacts for ${rowName(resume)}`
                          : `Rebuild the artifacts for ${rowName(resume)}`
                      }
                      // Scoped to this row. One shared flag greyed out every
                      // other row's Rebuild whenever anything on the screen ran.
                      disabled={rebuilding}
                      onClick={() => mutate.mutate({ action: 'reexport', resume })}
                    >
                      {rebuilding ? 'Rebuilding…' : 'Rebuild'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedId(null);
          if (focusId) {
            const next = new URLSearchParams(searchParams);
            next.delete('focus');
            setSearchParams(next, { replace: true });
          }
        }}
        title={detail?.name ?? 'Output details'}
        wide
        footer={
          detail && (
            <>
              {detail.deleted_at ? (
                <Button
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ action: 'restore', resume: detail })}
                >
                  {pending === 'restore' ? PENDING_LABEL.restore : 'Restore'}
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setArchive(detail)}>
                  Archive
                </Button>
              )}
              <span aria-hidden className="flex-1" />
              <Button
                disabled={Boolean(detail.deleted_at) || mutate.isPending}
                onClick={() => mutate.mutate({ action: 'duplicate', resume: detail })}
              >
                {pending === 'duplicate' ? PENDING_LABEL.duplicate : 'Duplicate'}
              </Button>
              {!detail.deleted_at &&
                !detail.is_base &&
                ['final', 'sent'].includes(detail.status) && (
                  <Button
                    disabled={mutate.isPending}
                    onClick={() => mutate.mutate({ action: 'base', resume: detail })}
                  >
                    {pending === 'base' ? PENDING_LABEL.base : 'Set as base'}
                  </Button>
                )}
              {!detail.deleted_at && detail.status === 'final' && (
                <Button
                  variant="primary"
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ action: 'sent', resume: detail })}
                >
                  {pending === 'sent' ? PENDING_LABEL.sent : 'Mark sent'}
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
          <div>
            {/* The footer buttons are below the fold of a long sheet, so the
                state of the one you pressed is reported up here as well. */}
            {pending && <StatusTrace tone="live" label={PENDING_LABEL[pending]} />}
            <Facts>
              <Fact term="Target role">{detail.target?.role_title ?? 'None recorded'}</Fact>
              <Fact term="Company">{detail.target?.company ?? 'None recorded'}</Fact>
              <Fact term="Status">
                <Inline gap={2} align="center" wrap>
                  <Chip
                    tone={
                      detail.status === 'final' || detail.status === 'sent' ? 'accent' : 'default'
                    }
                  >
                    {detail.status}
                  </Chip>
                  {detail.is_base && <Chip tone="accent">Base</Chip>}
                  {detail.deleted_at && (
                    <Chip tone="warning" glyph="alert">
                      archived
                    </Chip>
                  )}
                </Inline>
              </Fact>
              <Fact term="Pages">
                {detail.pages != null
                  ? `${detail.pages} page${detail.pages === 1 ? '' : 's'}`
                  : 'Not compiled'}
              </Fact>
              <Fact term="Coverage">
                {detail.coverage
                  ? `${Math.round(detail.coverage.weightedPct * 100)}%`
                  : 'Not measured'}
              </Fact>
              <Fact term="Template">
                <Mono>
                  {detail.template_key}
                  {detail.template_version ? ` v${detail.template_version}` : ''}
                </Mono>
              </Fact>
              <Fact term="Built">
                <Mono>{detail.created_at.slice(0, 16).replace('T', ' ')}</Mono>
              </Fact>
            </Facts>
            <Section title="Private artifacts" meta={detailArtifacts.length}>
              <Inline gap={2} align="center" wrap>
                {detailArtifacts.map((artifact) => (
                  <Button
                    key={artifact.artifact_kind}
                    onClick={() =>
                      void openArtifact(detail, artifact.artifact_kind as 'pdf' | 'tex')
                    }
                  >
                    {artifact.artifact_kind.toUpperCase()} · {Math.ceil(artifact.bytes / 1024)} KB
                  </Button>
                ))}
                {/* Two different situations shared one sentence: nothing stored
                    at all, and a TeX file stored with no PDF beside it. The
                    second one printed "No stored PDF/TeX" next to a working
                    TEX button. */}
                {detailArtifacts.length === 0 && (
                  <span className="u-muted">
                    Nothing stored yet. Rebuild from this output&apos;s saved selection.
                  </span>
                )}
                {detailArtifacts.length > 0 && missingPdf(detail) && (
                  <span className="u-muted">No stored PDF. Rebuild to compile one.</span>
                )}
                {(detailArtifacts.length === 0 || missingPdf(detail)) && (
                  <Button
                    variant="primary"
                    disabled={mutate.isPending || Boolean(detail.deleted_at)}
                    onClick={() => mutate.mutate({ action: 'reexport', resume: detail })}
                  >
                    {pending === 'reexport' ? PENDING_LABEL.reexport : 'Rebuild artifacts'}
                  </Button>
                )}
              </Inline>
            </Section>
            {detail.base_diff && (
              <Section
                title="Compared with base"
                meta={
                  (detail.base_diff.added?.length ?? 0) +
                  (detail.base_diff.removed?.length ?? 0) +
                  (detail.base_diff.changed?.length ?? 0)
                }
              >
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
              </Section>
            )}
            {/* Rendered whether or not the fit loop ran. The fallback used to
                sit inside a branch that only opened when there was something
                to show, so an output the loop never touched said nothing at
                all about it. */}
            <Section title="Fit loop" meta={detailFit.length}>
              <Inline gap={2} align="center" wrap>
                {detail.needs_manual_trim && (
                  <Chip tone="warning" glyph="alert">
                    needs manual trim
                  </Chip>
                )}
                {detailFit.map((decision) => (
                  <Chip key={`${decision.iteration}-${decision.atomId}`} mono>
                    #{decision.iteration}{' '}
                    {decision.action === 'concise-swap' ? '→ concise' : 'dropped'} ·{' '}
                    {decision.pagesBefore}p
                  </Chip>
                ))}
                {detailFit.length === 0 && !detail.needs_manual_trim && (
                  <span className="u-muted">No auto-trim steps. It fit as selected.</span>
                )}
              </Inline>
            </Section>
            <Section title="Selected evidence" meta={detailSelection.length}>
              {detailSelection.length > 0 ? (
                // A list, and named, because this is the actual content of the
                // output: which atoms went in and at what emphasis.
                <ul className="m-0 list-none p-0" aria-label="Selected evidence">
                  {detailSelection.map((entry) => (
                    <li className="output-bullet" key={entry.atomId}>
                      <Chip mono>{entry.emphasis}</Chip>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                // `?? ` only fires on undefined, and `[].map()` is an empty
                // array, so this line could not be reached by an output that
                // stored a selection with nothing in it.
                <span className="u-muted">No atom selection stored.</span>
              )}
            </Section>
            <Section title="Coverage gaps" meta={detail.coverage?.gaps?.length ?? 0}>
              {detail.coverage?.gaps?.length ? (
                <Inline gap={2} align="center" wrap>
                  {detail.coverage.gaps.map((gap) => (
                    <Chip key={gap.term} tone="warning" glyph="alert">
                      {gap.term}
                    </Chip>
                  ))}
                </Inline>
              ) : (
                <span className="u-muted">
                  {detail.coverage
                    ? 'Every ranked term from the target appears in this résumé.'
                    : 'Never compiled, so coverage was never measured.'}
                </span>
              )}
            </Section>
            {detail.target_id && (
              <Button
                variant="ghost"
                onClick={() => navigate(`/career/resume/tailor?target=${detail.target_id}`)}
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
