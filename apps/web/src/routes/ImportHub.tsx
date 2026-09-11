import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Glyph,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  SkeletonRows,
  StatusTrace,
  Textarea,
  type GlyphName,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';
import { ImportProposalDiff, type RowProposal } from '../features/ImportProposalDiff.js';

interface StagedRow {
  id: string;
  index: number;
  entity: string;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
  confidence: number;
  dup: {
    nodeId: string;
    nodeTitle: string;
    weight: number;
    verdict: string;
    evidence: string[];
  } | null;
  /**
   * Set when the row matched a stored record by identity key. An empty `fields`
   * is the converged case: the file says what is already there, so there is
   * nothing to review and nothing will be written (FR-SYNC-002).
   */
  proposal?: RowProposal | null;
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
  /**
   * The four-way report (FR-SYNC-002). Everything past `dupCandidates` is
   * optional because batches committed before those buckets existed are still
   * in history and must keep rendering as what they were.
   */
  stats: {
    rows: number;
    accepted: number;
    dupCandidates: number;
    created?: number;
    updated?: number;
    unchanged?: number;
    skipped?: number;
    failed?: number;
  };
}
interface SettingsResp {
  github: { configured: boolean; lastSyncAt: string | null };
}

type Kind =
  | 'linkedin'
  | 'contacts'
  | 'calendar'
  | 'bookmarks'
  | 'resume'
  | 'aperture'
  | 'todoist'
  | 'things'
  | 'ticktick'
  | 'trello'
  | 'asana'
  | 'notion'
  | 'tasks_json'
  | 'tasks_csv'
  | 'tasks_text';

export const TASK_FILE_IMPORTER_KINDS = [
  'todoist',
  'things',
  'ticktick',
  'trello',
  'asana',
  'notion',
  'tasks_json',
  'tasks_csv',
  'tasks_text',
] as const;

const IMPORTERS: Array<{
  kind: Kind | 'github';
  glyph: GlyphName;
  name: string;
  desc: string;
  accept?: string;
}> = [
  {
    kind: 'linkedin',
    glyph: 'person',
    name: 'LinkedIn export',
    desc: 'Positions, Education, Skills, Connections CSVs',
    accept: '.csv',
  },
  {
    kind: 'github',
    glyph: 'repository',
    name: 'GitHub sync',
    desc: 'Repos → repository nodes, languages → skills',
  },
  {
    kind: 'contacts',
    glyph: 'person',
    name: 'Contacts',
    desc: 'vCard (.vcf) or CSV address book',
    accept: '.vcf,.csv,.txt',
  },
  {
    kind: 'resume',
    glyph: 'resume',
    name: 'Résumé disassembly',
    desc: 'Paste text, lines become résumé atoms',
  },
  {
    kind: 'bookmarks',
    glyph: 'link',
    name: 'Bookmarks',
    desc: 'Browser bookmarks HTML export',
    accept: '.html,.htm',
  },
  {
    kind: 'calendar',
    glyph: 'calendar',
    name: 'Calendar',
    desc: 'ICS events: RRULE kept, not expanded',
    accept: '.ics',
  },
  {
    kind: 'aperture',
    glyph: 'graph',
    name: 'Aperture bundle',
    desc: 'Scraped people, posts and companies as linked records',
    accept: '.json',
  },
  {
    kind: 'todoist',
    glyph: 'task',
    name: 'Todoist',
    desc: 'Project CSV export — tasks and subtasks',
    accept: '.csv,.txt',
  },
  {
    kind: 'things',
    glyph: 'task',
    name: 'Things',
    desc: 'Things JSON or things:///json URL',
    accept: '.json,.txt',
  },
  {
    kind: 'ticktick',
    glyph: 'task',
    name: 'TickTick',
    desc: 'Account backup CSV',
    accept: '.csv,.txt',
  },
  {
    kind: 'trello',
    glyph: 'project',
    name: 'Trello',
    desc: 'Board JSON export',
    accept: '.json',
  },
  {
    kind: 'asana',
    glyph: 'task',
    name: 'Asana',
    desc: 'Project CSV export',
    accept: '.csv,.txt',
  },
  {
    kind: 'notion',
    glyph: 'document',
    name: 'Notion',
    desc: 'Database CSV export',
    accept: '.csv,.txt',
  },
  {
    kind: 'tasks_json',
    glyph: 'task',
    name: 'Tasks JSON',
    desc: 'vitae.tasks or fourfold.transfer document',
    accept: '.json',
  },
  {
    kind: 'tasks_csv',
    glyph: 'task',
    name: 'Tasks CSV',
    desc: 'Generic task CSV with a title column',
    accept: '.csv,.txt',
  },
  {
    kind: 'tasks_text',
    glyph: 'task',
    name: 'Tasks text',
    desc: 'One task per line, capture-style tokens',
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

/**
 * The commit button's label and whether it can be pressed.
 *
 * Two kinds of row can be settled and they read differently. Accepted rows are
 * work the reviewer signed off, and the button counts them. Rows the file has
 * nothing new to say about ask for no sign-off at all, so a re-import where
 * everything already matches would otherwise sit behind a button waiting for an
 * acceptance nobody can give, and the batch could never record that it found
 * nothing to change (FR-SYNC-002).
 */
export function commitAction(
  accepted: number,
  alreadyMatched: number,
  pending: boolean,
): { label: string; disabled: boolean } {
  if (pending) return { label: 'Committing...', disabled: true };
  if (accepted === 0 && alreadyMatched > 0) {
    return { label: `Record ${alreadyMatched} already matched`, disabled: false };
  }
  return {
    label: `Commit ${accepted} row${accepted === 1 ? '' : 's'}`,
    disabled: accepted === 0,
  };
}

/** Bulk seeding with staging, review, commit, and per-batch rollback. */
export function ImportHub() {
  const [active, setActive] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mapperCsv, setMapperCsv] = useState<{
    filename: string;
    content: string;
    headers: string[];
  } | null>(null);
  const [fileAccept, setFileAccept] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const reviewAnchor = useRef<HTMLDivElement | null>(null);
  const [pendingKind, setPendingKind] = useState<Kind>('linkedin');
  const pasteIds = useId();
  // Reading a file off disk happens before any mutation exists, so neither
  // `stage.isPending` nor a query can report it. Without these two the whole
  // read was silent: a large file looked like a dead click and a failed read
  // looked like nothing had happened at all.
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<{ filename: string; detail: string } | null>(null);
  const qc = useQueryClient();
  const { flash } = useToast();

  const batches = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.get<{ batches: Batch[] }>('/imports'),
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsResp>('/settings'),
  });
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
      return [
        ...roles.nodes.map((n) => ({ ...n, kind: 'role' })),
        ...projects.nodes.map((n) => ({ ...n, kind: 'project' })),
      ];
    },
    enabled: batch.data?.rows.some((r) => r.entity === 'atom') ?? false,
  });

  const stage = useMutation({
    mutationFn: (body: {
      kind: Kind;
      filename?: string | null;
      content: string;
      mapping?: Record<string, string>;
    }) => api.post<{ batch: Batch; rows: StagedRow[] }>('/imports', body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['imports'] });
      setActive(res.batch.id);
      setPasteOpen(false);
      setMapperCsv(null);
      flash(`Staged ${res.batch.stats.rows} rows. Nothing committed yet`);
    },
  });

  const githubSync = useMutation({
    mutationFn: () =>
      api.post<{
        status: string;
        created: number;
        updated: number;
        unchanged?: number;
        skipped?: number;
      }>('/imports/github/sync'),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      flash(
        r.status === 'not_modified'
          ? 'GitHub already up to date'
          : [
              `GitHub: ${r.created} new, ${r.updated} updated`,
              r.unchanged ? `${r.unchanged} unchanged` : '',
              r.skipped ? `${r.skipped} forks skipped` : '',
            ]
              .filter(Boolean)
              .join(', '),
      );
    },
  });

  function openImporter(kind: Kind | 'github') {
    if (kind === 'github') {
      if (settings.isError) {
        flash("Couldn't read Settings. Add a GitHub token there, then retry.");
        return;
      }
      if (!settings.data?.github.configured) {
        flash('Add a GitHub token in Settings first');
        return;
      }
      githubSync.mutate();
      return;
    }
    if (kind === 'resume' || kind === 'tasks_text') {
      setPendingKind(kind);
      setPasteOpen(true);
      return;
    }
    setPendingKind(kind);
    setFileAccept(IMPORTERS.find((im) => im.kind === kind)?.accept);
    // Defer the click so the accept attribute is committed before the chooser opens.
    queueMicrotask(() => fileInput.current?.click());
  }

  function onFile(file: File) {
    const reader = new FileReader();
    const failed = (detail: string) => {
      setReading(null);
      setReadError({ filename: file.name, detail });
      flash(`Couldn't read ${file.name}. Nothing was staged.`, { variant: 'error' });
    };
    setReadError(null);
    setReading(file.name);
    reader.onerror = () => failed(reader.error?.message ?? 'The file could not be read.');
    reader.onabort = () => failed('The read stopped before the file was finished.');
    reader.onload = () => {
      setReading(null);
      const content = String(reader.result ?? '');
      const kind = pendingKind;
      if (kind === 'contacts' && !/BEGIN:VCARD/i.test(content)) {
        const headers = (content.split(/\r?\n/, 1)[0] ?? '')
          .split(',')
          .map((h) =>
            h
              .replace(/^"|"$/g, '')
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, ''),
          )
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
    mutationFn: ({
      rowId,
      decision,
      payload,
      fields,
    }: {
      rowId: string;
      decision?: 'accept' | 'skip';
      payload?: Record<string, unknown>;
      /** Which fields of an update proposal the reviewer keeps (FR-SYNC-001). */
      fields?: string[];
    }) => api.patch(`/imports/${active}/rows/${rowId}`, { decision, payload, fields }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['import', active] }),
  });

  const commit = useMutation({
    mutationFn: () =>
      api.post<{
        created: number;
        updated?: number;
        unchanged?: number;
        skipped?: number;
        failed?: number;
      }>(`/imports/${active}/commit`),
    onSuccess: (r) => {
      const batchId = active;
      void qc.invalidateQueries();
      // Every bucket that happened is named, and only those: a run that created
      // four and changed nothing should not read "0 updated, 0 unchanged".
      flash(
        [
          `Committed ${r.created} records`,
          r.updated ? `${r.updated} updated` : '',
          r.unchanged ? `${r.unchanged} already matched` : '',
          r.skipped ? `${r.skipped} skipped` : '',
          r.failed ? `${r.failed} rows failed and stayed staged` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        {
          undo: async () => {
            await api.post(`/imports/${batchId}/rollback`);
            await qc.invalidateQueries();
            flash('Import rolled back. Records removed');
          },
        },
      );
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
    mutationFn: (id: string) =>
      api.post<{
        removed: number;
        restored?: number;
        refused?: Array<{ node_id: string; title: string; reason: string }>;
      }>(`/imports/${id}/rollback`),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      if (active) setActive(null);
      // A refusal is the interesting half of a partial rollback, so it is named
      // with the record it protected rather than folded into a count.
      const refused = r.refused ?? [];
      flash(
        [
          `Rolled back: ${r.removed} records removed`,
          r.restored ? `${r.restored} restored` : '',
          refused.length === 1
            ? `${refused[0]!.title} kept: ${refused[0]!.reason}`
            : refused.length > 1
              ? `${refused.length} records kept because they were edited since`
              : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
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
  // Rows the file has nothing new to say about. They ask for no decision, but
  // they are still an outcome the batch has to record, so a re-import where
  // everything already matches has to be committable rather than stuck behind a
  // button that waits for an acceptance nobody can give.
  const alreadyMatched = rows.filter(
    (r) => r.proposal && r.proposal.fields.length === 0 && r.status !== 'committed',
  ).length;
  const isStaged = batch.data?.batch.status === 'staged';
  const busy = Boolean(reading) || stage.isPending || githubSync.isPending;
  const preparingSource = pasteOpen || Boolean(mapperCsv);
  const rollingBack = history.find((b) => b.id === rollback.variables);

  // Staging drops Review below the source register and the paste editor, far
  // enough down a full ledger to land off-screen. Focus follows the work, the
  // same way a route change moves focus to the content region.
  useEffect(() => {
    if (active) reviewAnchor.current?.focus();
  }, [active]);

  return (
    <div className="page data-workspace-page data-import-page">
      <PageHeader
        title="Import"
        subtitle="Bring records in through a reviewable chain of custody. Files stay isolated until you commit them."
        help={
          <InfoPopover title="Why staging">
            <p>
              A file import parses and checks for duplicates before it writes. You accept or skip
              each row, then commit, or discard the batch and leave the graph untouched.
            </p>
            <p>
              GitHub syncs directly after connection. Every committed file batch can still be rolled
              back as one unit.
            </p>
          </InfoPopover>
        }
        actions={
          <Link to="/data/identity" className="vt-btn vt-btn--sm">
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

      <nav className="data-process" aria-label="Import workflow">
        <ol>
          <li
            data-state={active || busy || preparingSource ? 'done' : 'current'}
            aria-current={!active && !busy && !preparingSource ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Choose source</strong>
              <small>File, text, or connected service</small>
            </span>
          </li>
          <li
            data-state={active ? 'done' : busy || preparingSource ? 'current' : 'upcoming'}
            aria-current={!active && (busy || preparingSource) ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Read safely</strong>
              <small>Parse and check identity</small>
            </span>
          </li>
          <li
            data-state={active && isStaged ? 'current' : active ? 'done' : 'upcoming'}
            aria-current={active && isStaged ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Review evidence</strong>
              <small>Accept, skip, or reassign</small>
            </span>
          </li>
          <li
            data-state={active && !isStaged ? 'current' : 'upcoming'}
            aria-current={active && !isStaged ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Commit or undo</strong>
              <small>One batch, one recovery unit</small>
            </span>
          </li>
        </ol>
      </nav>

      {/* Every mutation on this page reports here. The chain used to live inside
          the Review Section, which only mounts once a batch is open, so a
          failed commit, discard, or rollback started from batch history had
          nowhere to appear. */}
      <div className="data-operation-trace">
        {reading ? (
          <StatusTrace tone="live" label={`Reading ${reading}`} detail="Nothing is staged yet" />
        ) : readError ? (
          <StatusTrace
            tone="danger"
            label={`Couldn't read ${readError.filename}`}
            detail={`${readError.detail} Nothing was staged.`}
          />
        ) : stage.isPending ? (
          <StatusTrace
            tone="live"
            label="Reading source into staging"
            detail="The graph is unchanged"
          />
        ) : stage.isError ? (
          <StatusTrace
            tone="danger"
            label="Source could not be staged"
            detail={(stage.error as Error).message}
          />
        ) : githubSync.isPending ? (
          <StatusTrace tone="live" label="Syncing GitHub records" detail="Checking for changes" />
        ) : githubSync.isError ? (
          <StatusTrace
            tone="danger"
            label="GitHub sync stopped"
            detail={(githubSync.error as Error).message}
          />
        ) : rollback.isPending ? (
          <StatusTrace
            tone="live"
            label={rollingBack ? `Rolling back the ${rollingBack.kind} batch` : 'Rolling back'}
            detail="Records that batch wrote are being removed"
          />
        ) : rollback.isError ? (
          <StatusTrace
            tone="danger"
            label="Batch was not rolled back"
            detail={(rollback.error as Error).message}
          />
        ) : commit.isPending ? (
          <StatusTrace tone="live" label="Committing accepted rows" detail="Writing to the graph" />
        ) : commit.isError ? (
          <StatusTrace
            tone="danger"
            label="Batch was not committed"
            detail={(commit.error as Error).message}
          />
        ) : discard.isPending ? (
          <StatusTrace tone="live" label="Discarding the batch" detail="Nothing will be written" />
        ) : discard.isError ? (
          <StatusTrace
            tone="danger"
            label="Batch was not discarded"
            detail={(discard.error as Error).message}
          />
        ) : rowDecision.isPending ? (
          <StatusTrace tone="live" label="Saving row decision" detail="Review stays in staging" />
        ) : rowDecision.isError ? (
          <StatusTrace
            tone="danger"
            label="Row decision was not saved"
            detail={(rowDecision.error as Error).message}
          />
        ) : active && batch.data ? (
          <StatusTrace
            tone={
              isStaged ? 'warning' : batch.data.batch.status === 'committed' ? 'success' : 'neutral'
            }
            label={isStaged ? 'Batch isolated from the graph' : `Batch ${batch.data.batch.status}`}
            detail={
              isStaged
                ? `${accepted.length} of ${rows.length} rows accepted`
                : batch.data.batch.kind
            }
          />
        ) : stagedCount > 0 ? (
          <StatusTrace
            tone="warning"
            label={`${stagedCount} ${stagedCount === 1 ? 'batch needs' : 'batches need'} review`}
            detail="Open one from batch history"
          />
        ) : null}
      </div>

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
        <ol className="imp__cards data-source-ledger">
          {IMPORTERS.map((im, index) => {
            const st = sourceStatus(im.kind, lastByKind, settings.data?.github, settingsState);
            const pending =
              (im.kind === 'github' && githubSync.isPending) ||
              (im.kind !== 'github' && stage.isPending && pendingKind === im.kind);
            return (
              <li key={im.kind}>
                <button
                  type="button"
                  className="imp__card"
                  onClick={() => openImporter(im.kind)}
                  disabled={busy || (im.kind === 'github' && settings.isLoading)}
                  aria-label={
                    im.kind === 'github'
                      ? `Sync GitHub: ${st.label}`
                      : im.kind === 'resume'
                        ? `Open résumé disassembly: ${st.label}`
                        : im.kind === 'tasks_text'
                          ? `Open tasks text: ${st.label}`
                          : `Import ${im.name}: ${st.label}`
                  }
                >
                  <Mono className="data-ledger-index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </Mono>
                  <span className="imp__glyph" aria-hidden>
                    <Glyph name={im.glyph} size={16} />
                  </span>
                  <span className="data-source-ledger__copy">
                    <span className="imp__name">{im.name}</span>
                    <span className="imp__desc">{im.desc}</span>
                  </span>
                  <Mono className="data-source-ledger__status" data-tone={st.tone}>
                    <span className="data-state-dot" aria-hidden />
                    {pending ? 'working...' : st.label}
                  </Mono>
                  <Glyph
                    name="chevron-down"
                    size={14}
                    className="data-source-ledger__chevron"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </Section>

      {pasteOpen && (
        <Section title={pendingKind === 'tasks_text' ? 'Tasks text' : 'Résumé disassembly'}>
          <div className="data-stage-editor">
            <p className="m-0 mb-3 text-sm text-ink-soft">
              {pendingKind === 'tasks_text'
                ? 'Paste one task per line. Capture tokens (!p1, #project, due fri) become fields; review before commit.'
                : 'Paste résumé text. Substantial lines become candidate atoms; assign each to a role or project, then commit.'}
            </p>
            <Field
              label={pendingKind === 'tasks_text' ? 'Task list' : 'Résumé text'}
              htmlFor={`${pasteIds}-text`}
            >
              <Textarea
                id={`${pasteIds}-text`}
                rows={10}
                placeholder={
                  pendingKind === 'tasks_text'
                    ? 'Renew passport !p1 due 2026-09-11'
                    : 'Paste your résumé text here...'
                }
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            </Field>
            <div className="hstack data-import-actions">
              <Button
                variant="primary"
                disabled={!pasteText.trim() || stage.isPending}
                onClick={() => stage.mutate({ kind: pendingKind, content: pasteText })}
              >
                {stage.isPending ? 'Staging...' : pendingKind === 'tasks_text' ? 'Stage' : 'Disassemble'}
              </Button>
              <Button onClick={() => setPasteOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Section>
      )}

      {mapperCsv && (
        <CsvMapper
          headers={mapperCsv.headers}
          filename={mapperCsv.filename}
          onCancel={() => setMapperCsv(null)}
          onConfirm={(mapping) =>
            stage.mutate({
              kind: 'contacts',
              filename: mapperCsv.filename,
              content: mapperCsv.content,
              mapping,
            })
          }
        />
      )}

      {/* Staging pushes Review below the source register, off-screen on a full
          ledger. The anchor takes focus when a batch opens, the way a route
          change moves focus to the content region. */}
      {active && (
        <div className="data-import-anchor" ref={reviewAnchor} tabIndex={-1}>
          <Section
            title="Review"
            meta={batch.data ? `${batch.data.batch.kind} · ${batch.data.batch.status}` : undefined}
            actions={
              isStaged ? (
                <Mono className="data-import-caution">review before commit</Mono>
              ) : undefined
            }
          >
            {batch.isError ? (
              <ErrorState
                title="Couldn't load this import batch"
                detail={(batch.error as Error | null)?.message}
                onRetry={() => void batch.refetch()}
              />
            ) : batch.isLoading || !batch.data ? (
              <SkeletonRows rows={5} label="Loading staged rows" />
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
                  <EmptyState
                    glyph="capture"
                    title="This batch has no rows"
                    hint="Discard it and import again from a source above."
                  />
                ) : (
                  <ul
                    className="imp__panel data-import-review"
                    aria-label="Staged rows"
                    aria-busy={rowDecision.isPending}
                  >
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className="imp__row data-import-row"
                        data-decision={r.decision}
                      >
                        <Mono className="u-faint data-import-row__kind">{r.entity}</Mono>
                        <div className="row__main">
                          <div className="row__title">{r.title}</div>
                          {r.subtitle && <div className="row__sub">{r.subtitle}</div>}
                          {/* The diff lives inside the row's own column so the
                              row grows downward instead of the change being
                              squeezed in beside the controls. */}
                          {r.proposal && r.proposal.fields.length > 0 && (
                            <ImportProposalDiff
                              proposal={r.proposal}
                              disabled={rowDecision.isPending}
                              onToggleField={
                                isStaged
                                  ? (fields) => rowDecision.mutate({ rowId: r.id, decision: r.decision, fields })
                                  : undefined
                              }
                            />
                          )}
                          {r.proposal && r.proposal.fields.length === 0 && (
                            <div className="row__sub">
                              Already matches {r.proposal.target_title}. Nothing to change.
                            </div>
                          )}
                        </div>
                        {r.entity === 'atom' && isStaged && (
                          <Select
                            label={`Assign ${r.title} to a role or project`}
                            placeholder="assign to..."
                            disabled={rowDecision.isPending || owners.isLoading || owners.isError}
                            value={(r.payload.owner_node as string) || undefined}
                            onChange={(value) =>
                              rowDecision.mutate({
                                rowId: r.id,
                                payload: { owner_node: value ?? '' },
                              })
                            }
                            options={(owners.data ?? []).map((o) => ({
                              value: o.id,
                              label: `${o.kind}: ${o.title}`,
                            }))}
                          />
                        )}
                        <Mono className="u-faint data-import-row__confidence">
                          conf {r.confidence.toFixed(2)}
                        </Mono>
                        {/* An identity match is not a duplicate to wave through,
                            it is the same record seen again, so it says what it
                            is. Only a scored match still reads as a dup. */}
                        {r.proposal ? (
                          <Chip
                            tone={r.proposal.fields.length === 0 ? 'default' : 'warning'}
                            title={`${r.proposal.target_title} · matched on ${r.proposal.identity_key}`}
                          >
                            {r.proposal.fields.length === 0 ? 'unchanged' : 'update'}
                          </Chip>
                        ) : r.dup ? (
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
                            disabled={rowDecision.isPending}
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
                      </li>
                    ))}
                  </ul>
                )}
                {/* Only the query this Section owns reports here. The mutation
                  chain is page-level, so a standing destinations failure can no
                  longer sit on top of the reason a commit was refused. */}
                {owners.isLoading ? (
                  <StatusTrace
                    tone="live"
                    label="Loading résumé destinations"
                    detail="Roles and projects"
                  />
                ) : owners.isError ? (
                  <div className="data-import-recover">
                    <StatusTrace
                      tone="danger"
                      label="Résumé destinations unavailable"
                      detail={(owners.error as Error).message}
                    />
                    <Button
                      size="sm"
                      onClick={() => void owners.refetch()}
                      disabled={owners.isFetching}
                    >
                      {owners.isFetching ? 'Retrying...' : 'Retry'}
                    </Button>
                  </div>
                ) : null}
                <div className="imp__stagfoot">
                  {/* A row matched by identity key is not a candidate for
                      anything, it is that record; counting it as one would
                      overstate how much of this batch is still in doubt. */}
                  <Mono className="data-import-tally">
                    {rows.filter((r) => !r.dup && !r.proposal).length} new ·{' '}
                    {rows.filter((r) => r.proposal && r.proposal.fields.length > 0).length} to
                    update · {rows.filter((r) => r.proposal && r.proposal.fields.length === 0).length}{' '}
                    already matched · {rows.filter((r) => r.dup && !r.proposal).length} candidates ·{' '}
                    {rows.filter((r) => r.status === 'committed').length} committed
                  </Mono>
                  <div className="hstack">
                    {isStaged ? (
                      <>
                        <Button onClick={() => discard.mutate()} disabled={discard.isPending}>
                          {discard.isPending ? 'Discarding...' : 'Discard'}
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => commit.mutate()}
                          disabled={
                            commitAction(accepted.length, alreadyMatched, commit.isPending).disabled
                          }
                        >
                          {commitAction(accepted.length, alreadyMatched, commit.isPending).label}
                        </Button>
                      </>
                    ) : batch.data.batch.status === 'committed' ? (
                      <Button
                        variant="danger"
                        onClick={() => rollback.mutate(active)}
                        disabled={rollback.isPending}
                        aria-label={`Roll back ${batch.data.batch.kind} import from ${batch.data.batch.created_at.slice(0, 10)}: ${batch.data.batch.stats.created ?? batch.data.batch.stats.rows} records`}
                      >
                        {rollback.isPending ? 'Rolling back...' : 'Roll back batch'}
                      </Button>
                    ) : (
                      <Button onClick={() => setActive(null)}>Close</Button>
                    )}
                  </div>
                </div>
              </>
            )}
            {batch.isError && (
              <div className="hstack data-import-actions">
                <Button onClick={() => setActive(null)}>Close</Button>
              </div>
            )}
          </Section>
        </div>
      )}

      <Section title="Batch history" meta={batches.isSuccess ? history.length : undefined}>
        {batches.isError ? (
          <ErrorState
            title="Couldn't load import history"
            detail={(batches.error as Error | null)?.message}
            onRetry={() => void batches.refetch()}
          />
        ) : batches.isLoading ? (
          <SkeletonRows rows={4} label="Loading import history" />
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
          <ol className="imp__panel data-import-history" aria-label="Import batches">
            {history.map((b, index) => {
              const when = b.created_at.slice(0, 10);
              const created = b.stats.created ?? b.stats.rows;
              const undoing = rollback.isPending && rollback.variables === b.id;
              return (
                <li key={b.id} className="imp__row">
                  <Mono className="data-ledger-index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </Mono>
                  <button
                    type="button"
                    className="imp__rowmain"
                    onClick={() => setActive(b.id)}
                    aria-label={`Open ${b.kind} import from ${when}: ${b.status}`}
                    aria-current={active === b.id ? 'true' : undefined}
                  >
                    <Mono className="u-faint data-import-history__date">{when}</Mono>
                    <div className="row__main">
                      <div className="row__title">
                        {b.kind}
                        {b.detail ? ` · ${b.detail}` : ''}
                        {b.filename ? ` · ${b.filename}` : ''}
                      </div>
                      <div className="row__sub">
                        {b.stats.rows} rows · {b.stats.dupCandidates} dup candidates
                        {b.stats.created != null ? ` · ${b.stats.created} created` : ''}
                        {b.stats.updated ? ` · ${b.stats.updated} updated` : ''}
                        {b.stats.unchanged ? ` · ${b.stats.unchanged} already matched` : ''}
                        {b.stats.skipped ? ` · ${b.stats.skipped} skipped` : ''}
                        {b.stats.failed ? ` · ${b.stats.failed} need attention` : ''}
                      </div>
                    </div>
                    <Chip
                      tone={
                        b.status === 'staged'
                          ? 'warning'
                          : b.status === 'committed'
                            ? 'success'
                            : 'default'
                      }
                      mono
                    >
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
                      {undoing ? 'Rolling back...' : 'Roll back'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
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
        This CSV&apos;s headers weren&apos;t recognized. Point each field at the right column (only
        name is required).
      </p>
      <div className="grid-2 data-column-map">
        {FIELDS.map((f) => (
          <Field key={f} label={f} htmlFor={`${ids}-${f}`}>
            <Select
              id={`${ids}-${f}`}
              label={`${f} column`}
              placeholder="Ignore this field"
              value={map[f] || undefined}
              onChange={(value) => setMap((m) => ({ ...m, [f]: value ?? '' }))}
              options={headers.map((h) => ({ value: h, label: h }))}
            />
          </Field>
        ))}
      </div>
      <div className="hstack data-import-actions">
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
