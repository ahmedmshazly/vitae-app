import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Button,
  EmptyState,
  ErrorState,
  Glyph,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
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

const MANIFEST = [
  'nodes.jsonl',
  'edges.jsonl',
  'atoms.jsonl',
  '+16 more',
  'vault/*.md',
  'manifest.json',
] as const;

/** Format the last-export timestamp for the backup panel. */
export function formatLastExport(lastExportAt: string | null | undefined): string {
  if (!lastExportAt) return 'never';
  return lastExportAt.slice(0, 16).replace('T', ' ');
}

/** Export & backups, no lock-in, reconstructable from its own ZIP. */
export function ExportPage() {
  const [building, setBuilding] = useState(false);
  const [exportingViewId, setExportingViewId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [completedExport, setCompletedExport] = useState<
    'share-safe' | 'full-backup' | 'csv' | null
  >(null);
  // FR-001/FR-012: a default export excludes sensitive records AND everything
  // that references them, so it is safe to share but is NOT a complete backup.
  // Restoring from one is only honest if the user knew which they were making.
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const sensitiveId = useId();
  const { flash } = useToast();

  const status = useQuery({
    queryKey: ['export-status'],
    queryFn: () => api.get<ExportStatus>('/export/status'),
  });
  const views = useQuery({
    queryKey: ['views'],
    queryFn: () => api.get<{ views: SavedView[] }>('/views'),
  });

  async function exportAll() {
    setBuilding(true);
    setExportError(null);
    setCompletedExport(null);
    try {
      const blob = await api.download('/export', { includeSensitive });
      saveBlob(blob, `vitae-export-${Date.now()}.zip`);
      void status.refetch();
      setCompletedExport(includeSensitive ? 'full-backup' : 'share-safe');
      flash(
        includeSensitive
          ? 'Backup built, includes sensitive records'
          : 'Export built, check your downloads',
      );
    } catch (err) {
      const message = (err as Error).message || 'Export failed';
      setExportError(message);
      flash(message, { variant: 'error' });
    } finally {
      setBuilding(false);
    }
  }

  // FR-014: goes through the shared client, so it carries the bearer token AND
  // the active data space, a raw fetch exported the real graph from demo mode.
  async function exportView(v: SavedView) {
    setExportingViewId(v.id);
    setExportError(null);
    setCompletedExport(null);
    try {
      const blob = await api.downloadGet(`/export/views/${v.id}.csv`);
      saveBlob(blob, `${v.name.replace(/[^\w.-]+/g, '-')}.csv`);
      setCompletedExport('csv');
      flash(`Exported '${v.name}' as CSV`);
    } catch (err) {
      const message = (err as Error).message || 'CSV export failed';
      setExportError(message);
      flash(message, { variant: 'error' });
    } finally {
      setExportingViewId(null);
    }
  }

  const counts = status.data?.counts;
  const countEntries = counts ? Object.entries(counts) : [];
  const exporting = building || Boolean(exportingViewId);

  return (
    <div className="page data-workspace-page data-export-page">
      <PageHeader
        title="Export & backups"
        subtitle="No lock-in: the system must be reconstructable from its own export."
        help={
          <InfoPopover title="What leaves the database">
            <p>
              A full export is one JSONL per collection, an Obsidian-compatible Markdown vault, and
              a manifest with SHA-256 checksums. Restore with{' '}
              <Mono style={{ fontSize: 11 }}>pnpm --filter @vitae/api restore</Mono>.
            </p>
            <p>
              Leaving sensitive records out is safe to share, but that bundle cannot rebuild your
              database. Only the full backup is a complete restore source.
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

      <nav className="data-process" aria-label="Export workflow">
        <ol>
          <li
            data-state={exporting || completedExport ? 'done' : 'current'}
            aria-current={!exporting && !completedExport ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Choose scope</strong>
              <small>Archive scope or saved view</small>
            </span>
          </li>
          <li
            data-state={exporting ? 'current' : completedExport ? 'done' : 'upcoming'}
            aria-current={exporting ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Build archive</strong>
              <small>Portable file with verified structure</small>
            </span>
          </li>
          <li
            data-state={completedExport ? 'current' : 'upcoming'}
            aria-current={completedExport ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Store deliberately</strong>
              <small>Downloads remain under your control</small>
            </span>
          </li>
        </ol>
      </nav>

      <div className="data-operation-trace">
        {building ? (
          <StatusTrace
            tone="live"
            label="Building portable archive"
            detail="The download starts when ready"
          />
        ) : exportingViewId ? (
          <StatusTrace
            tone="live"
            label="Building saved-view CSV"
            detail="The download starts when ready"
          />
        ) : exportError ? (
          <StatusTrace tone="danger" label="Export did not finish" detail={exportError} />
        ) : completedExport ? (
          <StatusTrace
            tone="success"
            label={completedExport === 'csv' ? 'CSV download started' : 'Archive download started'}
            detail={
              completedExport === 'full-backup'
                ? 'Includes sensitive records'
                : 'Check your downloads'
            }
          />
        ) : includeSensitive ? (
          <StatusTrace
            tone="warning"
            label="Complete-backup scope selected"
            detail="Includes sensitive records"
          />
        ) : (
          <StatusTrace
            tone="neutral"
            label="Share-safe scope selected"
            detail="Not a complete restore source"
          />
        )}
      </div>

      <div className="data-export-layout">
        <div className="data-export-primary">
          <Section title="Portable archive">
            <p className="m-0 mb-3 text-sm text-ink-soft">
              One JSONL per collection (identity-preserving) + an Obsidian-compatible Markdown vault
              + a manifest with SHA-256 checksums.
            </p>
            <ul className="data-export-manifest" aria-label="Archive contents">
              {MANIFEST.map((part) => (
                <li key={part}>
                  <Glyph
                    name={part === 'manifest.json' ? 'check' : 'document'}
                    size={14}
                    aria-hidden
                  />
                  <Mono>{part}</Mono>
                </li>
              ))}
            </ul>

            <label
              className="data-export-scope"
              htmlFor={sensitiveId}
              data-sensitive={includeSensitive || undefined}
            >
              <input
                id={sensitiveId}
                type="checkbox"
                checked={includeSensitive}
                onChange={(e) => {
                  setIncludeSensitive(e.target.checked);
                  setCompletedExport(null);
                  setExportError(null);
                }}
              />
              <span>
                <strong>Include sensitive records</strong>
                <span>
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
              aria-label={
                includeSensitive
                  ? 'Export full backup including sensitive records'
                  : 'Export everything excluding sensitive records'
              }
            >
              {building
                ? 'Building...'
                : includeSensitive
                  ? 'Export full backup'
                  : 'Export everything'}
            </Button>
          </Section>
        </div>

        <div className="data-export-status">
          <Section title="Backup status">
            {status.isError ? (
              <ErrorState
                title="Couldn't load backup status"
                detail={(status.error as Error | null)?.message}
                onRetry={() => void status.refetch()}
              />
            ) : status.isLoading ? (
              <div role="status" aria-label="Loading backup status">
                <SkeletonRows rows={4} />
              </div>
            ) : (
              <dl className="data-definition-ledger">
                <div>
                  <dt>Last export</dt>
                  <dd>
                    <Mono>{formatLastExport(status.data?.last_export_at)}</Mono>
                  </dd>
                </div>
                {countEntries.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <Mono>{v}</Mono>
                    </dd>
                  </div>
                ))}
                {!status.data?.last_export_at && (
                  <div className="data-definition-ledger__note">
                    <dt className="u-visually-hidden">Backup guidance</dt>
                    <dd>
                      Run a full export at least monthly, it is the only backup that leaves the
                      database.
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </Section>
        </div>

        <div className="data-export-views">
          <Section
            title="Saved views → CSV"
            meta={views.isSuccess ? views.data.views.length : undefined}
          >
            {views.isError ? (
              <ErrorState
                title="Couldn't load saved views"
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
                hint="Save a view in the Library and it becomes a one-click CSV extract here."
                action={
                  <Link to="/explore/library" className="vt-btn vt-btn--sm">
                    Open Library
                  </Link>
                }
              />
            ) : (
              <div className="data-view-ledger">
                {views.data!.views.map((v, index) => (
                  <div key={v.id} className="data-view-ledger__row">
                    <Mono className="data-ledger-index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </Mono>
                    <div>
                      <strong>{v.name}</strong>
                      <Mono className="u-faint">{v.query}</Mono>
                    </div>
                    <Button
                      size="sm"
                      glyph="export"
                      disabled={Boolean(exportingViewId)}
                      onClick={() => void exportView(v)}
                      aria-label={`Export ${v.name} as CSV`}
                    >
                      {exportingViewId === v.id ? 'Building...' : 'CSV'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
