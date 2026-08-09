import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api, saveBlob } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

interface ExportStatus {
  last_export_at: string | null;
  counts: Record<string, number> | null;
}
interface SavedView {
  id: string;
  name: string;
  query: string;
}

const MANIFEST = ['nodes.jsonl', 'edges.jsonl', 'atoms.jsonl', '+16 more', 'vault/*.md', 'manifest.json'] as const;

/** Format the last-export timestamp for the backup panel. */
export function formatLastExport(lastExportAt: string | null | undefined): string {
  if (!lastExportAt) return 'never';
  return lastExportAt.slice(0, 16).replace('T', ' ');
}

/** Export & backups, no lock-in, reconstructable from its own ZIP. */
export function ExportPage() {
  const [building, setBuilding] = useState(false);
  // FR-001/FR-012: a default export excludes sensitive records AND everything
  // that references them, so it is safe to share but is NOT a complete backup.
  // Restoring from one is only honest if the user knew which they were making.
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const sensitiveId = useId();
  const { flash } = useToast();

  const status = useQuery({ queryKey: ['export-status'], queryFn: () => api.get<ExportStatus>('/export/status') });
  const views = useQuery({ queryKey: ['views'], queryFn: () => api.get<{ views: SavedView[] }>('/views') });

  async function exportAll() {
    setBuilding(true);
    try {
      const blob = await api.download('/export', { includeSensitive });
      saveBlob(blob, `vitae-export-${Date.now()}.zip`);
      await status.refetch();
      flash(includeSensitive ? 'Backup built, includes sensitive records' : 'Export built, check your downloads');
    } catch (err) {
      flash((err as Error).message || 'Export failed', { variant: 'error' });
    } finally {
      setBuilding(false);
    }
  }

  // FR-014: goes through the shared client, so it carries the bearer token AND
  // the active data space, a raw fetch exported the real graph from demo mode.
  async function exportView(v: SavedView) {
    try {
      const blob = await api.downloadGet(`/export/views/${v.id}.csv`);
      saveBlob(blob, `${v.name.replace(/[^\w.-]+/g, '-')}.csv`);
      flash(`Exported “${v.name}” as CSV`);
    } catch (err) {
      flash((err as Error).message || 'CSV export failed', { variant: 'error' });
    }
  }

  const counts = status.data?.counts;
  const countEntries = counts ? Object.entries(counts) : [];

  return (
    <div className="page">
      <PageHeader
        title="Export & backups"
        subtitle="No lock-in: the system must be reconstructable from its own export."
        help={
          <InfoPopover title="What leaves the database">
            <p>
              A full export is one JSONL per collection, an Obsidian-compatible Markdown vault, and a manifest with
              SHA-256 checksums. Restore with <Mono style={{ fontSize: 11 }}>pnpm --filter @vitae/api restore</Mono>.
            </p>
            <p>
              Leaving sensitive records out is safe to share, but that bundle cannot rebuild your database. Only the
              full backup is a complete restore source.
            </p>
          </InfoPopover>
        }
      />
      <RegisterRule
        ticks={
          countEntries.length > 0
            ? countEntries.slice(0, 12).map(([key], i, all) => ({
                at: all.length === 1 ? 0.5 : i / (all.length - 1),
                label: key,
              }))
            : undefined
        }
        label={countEntries.length > 0 ? 'Collections in the last export' : undefined}
      />

      <div className="grid-2">
        <Section title="Full export">
          <p className="m-0 mb-3 text-sm text-ink-soft">
            One JSONL per collection (identity-preserving) + an Obsidian-compatible Markdown vault + a manifest with
            SHA-256 checksums.
          </p>
          <div className="chips" style={{ marginBottom: 14 }}>
            {MANIFEST.map((part) => (
              <Chip key={part} mono>
                {part}
              </Chip>
            ))}
          </div>

          <label
            className="spread"
            htmlFor={sensitiveId}
            style={{ gap: 10, marginBottom: 14, cursor: 'pointer', alignItems: 'flex-start' }}
          >
            <input
              id={sensitiveId}
              type="checkbox"
              checked={includeSensitive}
              onChange={(e) => setIncludeSensitive(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontSize: 'var(--ae-text-base)', color: 'var(--ae-fg-soft)' }}>
                Include sensitive records
              </span>
              <span className="u-muted" style={{ display: 'block', fontSize: 'var(--ae-text-sm)', lineHeight: 1.5 }}>
                {includeSensitive
                  ? 'This is a complete backup, the only export you can fully restore from. Store it somewhere you would store a password.'
                  : 'Safe to share: sensitive records and everything referencing them are left out, which also means this bundle cannot rebuild your database.'}
              </span>
            </span>
          </label>

          <Button
            variant="primary"
            glyph="export"
            disabled={building}
            onClick={() => void exportAll()}
            aria-label={includeSensitive ? 'Export full backup including sensitive records' : 'Export everything excluding sensitive records'}
          >
            {building ? 'Building…' : includeSensitive ? 'Export full backup' : 'Export everything'}
          </Button>
        </Section>

        <Section title="Backup status">
          {status.isError ? (
            <ErrorState
              title="Couldn’t load backup status"
              detail={(status.error as Error | null)?.message}
              onRetry={() => void status.refetch()}
            />
          ) : status.isLoading ? (
            <div role="status" aria-label="Loading backup status">
              <SkeletonRows rows={4} />
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread">
                <span className="u-muted">Last export</span>
                <Mono>{formatLastExport(status.data?.last_export_at)}</Mono>
              </div>
              {countEntries.map(([k, v]) => (
                <div key={k} className="spread">
                  <span className="u-muted">{k}</span>
                  <Mono>{v}</Mono>
                </div>
              ))}
              {!status.data?.last_export_at && (
                <p className="u-muted" style={{ fontSize: 'var(--ae-text-sm)', margin: 0 }}>
                  Run a full export at least monthly, it is the only backup that leaves the database.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Saved views → CSV" meta={views.isSuccess ? views.data.views.length : undefined}>
          {views.isError ? (
            <ErrorState
              title="Couldn’t load saved views"
              detail={(views.error as Error | null)?.message}
              onRetry={() => void views.refetch()}
            />
          ) : views.isLoading ? (
            <div role="status" aria-label="Loading saved views">
              <SkeletonRows rows={3} />
            </div>
          ) : (views.data?.views.length ?? 0) === 0 ? (
            <EmptyState
              glyph="export"
              title="No saved views yet"
              hint="Save a view in Collections and it becomes a one-click CSV extract here."
            />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {views.data!.views.map((v) => (
                <div key={v.id} className="spread">
                  <div>
                    <div style={{ fontSize: 'var(--ae-text-base)', color: 'var(--ae-fg-soft)' }}>{v.name}</div>
                    <Mono className="u-faint" style={{ fontSize: 11 }}>
                      {v.query}
                    </Mono>
                  </div>
                  <Button
                    size="sm"
                    glyph="export"
                    onClick={() => void exportView(v)}
                    aria-label={`Export ${v.name} as CSV`}
                  >
                    CSV
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
