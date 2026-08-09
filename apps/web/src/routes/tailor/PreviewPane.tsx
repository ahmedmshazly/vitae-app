import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Spinner } from '@vitae/ui';
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

/**
 * Right pane: template picker → Compile (live PDF preview + honest errors) →
 * Finalize (one-page + coverage gate) with a link to Outputs.
 */
export function PreviewPane({ targetId, draft, onDraft }: { targetId: string; draft: Draft; onDraft: (patch: Partial<Draft>) => void }) {
  const queryClient = useQueryClient();
  const [finalized, setFinalized] = useState<FinalizeResult | null>(null);

  const tplQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () =>
      api.get<{ templates: Template[]; defaultKey: string; defaultAccent: string }>('/resumes/templates'),
  });
  const tpl = tplQuery.data;
  const templates = tpl?.templates ?? [];
  const activeTemplate = templates.find((t) => t.key === draft.templateKey);
  const accentOptions =
    activeTemplate?.accent_options?.length
      ? activeTemplate.accent_options
      : ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#111827'];

  const compile = useMutation({
    mutationFn: () => api.post<CompileResult>('/resumes/compile', compileBody(targetId, draft)),
  });
  const finalize = useMutation({
    mutationFn: () =>
      api.post<FinalizeResult>('/resumes/finalize', compileBody(targetId, draft)),
    onSuccess: async (res) => {
      setFinalized(res);
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });

  const r = compile.data ?? null;

  return (
    <div className="card">
      <h2 className="card__title">Preview &amp; output</h2>

      <div className="chips" style={{ marginBottom: 8 }}>
        {templates.map((t) => (
          <button
            key={t.key}
            className="vt-chip"
            style={{ cursor: 'pointer', textTransform: 'capitalize', ...(t.key === draft.templateKey ? { borderColor: 'var(--ae-accent)', color: 'var(--ae-accent-soft)' } : {}) }}
            onClick={() => onDraft({ templateKey: t.key })}
          >
            {t.name ?? t.key}
          </button>
        ))}
      </div>

      <div className="tailor-style-controls">
        <label>
          <span>Wording emphasis</span>
          <select
            className="input"
            aria-label="Wording emphasis"
            value={draft.preferredEmphasis}
            onChange={(event) =>
              onDraft({ preferredEmphasis: event.target.value as Draft['preferredEmphasis'] })
            }
          >
            <option value="technical">Technical</option>
            <option value="leadership">Leadership</option>
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <div>
          <span>Accent</span>
          <div className="accent-picker" role="group" aria-label="Template accent">
            {accentOptions.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-label={`Use ${accent} accent`}
                aria-pressed={draft.accent === accent}
                className={draft.accent === accent ? 'active' : ''}
                style={{ background: accent }}
                onClick={() => onDraft({ accent })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
        <input className="input" placeholder="Headline (defaults to the role title)" value={draft.headline} onChange={(e) => onDraft({ headline: e.target.value })} />
        <textarea className="textarea" rows={3} placeholder="Summary paragraph (optional, appears under the header)" value={draft.summary} onChange={(e) => onDraft({ summary: e.target.value })} />
      </div>

      <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
        <Button variant="primary" glyph="resume" disabled={compile.isPending} onClick={() => compile.mutate()}>
          {compile.isPending ? 'Compiling…' : 'Compile PDF'}
        </Button>
        <Button variant="ghost" disabled={finalize.isPending || !r?.ok} onClick={() => finalize.mutate()} title={r?.ok ? 'Persist this résumé (one-page + coverage gate)' : 'Compile successfully first'}>
          {finalize.isPending ? 'Finalizing…' : 'Finalize'}
        </Button>
      </div>

      {finalized && (
        <div className="card" style={{ background: 'var(--ae-surface-overlay)', marginBottom: 10 }}>
          <div className="chips">
            <Chip tone={finalized.status === 'final' ? 'accent' : 'default'}>{finalized.status === 'final' ? '✓ finalized' : 'saved as draft'}</Chip>
            <Chip mono>{finalized.onePage ? '✓ one page' : `✗ ${finalized.pages ?? '?'} pages`}</Chip>
            <Chip mono>{finalized.gatePassed ? '✓ coverage gate' : '✗ below 95% coverage'}</Chip>
            {finalized.needsManualTrim && <Chip>needs manual trim</Chip>}
            {(finalized.fitDecisions?.length ?? 0) > 0 && (
              <Chip mono>{finalized.fitDecisions!.length} fit step{finalized.fitDecisions!.length === 1 ? '' : 's'}</Chip>
            )}
          </div>
          {finalized.needsManualTrim && (
            <p className="u-muted" style={{ marginTop: 8, fontSize: 'var(--ae-text-sm)' }}>
              Still over one page after auto trim. Drop or reword bullets in Selection, then finalize again.
            </p>
          )}
          {(finalized.fitDecisions?.length ?? 0) > 0 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {finalized.fitDecisions!.map((decision) => (
                <Chip key={`${decision.iteration}-${decision.atomId}`} mono>
                  #{decision.iteration} {decision.action === 'concise-swap' ? '→ concise' : 'dropped'} ·{' '}
                  {decision.pagesBefore}p
                </Chip>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Link to="/resume/outputs" className="vt-btn vt-btn--sm">Open Outputs →</Link>
          </div>
        </div>
      )}

      {compile.isPending ? (
        <Spinner />
      ) : !r ? (
        <div className="u-muted">Compile to preview the PDF and its ATS keyword coverage.</div>
      ) : (
        <>
          {r.coverage && (
            <div style={{ marginBottom: 10 }}>
              <div className="spread">
                <span className="u-muted">Weighted coverage</span>
                <Chip mono tone={r.coverage.passesGate ? 'accent' : 'default'}>
                  {Math.round(r.coverage.weightedPct * 100)}% {r.coverage.passesGate ? '✓ gate' : '· below 95%'}
                </Chip>
              </div>
              {r.coverage.gaps.length > 0 && (
                <div className="chips" style={{ marginTop: 6 }}>
                  <span className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>gaps:</span>
                  {r.coverage.gaps.slice(0, 12).map((g) => (
                    <Chip key={g.term}>{g.term}</Chip>
                  ))}
                </div>
              )}
            </div>
          )}
          {r.pages != null && (
            <div className="chips" style={{ marginBottom: 8 }}>
              <Chip mono tone={r.pages === 1 ? 'accent' : 'default'}>{r.pages} page{r.pages === 1 ? '' : 's'}</Chip>
            </div>
          )}

          {r.pdfBase64 ? (
            <PdfPreview base64={r.pdfBase64} />
          ) : r.offline ? (
            <div className="card" style={{ background: 'var(--ae-surface-overlay)' }}>
              <div className="spread" style={{ marginBottom: 8 }}>
                <Chip tone="accent">build service offline</Chip>
                <a className="vt-btn vt-btn--sm" download="resume.tex" href={`data:application/x-tex;charset=utf-8,${encodeURIComponent(r.tex)}`}>
                  Download .tex
                </a>
              </div>
              <div className="u-muted" style={{ fontSize: 'var(--ae-text-sm)' }}>
                Start it with <code>docker compose up -d buildsvc</code>, then compile again.
              </div>
            </div>
          ) : (
            <div className="card" style={{ background: 'var(--ae-surface-overlay)', borderColor: 'var(--ae-danger, #b3462e)' }}>
              <div className="spread" style={{ marginBottom: 8 }}>
                <Chip>compile failed</Chip>
                <a className="vt-btn vt-btn--sm" download="resume.tex" href={`data:application/x-tex;charset=utf-8,${encodeURIComponent(r.tex)}`}>
                  Download .tex
                </a>
              </div>
              <div style={{ fontSize: 'var(--ae-text-sm)', marginBottom: 6 }}>
                <strong>{r.error?.code ?? 'COMPILE_ERROR'}</strong>: {r.error?.message ?? 'compilation failed'}
                {r.error?.section ? ` (near section: ${r.error.section})` : ''}
              </div>
              {r.logTail && (
                <pre style={{ fontFamily: 'var(--ae-font-mono)', fontSize: 11, color: 'var(--ae-muted)', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {r.logTail}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
