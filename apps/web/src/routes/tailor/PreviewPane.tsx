import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ErrorState,
  Field,
  Input,
  Mono,
  Select,
  Skeleton,
  SkeletonRows,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { accentLabel, accentName, RESUME_ACCENTS } from '../../lib/accent-palette.js';
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

/** How many uncovered keywords fit before the row is cut short. */
const GAP_LIMIT = 12;

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

interface Props {
  targetId: string;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
}

/**
 * Right pane: template picker → Compile (live PDF preview + honest errors) →
 * Finalize (one-page + coverage gate) with a link to Outputs.
 *
 * The key is the fix for a silent, load-bearing bug. Tailor renders this as
 * `{target && <PreviewPane .../>}`, so picking a different job target in the
 * rail re-rendered the same instance: the compile result, the PDF, the
 * coverage gate and the finalize receipt for target A stayed on screen,
 * presented as target B's. A user read a green gate for a résumé that was
 * never built. Compile state belongs to the target it was compiled for, and
 * a key is how you say that in React.
 */
export function PreviewPane(props: Props) {
  return <TargetPreview key={props.targetId} {...props} />;
}

function TargetPreview({ targetId, draft, onDraft }: Props) {
  const queryClient = useQueryClient();
  // The receipt is stored with the draft it describes. A finalize claims
  // "one page, coverage gate passed" about one exact document; the moment you
  // change the selection, the wording, the template or the accent, that claim
  // is about something that is no longer on screen, and the Outputs link
  // points at a record that no longer matches. Comparing signatures during
  // render retires the claim without an effect that reaches for setState.
  const [finalized, setFinalized] = useState<{ sig: string; result: FinalizeResult } | null>(null);
  const bodySig = JSON.stringify(compileBody(targetId, draft));
  const receipt = finalized?.sig === bodySig ? finalized.result : null;

  const tplQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () =>
      api.get<{ templates: Template[]; defaultKey: string; defaultAccent: string }>(
        '/resumes/templates',
      ),
    // The catalogue changes when a template ships, not while you tailor.
    staleTime: 5 * 60_000,
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
    onSuccess: async (result) => {
      setFinalized({ sig: bodySig, result });
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });

  const r = compile.data ?? null;
  const gaps = r?.coverage?.gaps ?? [];

  return (
    <div className="card">
      <h2 className="card__title">Preview &amp; output</h2>

      {tplQuery.isError ? (
        <ErrorState
          className="mb-3"
          title="Couldn't load the templates"
          detail={(tplQuery.error as Error | null)?.message}
          onRetry={() => void tplQuery.refetch()}
          retrying={tplQuery.isFetching}
        />
      ) : tplQuery.isLoading ? (
        // Skeleton is itself aria-hidden, so a bare `aria-hidden` wrapper made
        // the whole wait silent: nothing, then a row of buttons.
        <div
          className="chips mb-2"
          role="status"
          aria-live="polite"
          aria-label="Loading résumé templates"
        >
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
          {/* The visible word and the announced name are the same string now.
              They used to be "Accent" and "Template accent", so a voice-control
              user and a screen-reader user were naming two different controls,
              and the label on screen pointed at nothing. */}
          <span className="vt-fld__label" id="tailor-accent-label">
            Template accent
          </span>
          <div className="accent-picker" role="group" aria-labelledby="tailor-accent-label">
            {accentOptions.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-label={accentLabel(accent)}
                aria-pressed={draft.accent === accent}
                title={`${accentName(accent)} · ${accent}`}
                style={{ '--swatch': accent } as CSSProperties}
                onClick={() => onDraft({ accent })}
              />
            ))}
          </div>
          {/* Six discs told apart by hue alone, with the chosen one carrying an
              outline. The palette gives every shipped accent a word; this is
              where the word gets said. */}
          <p className="m-0 mt-1 text-xs text-faint">
            Selected: <Mono>{accentName(draft.accent)}</Mono>
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <Field label="Headline" htmlFor="tailor-headline">
          <Input
            id="tailor-headline"
            placeholder="Headline (defaults to the role title)"
            value={draft.headline}
            onChange={(e) => onDraft({ headline: e.target.value })}
          />
        </Field>
        <Field label="Summary paragraph" htmlFor="tailor-summary">
          <Textarea
            id="tailor-summary"
            rows={3}
            placeholder="Summary paragraph (optional, appears under the header)"
            value={draft.summary}
            onChange={(e) => onDraft({ summary: e.target.value })}
          />
        </Field>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          glyph="resume"
          disabled={compile.isPending}
          onClick={() => compile.mutate()}
        >
          {compile.isPending ? 'Compiling...' : 'Compile PDF'}
        </Button>
        <Button
          variant="ghost"
          disabled={finalize.isPending || !r?.ok}
          onClick={() => finalize.mutate()}
          title={
            r?.ok ? 'Persist this résumé (one-page + coverage gate)' : 'Compile successfully first'
          }
        >
          {finalize.isPending ? 'Finalizing...' : 'Finalize'}
        </Button>
      </div>

      {finalize.isError && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusTrace
            className="flex-1"
            tone="danger"
            label="Couldn't finalize this résumé"
            detail={(finalize.error as Error | null)?.message ?? 'Nothing was saved. Try again.'}
          />
          {/* A failed finalization used to leave the original Finalize button
              as the only recovery path, separated from the error by the
              preview. Keep the retry beside the claim that failed. */}
          <Button size="sm" onClick={() => finalize.mutate()}>
            Retry finalization
          </Button>
        </div>
      )}

      {receipt && (
        <div className="mb-3 border border-hairline bg-overlay p-3">
          {/* Finalizing used to report itself only by the button changing back,
              which is what nothing happening also looks like. */}
          <StatusTrace
            className="mb-2"
            tone={receipt.status === 'final' ? 'success' : 'warning'}
            label={receipt.status === 'final' ? 'Résumé finalized' : 'Saved as a draft'}
            detail={
              receipt.status === 'final'
                ? 'Saved to Outputs'
                : 'It did not clear both gates, so it was not marked final'
            }
          />
          <div className="chips">
            <Chip mono tone={receipt.onePage ? 'success' : 'warning'}>
              {receipt.onePage ? 'One page' : `${receipt.pages ?? '?'} pages`}
            </Chip>
            <Chip mono tone={receipt.gatePassed ? 'success' : 'warning'}>
              {receipt.gatePassed ? 'Coverage gate passed' : 'Below 95% coverage'}
            </Chip>
            {receipt.needsManualTrim && <Chip tone="warning">Needs manual trim</Chip>}
            {(receipt.fitDecisions?.length ?? 0) > 0 && (
              <Chip mono>
                {receipt.fitDecisions!.length} fit step
                {receipt.fitDecisions!.length === 1 ? '' : 's'}
              </Chip>
            )}
          </div>
          {receipt.needsManualTrim && (
            <p className="mt-2 mb-0 text-sm text-muted">
              Still over one page after auto trim. Drop or reword bullets in Selection, then
              finalize again.
            </p>
          )}
          {(receipt.fitDecisions?.length ?? 0) > 0 && (
            <div className="chips mt-2">
              {receipt.fitDecisions!.map((decision) => (
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
          {/* announce={false}: the SkeletonRows below is already a polite live
              region, and one button press should not be read out twice. */}
          <StatusTrace
            className="mb-2"
            tone="live"
            announce={false}
            label="Typesetting the PDF"
            detail="This runs LaTeX, so it takes a moment"
          />
          <SkeletonRows rows={5} label="Compiling the résumé" />
        </>
      ) : compile.isError ? (
        <ErrorState
          title="Couldn't reach the build service"
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
              {gaps.length > 0 && (
                <div className="chips mt-2">
                  <span className="text-xs text-faint">Not covered:</span>
                  {gaps.slice(0, GAP_LIMIT).map((g) => (
                    <Chip key={g.term}>{g.term}</Chip>
                  ))}
                  {/* A résumé missing 25 keywords used to show 12 and look like
                      it was missing 12. */}
                  {gaps.length > GAP_LIMIT && <Chip mono>+{gaps.length - GAP_LIMIT} more</Chip>}
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
            // Three dialects for "this did not work" used to share one screen:
            // a vt-error panel, a red-bordered box and a hairline box. Two of
            // them were hand-rolled copies of primitives this file imports.
            <Banner
              tone="warning"
              title="Build service offline"
              action={<TexDownload tex={r.tex} />}
            >
              Start it with <code>docker compose up -d buildsvc</code>, then compile again. The
              LaTeX source is complete either way.
            </Banner>
          ) : (
            <div>
              <ErrorState
                title="Compile failed"
                detail={`${r.error?.code ?? 'COMPILE_ERROR'}: ${
                  r.error?.message ?? 'The document did not typeset.'
                }${r.error?.section ? ` (near section: ${r.error.section})` : ''}`}
                action={<TexDownload tex={r.tex} />}
              />
              {r.logTail && (
                <details className="mt-2">
                  <summary className="inline-flex min-h-[32px] cursor-pointer items-center text-xs text-faint">
                    LaTeX log
                  </summary>
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
