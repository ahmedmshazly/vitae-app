import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  SkeletonRows,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { accentLabel, RESUME_ACCENTS } from '../../lib/accent-palette.js';
import { api } from '../../lib/api.js';
import { PdfPreview } from '../../components/PdfPreview.js';
import type { CompileResult, Draft, FinalizeResult } from './types.js';
import { compileBody } from './types.js';

interface Template {
  key: string;
  name: string;
  version: string;
  description?: string;
  accent_options?: string[];
}

const EMPHASIS_OPTIONS = [
  { value: 'technical', label: 'Technical' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
];

/** Fallback swatches for a template that declares no palette of its own. */
const DEFAULT_ACCENTS = RESUME_ACCENTS.map((a) => a.value);

/** A .tex download, offered whenever the PDF itself could not be produced. */
function TexDownload({ tex }: { tex: string }) {
  return (
    <a
      className="vt-btn vt-btn--sm"
      download="resume.tex"
      href={`data:application/x-tex;charset=utf-8,${encodeURIComponent(tex)}`}
    >
      Download .tex
    </a>
  );
}

/**
 * Right pane: template picker → Compile (live PDF preview + honest errors) →
 * Finalize (one-page + coverage gate) with a link to Outputs.
 */
export function PreviewPane({
  targetId,
  draft,
  onDraft,
}: {
  targetId: string;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
}) {
  const queryClient = useQueryClient();
  const [finalized, setFinalized] = useState<FinalizeResult | null>(null);

  const tplQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () =>
      api.get<{ templates: Template[]; defaultKey: string; defaultAccent: string }>(
        '/resumes/templates',
      ),
  });
  const templates = tplQuery.data?.templates ?? [];
  const activeTemplate = templates.find((t) => t.key === draft.templateKey);
  const accentOptions = activeTemplate?.accent_options?.length
    ? activeTemplate.accent_options
    : DEFAULT_ACCENTS;

  const compile = useMutation({
    mutationFn: () => api.post<CompileResult>('/resumes/compile', compileBody(targetId, draft)),
  });
  const finalize = useMutation({
    mutationFn: () => api.post<FinalizeResult>('/resumes/finalize', compileBody(targetId, draft)),
    onSuccess: async (res) => {
      setFinalized(res);
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });

  const r = compile.data ?? null;

  return (
    <div className="card">
      <h2 className="card__title">Preview &amp; output</h2>

      {tplQuery.isError ? (
        <ErrorState
          className="mb-3"
          title="Couldn’t load the templates"
          detail={(tplQuery.error as Error | null)?.message}
          onRetry={() => void tplQuery.refetch()}
          retrying={tplQuery.isFetching}
        />
      ) : tplQuery.isLoading ? (
        <div className="chips mb-2" aria-hidden>
          <Skeleton width={72} height={22} />
          <Skeleton width={64} height={22} />
          <Skeleton width={80} height={22} />
        </div>
      ) : (
        <div className="chips mb-2" role="group" aria-label="Résumé template">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              className="vt-chip capitalize"
              aria-pressed={t.key === draft.templateKey}
              title={t.description}
              onClick={() => onDraft({ templateKey: t.key })}
            >
              {t.name ?? t.key}
            </button>
          ))}
        </div>
      )}

      <div className="tailor-style-controls">
        <Field label="Wording emphasis" htmlFor="tailor-emphasis">
          <Select
            id="tailor-emphasis"
            label="Wording emphasis"
            value={draft.preferredEmphasis}
            clearable={false}
            options={EMPHASIS_OPTIONS}
            onChange={(value) =>
              value && onDraft({ preferredEmphasis: value as Draft['preferredEmphasis'] })
            }
          />
        </Field>
        <div>
          <span className="vt-fld__label">Accent</span>
          <div className="accent-picker" role="group" aria-label="Template accent">
            {accentOptions.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-label={accentLabel(accent)}
                aria-pressed={draft.accent === accent}
                style={{ '--swatch': accent } as CSSProperties}
                onClick={() => onDraft({ accent })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <Input
          aria-label="Headline"
          placeholder="Headline (defaults to the role title)"
          value={draft.headline}
          onChange={(e) => onDraft({ headline: e.target.value })}
        />
        <Textarea
          aria-label="Summary paragraph"
          rows={3}
          placeholder="Summary paragraph (optional, appears under the header)"
          value={draft.summary}
          onChange={(e) => onDraft({ summary: e.target.value })}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          glyph="resume"
          disabled={compile.isPending}
          onClick={() => compile.mutate()}
        >
          {compile.isPending ? 'Compiling…' : 'Compile PDF'}
        </Button>
        <Button
          variant="ghost"
          disabled={finalize.isPending || !r?.ok}
          onClick={() => finalize.mutate()}
          title={
            r?.ok ? 'Persist this résumé (one-page + coverage gate)' : 'Compile successfully first'
          }
        >
          {finalize.isPending ? 'Finalizing…' : 'Finalize'}
        </Button>
      </div>

      {finalize.isError && (
        <StatusTrace
          className="mb-3"
          tone="danger"
          label="Couldn’t finalize this résumé"
          detail={(finalize.error as Error | null)?.message ?? 'Nothing was saved. Try again.'}
        />
      )}

      {finalized && (
        <div className="mb-3 border border-hairline bg-overlay p-3">
          <div className="chips">
            <Chip tone={finalized.status === 'final' ? 'accent' : 'default'}>
              {finalized.status === 'final' ? 'Finalized' : 'Saved as draft'}
            </Chip>
            <Chip mono tone={finalized.onePage ? 'success' : 'warning'}>
              {finalized.onePage ? 'One page' : `${finalized.pages ?? '?'} pages`}
            </Chip>
            <Chip mono tone={finalized.gatePassed ? 'success' : 'warning'}>
              {finalized.gatePassed ? 'Coverage gate passed' : 'Below 95% coverage'}
            </Chip>
            {finalized.needsManualTrim && <Chip tone="warning">Needs manual trim</Chip>}
            {(finalized.fitDecisions?.length ?? 0) > 0 && (
              <Chip mono>
                {finalized.fitDecisions!.length} fit step
                {finalized.fitDecisions!.length === 1 ? '' : 's'}
              </Chip>
            )}
          </div>
          {finalized.needsManualTrim && (
            <p className="mt-2 mb-0 text-sm text-muted">
              Still over one page after auto trim. Drop or reword bullets in Selection, then
              finalize again.
            </p>
          )}
          {(finalized.fitDecisions?.length ?? 0) > 0 && (
            <div className="chips mt-2">
              {finalized.fitDecisions!.map((decision) => (
                <Chip key={`${decision.iteration}-${decision.atomId}`} mono>
                  #{decision.iteration}{' '}
                  {decision.action === 'concise-swap' ? '→ concise' : 'dropped'} ·{' '}
                  {decision.pagesBefore}p
                </Chip>
              ))}
            </div>
          )}
          <div className="mt-2">
            <Link to="/career/resume/outputs" className="vt-btn vt-btn--sm">
              Open Outputs →
            </Link>
          </div>
        </div>
      )}

      {compile.isPending ? (
        <>
          <StatusTrace
            className="mb-2"
            tone="live"
            label="Typesetting the PDF"
            detail="This runs LaTeX, so it takes a moment"
          />
          <SkeletonRows rows={5} label="Compiling the résumé" />
        </>
      ) : compile.isError ? (
        <ErrorState
          title="Couldn’t reach the build service"
          detail={(compile.error as Error | null)?.message}
          onRetry={() => compile.mutate()}
          retryLabel="Compile again"
          retrying={compile.isPending}
        />
      ) : !r ? (
        <p className="m-0 text-sm text-muted">
          Compile to preview the PDF and its ATS keyword coverage.
        </p>
      ) : (
        <>
          {r.coverage && (
            <div className="mb-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Weighted coverage</span>
                <Chip mono tone={r.coverage.passesGate ? 'success' : 'warning'}>
                  {Math.round(r.coverage.weightedPct * 100)}%{' '}
                  {r.coverage.passesGate ? 'gate passed' : 'below 95%'}
                </Chip>
              </div>
              {r.coverage.gaps.length > 0 && (
                <div className="chips mt-2">
                  <span className="text-xs text-faint">Not covered:</span>
                  {r.coverage.gaps.slice(0, 12).map((g) => (
                    <Chip key={g.term}>{g.term}</Chip>
                  ))}
                </div>
              )}
            </div>
          )}
          {r.pages != null && (
            <div className="chips mb-2">
              <Chip mono tone={r.pages === 1 ? 'accent' : 'default'}>
                {r.pages} page{r.pages === 1 ? '' : 's'}
              </Chip>
            </div>
          )}

          {r.pdfBase64 ? (
            <PdfPreview base64={r.pdfBase64} />
          ) : r.offline ? (
            <div className="border border-hairline bg-overlay p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Chip tone="warning">Build service offline</Chip>
                <TexDownload tex={r.tex} />
              </div>
              <p className="m-0 text-sm text-muted">
                Start it with <code>docker compose up -d buildsvc</code>, then compile again. The
                LaTeX source is complete either way.
              </p>
            </div>
          ) : (
            <div className="border border-danger bg-overlay p-3" role="alert">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Chip tone="danger">Compile failed</Chip>
                <TexDownload tex={r.tex} />
              </div>
              <p className="mb-2 text-sm text-ink">
                <strong>{r.error?.code ?? 'COMPILE_ERROR'}</strong>:{' '}
                {r.error?.message ?? 'The document did not typeset.'}
                {r.error?.section ? ` (near section: ${r.error.section})` : ''}
              </p>
              {r.logTail && (
                <details>
                  <summary className="cursor-pointer text-xs text-faint">LaTeX log</summary>
                  <pre className="mt-2 max-h-[220px] overflow-auto font-mono text-xs whitespace-pre-wrap text-muted">
                    {r.logTail}
                  </pre>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
