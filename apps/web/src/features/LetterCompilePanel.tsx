import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Banner, Button, Chip, ErrorState, Mono, StatusTrace } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

/** The shape both /compile and /finalize answer with (FR-RES-021). */
export interface LetterCompileResponse {
  ok: boolean;
  pages: number | null;
  offline: boolean;
  error: { code: string; message: string; section?: string } | null;
  logTail: string | null;
  pdfBase64: string | null;
  tex: string;
  template: string;
}

interface Props {
  letterId: string;
  letterStatus: string;
  /** True once a finalize has stored the pair, so the panel can say so. */
  hasStoredArtifacts: boolean;
  onFinalized?: () => void;
}

/** A .tex download, offered whenever the PDF itself could not be produced. */
function TexDownload({ tex, letterId }: { tex: string; letterId: string }) {
  return (
    <a
      className="vt-btn vt-btn--sm"
      download={`letter-${letterId}.tex`}
      href={`data:application/x-tex;charset=utf-8,${encodeURIComponent(tex)}`}
    >
      Download .tex
    </a>
  );
}

/**
 * The compiled letter, in an iframe that says it is a letter.
 *
 * components/PdfPreview does the same blob-URL dance but hardcodes its iframe
 * title to "résumé preview", and a cover letter announced as a résumé is the
 * kind of small lie a screen reader user has no way to check.
 */
function LetterPdf({ base64, letterId }: { base64: string; letterId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setUrl(blobUrl);
    return () => {
      URL.revokeObjectURL(blobUrl);
      setUrl(null);
    };
  }, [base64]);

  if (!url) return null;
  return (
    <div className="flex flex-col gap-2">
      <iframe
        title="cover letter preview"
        src={url}
        style={{
          width: '100%',
          height: 520,
          border: '1px solid var(--ae-border)',
          borderRadius: 6,
          background: '#fff',
        }}
      />
      <div className="flex justify-end">
        <a className="vt-btn vt-btn--sm" href={url} download={`letter-${letterId}.pdf`}>
          Download PDF
        </a>
      </div>
    </div>
  );
}

/**
 * Compile a stored letter to the artifact pair a résumé compiles to: a PDF and
 * its LaTeX source, through the same sandboxed compiler (FR-RES-021).
 *
 * Preview and finalize are separate on purpose, the same way they are for a
 * résumé: preview stores nothing, finalize keeps the pair and marks the letter
 * final. When the compiler cannot be reached, neither one fails the screen,
 * the source is complete either way and is offered in place of the PDF
 * (FR-RES-013 / REL-005).
 */
export function LetterCompilePanel({ letterId, letterStatus, hasStoredArtifacts, onFinalized }: Props) {
  const [result, setResult] = useState<LetterCompileResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const canWrite = useCanWrite();

  const run = useMutation({
    mutationFn: async (mode: 'compile' | 'finalize') =>
      api.post<LetterCompileResponse>(`/letters/${letterId}/${mode}`),
    onMutate: () => {
      setFailure(null);
      setResult(null);
    },
    onSuccess: (response, mode) => {
      setResult(response);
      if (mode === 'finalize' && response.ok) onFinalized?.();
    },
    onError: (error) => {
      // A letter with no text never reaches the compiler at all, and that 422
      // arrives as a thrown request rather than as a compile result.
      setFailure(error instanceof Error ? error.message : 'The letter could not be compiled.');
    },
  });

  const busy = run.isPending;

  return (
    <section className="flex flex-col gap-3" aria-label="Compile this letter">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !canWrite} onClick={() => run.mutate('compile')}>
          Compile preview
        </Button>
        <Button size="sm" variant="primary" disabled={busy || !canWrite} onClick={() => run.mutate('finalize')}>
          {letterStatus === 'draft' ? 'Finalize letter' : 'Rebuild artifacts'}
        </Button>
        {hasStoredArtifacts && <Chip mono>PDF and source stored</Chip>}
      </div>
      {!canWrite ? <p className="m-0 text-sm text-muted">{WRITE_LOCK_HINT}</p> : null}

      {busy && (
        <StatusTrace
          tone="live"
          label={run.variables === 'finalize' ? 'Finalizing letter' : 'Compiling letter'}
        />
      )}

      {failure && (
        <Banner tone="danger" title="This letter could not be compiled">
          {failure}
        </Banner>
      )}

      {!busy && !failure && !result && (
        <p className="m-0 text-sm text-muted">
          Compile to preview the PDF. Finalize keeps the PDF and its LaTeX source as this letter’s
          artifacts.
        </p>
      )}

      {result && (
        <>
          {result.pages != null && (
            <div className="chips">
              <Chip mono>
                {result.pages} page{result.pages === 1 ? '' : 's'}
              </Chip>
              <Mono className="text-xs text-muted">{result.template}</Mono>
            </div>
          )}

          {result.pdfBase64 ? (
            <LetterPdf base64={result.pdfBase64} letterId={letterId} />
          ) : result.offline ? (
            <Banner
              tone="warning"
              title="Build service offline"
              action={<TexDownload tex={result.tex} letterId={letterId} />}
            >
              The compiler is unreachable, so there is no PDF to show. Start it with{' '}
              <code>docker compose up -d buildsvc</code>, then compile again. The LaTeX source is
              complete either way.
            </Banner>
          ) : (
            <div>
              <ErrorState
                title="Compile failed"
                detail={`${result.error?.code ?? 'COMPILE_ERROR'}: ${
                  result.error?.message ?? 'The letter did not typeset.'
                }`}
                action={<TexDownload tex={result.tex} letterId={letterId} />}
              />
              {result.logTail && (
                <details className="mt-2">
                  <summary className="inline-flex min-h-[32px] cursor-pointer items-center text-xs text-faint">
                    LaTeX log
                  </summary>
                  <pre className="mt-2 max-h-[220px] overflow-auto font-mono text-xs whitespace-pre-wrap text-muted">
                    {result.logTail}
                  </pre>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
