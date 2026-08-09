import { useEffect, useState } from 'react';

/**
 * Renders a base64 PDF via a blob URL (robust for large documents, unlike
 * `data:` URIs). The object URL is created and revoked in an effect so it
 * never leaks across recompiles.
 */
export function PdfPreview({ base64, height = 520, downloadName = 'resume.pdf' }: { base64: string; height?: number; downloadName?: string }) {
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
    <div className="stack" style={{ gap: 8 }}>
      <iframe
        title="résumé preview"
        src={url}
        style={{ width: '100%', height, border: '1px solid var(--ae-border)', borderRadius: 6, background: '#fff' }}
      />
      <div className="hstack" style={{ justifyContent: 'flex-end' }}>
        <a className="vt-btn vt-btn--sm" href={url} download={downloadName}>
          Download PDF
        </a>
      </div>
    </div>
  );
}
