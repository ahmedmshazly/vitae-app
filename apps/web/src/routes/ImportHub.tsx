import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Glyph,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Skeleton,
  SkeletonRows,
  type GlyphName,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

interface StagedRow {
  id: string;
  index: number;
  entity: string;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
  confidence: number;
  dup: { nodeId: string; nodeTitle: string; weight: number; verdict: string; evidence: string[] } | null;
  decision: 'accept' | 'skip';
  status: string;
}
export interface Batch {
  id: string;
  kind: string;
  detail: string | null;
  filename: string | null;
  status: 'staged' | 'committed' | 'discarded' | 'rolled_back';
  created_at: string;
  stats: { rows: number; accepted: number; dupCandidates: number; created?: number; failed?: number };
}
interface SettingsResp {
  github: { configured: boolean; lastSyncAt: string | null };
}

type Kind = 'linkedin' | 'contacts' | 'calendar' | 'bookmarks' | 'resume' | 'aperture';

const IMPORTERS: Array<{ kind: Kind | 'github'; glyph: GlyphName; name: string; desc: string; accept?: string }> = [
  { kind: 'linkedin', glyph: 'person', name: 'LinkedIn export', desc: 'Positions, Education, Skills, Connections CSVs', accept: '.csv' },
  { kind: 'github', glyph: 'repository', name: 'GitHub sync', desc: 'Repos → repository nodes, languages → skills' },
  { kind: 'contacts', glyph: 'person', name: 'Contacts', desc: 'vCard (.vcf) or CSV address book', accept: '.vcf,.csv,.txt' },
  { kind: 'resume', glyph: 'resume', name: 'Résumé disassembly', desc: 'Paste text, lines become résumé atoms' },
  { kind: 'bookmarks', glyph: 'link', name: 'Bookmarks', desc: 'Browser bookmarks HTML export', accept: '.html,.htm' },
  { kind: 'calendar', glyph: 'calendar', name: 'Calendar', desc: 'ICS events: RRULE kept, not expanded', accept: '.ics' },
  {
    kind: 'aperture',
    glyph: 'graph',
    name: 'Aperture bundle',
    desc: 'Scraped people, posts and companies as linked records',
    accept: '.json',
  },
];

export type SourceStatus = { label: string; tone: 'muted' | 'warning' | 'success' | 'danger' };

/**
 * Status shown on each source card. GitHub reads settings, not import history;
 * every other source shows the newest batch of that kind. Keep the labels short:
 * the card itself already names the source.
 */
export function sourceStatus(
  kind: Kind | 'github',
  lastByKind: Map<string, Batch>,
  github: SettingsResp['github'] | undefined,
  settingsState: 'loading' | 'error' | 'ready',
): SourceStatus {
  if (kind === 'github') {
    if (settingsState === 'loading') return { label: 'checking', tone: 'muted' };
    if (settingsState === 'error') return { label: 'settings unavailable', tone: 'danger' };
    if (!github?.configured) return { label: 'needs token', tone: 'warning' };
    return github.lastSyncAt
      ? { label: `synced ${github.lastSyncAt.slice(0, 10)}`, tone: 'success' }
      : { label: 'ready', tone: 'muted' };
  }
  const last = lastByKind.get(kind);
  if (!last) return { label: 'ready', tone: 'muted' };
  return {
    label: last.status === 'staged' ? 'staged' : `${last.status} ${last.created_at.slice(0, 10)}`,
    tone: last.status === 'staged' ? 'warning' : 'muted',
  };
}

const STATUS_COLOR: Record<SourceStatus['tone'], string> = {
  muted: 'var(--ae-muted)',
  warning: 'var(--ae-warning)',
  success: 'var(--ae-success)',
  danger: 'var(--ae-danger)',
};

/** Bulk seeding with staging, review, commit, and per-batch rollback. */
export function ImportHub() {
  const [active, setActive] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mapperCsv, setMapperCsv] = useState<{ filename: string; content: string; headers: string[] } | null>(null);
  const [fileAccept, setFileAccept] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingKind = useRef<Kind>('linkedin');
  const qc = useQueryClient();
  const { flash } = useToast();

  const batches = useQuery({ queryKey: ['imports'], queryFn: () => api.get<{ batches: Batch[] }>('/imports') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsResp>('/settings') });
  const batch = useQuery({
    queryKey: ['import', active],
    queryFn: () => api.get<{ batch: Batch; rows: StagedRow[] }>(`/imports/${active}`),
    enabled: Boolean(active),
  });

  const owners = useQuery({
    queryKey: ['atom-owners'],
    queryFn: async () => {
      const [roles, projects] = await Promise.all([
        api.get<{ nodes: Array<{ id: string; title: string }> }>('/nodes?type=role&limit=100'),
        api.get<{ nodes: Array<{ id: string; title: string }> }>('/nodes?type=project&limit=100'),
      ]);
      return [...roles.nodes.map((n) => ({ ...n, kind: 'role' })), ...projects.nodes.map((n) => ({ ...n, kind: 'project' }))];
    },
    enabled: batch.data?.rows.some((r) => r.entity === 'atom') ?? false,
  });

  const stage = useMutation({
    mutationFn: (body: { kind: Kind; filename?: string | null; content: string; mapping?: Record<string, string> }) =>
      api.post<{ batch: Batch; rows: StagedRow[] }>('/imports', body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['imports'] });
      setActive(res.batch.id);
      setPasteOpen(false);
      setMapperCsv(null);
      flash(`Staged ${res.batch.stats.rows} rows. Nothing committed yet`);
    },
  });

  const githubSync = useMutation({
    mutationFn: () => api.post<{ status: string; created: number; updated: number }>('/imports/github/sync'),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      flash(
        r.status === 'not_modified'
          ? 'GitHub already up to date'
          : `GitHub: ${r.created} new, ${r.updated} updated`,
      );
    },
  });

  function openImporter(kind: Kind | 'github') {
    if (kind === 'github') {
      if (settings.isError) {
        flash('Couldn’t read Settings. Add a GitHub token there, then retry.');
        return;
      }
      if (!settings.data?.github.configured) {
        flash('Add a GitHub token in Settings first');
        return;
      }
      githubSync.mutate();
      return;
    }
    if (kind === 'resume') {
      setPasteOpen(true);
      return;
    }
    pendingKind.current = kind;
    setFileAccept(IMPORTERS.find((im) => im.kind === kind)?.accept);
    // Defer the click so the accept attribute is committed before the chooser opens.
    queueMicrotask(() => fileInput.current?.click());
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      const kind = pendingKind.current;
      if (kind === 'contacts' && !/BEGIN:VCARD/i.test(content)) {
        const headers = (content.split(/\r?\n/, 1)[0] ?? '')
          .split(',')
          .map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
          .filter(Boolean);
        const known = ['name', 'full_name', 'first_name', 'given_name'];
        if (!headers.some((h) => known.includes(h))) {
          setMapperCsv({ filename: file.name, content, headers });
          return;
        }
      }
      stage.mutate({ kind, filename: file.name, content });
    };
    reader.readAsText(file);
  }

  const rowDecision = useMutation({
    mutationFn: ({ rowId, decision, payload }: { rowId: string; decision?: 'accept' | 'skip'; payload?: Record<string, unknown> }) =>
      api.patch(`/imports/${active}/rows/${rowId}`, { decision, payload }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['import', active] }),
  });

  const commit = useMutation({
    mutationFn: () => api.post<{ created: number; failed?: number }>(`/imports/${active}/commit`),
    onSuccess: (r) => {
      const batchId = active;
      void qc.invalidateQueries();
      flash(`Committed ${r.created} records${r.failed ? ` · ${r.failed} rows failed and stayed staged` : ''}`, {
        undo: async () => {
          await api.post(`/imports/${batchId}/rollback`);
          await qc.invalidateQueries();
          flash('Import rolled back. Records removed');
        },
      });
      setActive(null);
    },
  });

  const discard = useMutation({
    mutationFn: () => api.post(`/imports/${active}/discard`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['imports'] });
      setActive(null);
      flash('Staged import discarded. Nothing was written');
    },
  });

  const rollback = useMutation({
    mutationFn: (id: string) => api.post<{ removed: number }>(`/imports/${id}/rollback`),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      if (active) setActive(null);
      flash(`Rolled back: ${r.removed} records removed`);
    },
  });

  const lastByKind = useMemo(() => {
    const m = new Map<string, Batch>();
    for (const b of batches.data?.batches ?? []) if (!m.has(b.kind)) m.set(b.kind, b);
    return m;
  }, [batches.data]);

  const settingsState: 'loading' | 'error' | 'ready' = settings.isError
    ? 'error'
    : settings.isLoading || !settings.data
      ? 'loading'
      : 'ready';

  const history = batches.data?.batches ?? [];
  const stagedCount = history.filter((b) => b.status === 'staged').length;
  const rows = batch.data?.rows ?? [];
  const accepted = rows.filter((r) => r.decision === 'accept');
  const isStaged = batch.data?.batch.status === 'staged';
  const busy = stage.isPending || githubSync.isPending;

  return (
    <div className="page">
      <PageHeader
        title="Import"
        subtitle="Everything stages first. Nothing commits without review, and every batch rolls back as a unit."
        help={
          <InfoPopover title="Why staging">
            <p>
              An import parses and dedupe-checks before it writes. You accept or skip each row, then commit :
              or discard the batch and leave the graph untouched.
            </p>
            <p>A committed batch can still be rolled back; the records it created are removed together.</p>
          </InfoPopover>
        }
        actions={
          <Link to="/import/duplicates" className="vt-btn vt-btn--sm">
            <Glyph name="merge" size={14} /> Duplicates
          </Link>
        }
      />
      <RegisterRule
        ticks={
          stagedCount > 0
            ? history
                .filter((b) => b.status === 'staged')
                .slice(0, 12)
                .map((b, i, all) => ({
                  at: all.length === 1 ? 0.5 : i / (all.length - 1),
                  label: `${b.kind} · ${b.stats.rows} rows`,
                }))
            : undefined
        }
        label={stagedCount > 0 ? 'Staged imports waiting for review' : undefined}
      />

      <input
        ref={fileInput}
        type="file"
        accept={fileAccept}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <Section title="Sources" meta={IMPORTERS.length}>
        <div className="imp__cards">
          {IMPORTERS.map((im) => {
            const st = sourceStatus(im.kind, lastByKind, settings.data?.github, settingsState);
            const pending =
              (im.kind === 'github' && githubSync.isPending) || (im.kind !== 'github' && stage.isPending && pendingKind.current === im.kind);
            return (
              <button
                key={im.kind}
                type="button"
                className="imp__card"
                onClick={() => openImporter(im.kind)}
                disabled={busy}
                aria-label={
                  im.kind === 'github'
                    ? `Sync GitHub: ${st.label}`
                    : im.kind === 'resume'
                      ? `Open résumé disassembly: ${st.label}`
                      : `Import ${im.name}: ${st.label}`
                }
              >
                <div className="spread">
                  <span className="imp__glyph" aria-hidden>
                    <Glyph name={im.glyph} size={16} />
                  </span>
                  <Mono style={{ fontSize: 10, color: STATUS_COLOR[st.tone] }}>{pending ? 'working…' : st.label}</Mono>
                </div>
                <div className="imp__name">{im.name}</div>
                <div className="imp__desc">{im.desc}</div>
              </button>
            );
          })}
        </div>
      </Section>

      {pasteOpen && (
        <Section title="Résumé disassembly">
          <p className="m-0 mb-3 text-sm text-ink-soft">
            Paste résumé text. Substantial lines become candidate atoms; assign each to a role or project, then commit.
          </p>
          <textarea
            className="textarea"
            rows={10}
            aria-label="Résumé text to disassemble"
            placeholder="Paste your résumé text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="hstack" style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              disabled={!pasteText.trim() || stage.isPending}
              onClick={() => stage.mutate({ kind: 'resume', content: pasteText })}
            >
              {stage.isPending ? 'Staging…' : 'Disassemble'}
            </Button>
            <Button onClick={() => setPasteOpen(false)}>Cancel</Button>
          </div>
        </Section>
      )}

      {mapperCsv && (
        <CsvMapper
          headers={mapperCsv.headers}
          filename={mapperCsv.filename}
          onCancel={() => setMapperCsv(null)}
          onConfirm={(mapping) =>
            stage.mutate({ kind: 'contacts', filename: mapperCsv.filename, content: mapperCsv.content, mapping })
          }
        />
      )}

      {active && (
        <Section
          title="Review"
          meta={batch.data ? `${batch.data.batch.kind} · ${batch.data.batch.status}` : undefined}
          actions={
            isStaged ? (
              <Mono style={{ fontSize: 11, color: 'var(--ae-warning)' }}>review before commit</Mono>
            ) : undefined
          }
        >
          {batch.isError ? (
            <ErrorState
              title="Couldn’t load this import batch"
              detail={(batch.error as Error | null)?.message}
              onRetry={() => void batch.refetch()}
            />
          ) : batch.isLoading || !batch.data ? (
            <div role="status" aria-label="Loading staged rows">
              <SkeletonRows rows={5} />
            </div>
          ) : (
            <>
              <p className="m-0 mb-3 text-sm text-ink-soft">
                {batch.data.batch.status === 'staged' ? 'Staged' : batch.data.batch.status}
                {batch.data.batch.detail ? ` · ${batch.data.batch.detail}` : ''}
                {batch.data.batch.filename ? ` · ${batch.data.batch.filename}` : ''}
                {batch.data.batch.status === 'staged'
                  ? ', accept or skip each row, then commit.'
                  : '.'}
              </p>
              {rows.length === 0 ? (
                <EmptyState glyph="capture" title="This batch has no rows" hint="Discard it and import again from a source above." />
              ) : (
                <div className="imp__panel" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {rows.map((r) => (
                    <div key={r.id} className="imp__row">
                      <Mono className="u-faint" style={{ width: 70, fontSize: 11 }}>
                        {r.entity}
                      </Mono>
                      <div className="row__main">
                        <div className="row__title">{r.title}</div>
                        {r.subtitle && <div className="row__sub">{r.subtitle}</div>}
                      </div>
                      {r.entity === 'atom' && isStaged && (
                        <select
                          className="input"
                          style={{ width: 180 }}
                          aria-label={`Assign ${r.title} to a role or project`}
                          value={(r.payload.owner_node as string) ?? ''}
                          onChange={(e) => rowDecision.mutate({ rowId: r.id, payload: { owner_node: e.target.value } })}
                        >
                          <option value="">assign to…</option>
                          {(owners.data ?? []).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.kind}: {o.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <Mono className="u-faint" style={{ fontSize: 11 }}>
                        conf {r.confidence.toFixed(2)}
                      </Mono>
                      {r.dup ? (
                        <Chip
                          tone={r.dup.verdict === 'probable' ? 'danger' : 'warning'}
                          title={`≈ ${r.dup.nodeTitle} · ${r.dup.evidence.join(', ')} · weight ${r.dup.weight}`}
                        >
                          {r.dup.verdict} dup
                        </Chip>
                      ) : (
                        <Chip tone="success">new</Chip>
                      )}
                      {isStaged && (
                        <button
                          type="button"
                          className={`imp__toggle${r.decision === 'accept' ? ' imp__toggle--on' : ''}`}
                          aria-pressed={r.decision === 'accept'}
                          aria-label={
                            r.decision === 'accept'
                              ? `Skip ${r.title} (currently accepted)`
                              : `Accept ${r.title} (currently skipped)`
                          }
                          onClick={() =>
                            rowDecision.mutate({
                              rowId: r.id,
                              decision: r.decision === 'accept' ? 'skip' : 'accept',
                            })
                          }
                        >
                          {r.decision}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="imp__stagfoot">
                <Mono style={{ fontSize: 11, color: 'var(--ae-faint)' }}>
                  {rows.filter((r) => !r.dup).length} new · {rows.filter((r) => r.dup).length} candidates ·{' '}
                  {rows.filter((r) => r.status === 'committed').length} committed
                </Mono>
                <div className="hstack">
                  {isStaged ? (
                    <>
                      <Button onClick={() => discard.mutate()} disabled={discard.isPending}>
                        {discard.isPending ? 'Discarding…' : 'Discard'}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => commit.mutate()}
                        disabled={commit.isPending || accepted.length === 0}
                      >
                        {commit.isPending
                          ? 'Committing…'
                          : `Commit ${accepted.length} row${accepted.length === 1 ? '' : 's'}`}
                      </Button>
                    </>
                  ) : batch.data.batch.status === 'committed' ? (
                    <Button
                      variant="danger"
                      onClick={() => rollback.mutate(active)}
                      disabled={rollback.isPending}
                      aria-label={`Roll back ${batch.data.batch.kind} import from ${batch.data.batch.created_at.slice(0, 10)}: ${batch.data.batch.stats.created ?? batch.data.batch.stats.rows} records`}
                    >
                      {rollback.isPending ? 'Rolling back…' : 'Roll back batch'}
                    </Button>
                  ) : (
                    <Button onClick={() => setActive(null)}>Close</Button>
                  )}
                </div>
              </div>
            </>
          )}
          {batch.isError && (
            <div className="hstack" style={{ marginTop: 12 }}>
              <Button onClick={() => setActive(null)}>Close</Button>
            </div>
          )}
        </Section>
      )}

      <Section title="Batch history" meta={batches.isSuccess ? history.length : undefined}>
        {batches.isError ? (
          <ErrorState
            title="Couldn’t load import history"
            detail={(batches.error as Error | null)?.message}
            onRetry={() => void batches.refetch()}
          />
        ) : batches.isLoading ? (
          <div role="status" aria-label="Loading import history">
            <HistorySkeleton />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            glyph="capture"
            title="No imports yet"
            hint="Pick a source above. Everything stages before it commits."
          />
        ) : (
          // FR-023: the row is a real button, so it is reachable by Tab and
          // activates with Enter/Space. The Roll back action is a sibling, not
          // a nested button (nesting interactive elements is invalid).
          <div className="imp__panel">
            {history.map((b) => {
              const when = b.created_at.slice(0, 10);
              const created = b.stats.created ?? b.stats.rows;
              return (
                <div key={b.id} className="imp__row">
                  <button
                    type="button"
                    className="imp__rowmain"
                    onClick={() => setActive(b.id)}
                    aria-label={`Open ${b.kind} import from ${when}: ${b.status}`}
                    aria-current={active === b.id ? 'true' : undefined}
                  >
                    <Mono className="u-faint" style={{ width: 84, fontSize: 11 }}>
                      {when}
                    </Mono>
                    <div className="row__main">
                      <div className="row__title">
                        {b.kind}
                        {b.detail ? ` · ${b.detail}` : ''}
                        {b.filename ? ` · ${b.filename}` : ''}
                      </div>
                      <div className="row__sub">
                        {b.stats.rows} rows · {b.stats.dupCandidates} dup candidates
                        {b.stats.created != null ? ` · ${b.stats.created} created` : ''}
                        {b.stats.failed ? ` · ${b.stats.failed} need attention` : ''}
                      </div>
                    </div>
                    <Chip tone={b.status === 'staged' ? 'warning' : b.status === 'committed' ? 'success' : 'default'} mono>
                      {b.status}
                    </Chip>
                  </button>
                  {b.status === 'committed' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => rollback.mutate(b.id)}
                      disabled={rollback.isPending}
                      aria-label={`Roll back ${b.kind} import from ${when}: ${created} records`}
                    >
                      Roll back
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="imp__panel">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="imp__row" aria-hidden>
          <Skeleton width={72} height={12} />
          <span style={{ flex: 1 }}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="55%" height={10} style={{ marginTop: 6 }} />
          </span>
          <Skeleton width={64} height={20} />
        </div>
      ))}
    </div>
  );
}

/** Column mapper for unrecognized contact CSVs. */
function CsvMapper({
  headers,
  filename,
  onConfirm,
  onCancel,
}: {
  headers: string[];
  filename: string;
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const FIELDS = ['name', 'email', 'phone', 'company', 'city'] as const;
  const [map, setMap] = useState<Record<string, string>>({});
  const ids = useId();
  return (
    <Section title={`Map columns: ${filename}`}>
      <p className="m-0 mb-3 text-sm text-ink-soft">
        This CSV&apos;s headers weren&apos;t recognized. Point each field at the right column (only name is required).
      </p>
      <div className="grid-2">
        {FIELDS.map((f) => (
          <div key={f} className="field">
            <label className="label" htmlFor={`${ids}-${f}`}>
              {f}
            </label>
            <select
              id={`${ids}-${f}`}
              className="input"
              value={map[f] ?? ''}
              onChange={(e) => setMap((m) => ({ ...m, [f]: e.target.value }))}
            >
              <option value="">: </option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="hstack" style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          disabled={!map.name}
          onClick={() => onConfirm(Object.fromEntries(Object.entries(map).filter(([, v]) => v)))}
        >
          Stage with this mapping
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Section>
  );
}
