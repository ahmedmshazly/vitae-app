/**
 * Repositories hub, the one place to connect GitHub, sync, and see the repos
 * that landed as `repository` nodes. Unifies what used to be split across
 * Settings (token) and Import (trigger), with plain-language guidance.
 */
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';
import {
  BulkDeleteBar,
  BulkDeleteConfirm,
  SelectAllRow,
  SelectCheckbox,
  titlesForSelection,
  useBulkNodeDelete,
  useVisibleSelection,
} from '../features/BulkNodeDelete.js';
import { entityHref } from '../lib/entity-href.js';

interface Settings {
  github: { configured: boolean; lastSyncAt: string | null };
}
export interface RepoNode {
  id: string;
  title: string;
  subtitle?: string | null;
  source: string;
  props: {
    full_name?: string;
    url?: string;
    primary_language?: string;
    stars?: number;
    forks?: number;
    is_private?: boolean;
    description?: string;
    topics?: string[];
    last_synced_at?: string;
  };
}

export type ConnectionTone = 'success' | 'warning' | 'muted' | 'danger';

export interface GithubConnectionState {
  label: string;
  tone: ConnectionTone;
  connected: boolean;
  canSync: boolean;
}

/**
 * Connection chip for the GitHub panel. Settings may still be loading, never
 * invent "not connected" from a missing cache entry, or a delayed Settings
 * response looks like a missing token.
 */
export function githubConnectionState(
  settingsState: 'loading' | 'error' | 'ready',
  github: Settings['github'] | undefined,
): GithubConnectionState {
  if (settingsState === 'loading') {
    return { label: 'checking', tone: 'muted', connected: false, canSync: false };
  }
  if (settingsState === 'error') {
    return { label: 'unavailable', tone: 'danger', connected: false, canSync: false };
  }
  if (!github?.configured) {
    return { label: 'not connected', tone: 'warning', connected: false, canSync: false };
  }
  return { label: 'connected', tone: 'success', connected: true, canSync: true };
}

/** Format the last-sync timestamp for the connection panel. */
export function formatLastSync(lastSyncAt: string | null | undefined): string {
  if (!lastSyncAt) return 'never';
  return lastSyncAt.slice(0, 16).replace('T', ' ');
}

export function Repositories() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [token, setToken] = useState('');
  const tokenId = useId();
  const bulk = useBulkNodeDelete({ noun: 'repository', nouns: 'repositories' });

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
  const repos = useQuery({
    queryKey: ['nodes', 'repository'],
    queryFn: () => api.get<{ nodes: RepoNode[] }>('/nodes?type=repository'),
  });

  const settingsState: 'loading' | 'error' | 'ready' = settings.isError
    ? 'error'
    : settings.isLoading || !settings.data
      ? 'loading'
      : 'ready';
  const connection = githubConnectionState(settingsState, settings.data?.github);
  const lastSyncAt = settings.data?.github.lastSyncAt ?? null;

  const saveToken = useMutation({
    mutationFn: (value: string) => api.post('/settings/github-token', { token: value }),
    onSuccess: async () => {
      setToken('');
      await qc.invalidateQueries({ queryKey: ['settings'] });
      flash('GitHub token saved.');
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.del('/settings/github-token'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] });
      flash('GitHub disconnected. Synced repositories were kept.');
    },
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ status: string; created: number; updated: number }>('/imports/github/sync', {}),
    onSuccess: (r) => {
      if (r.status === 'not_modified') flash('Already up to date. Nothing changed.');
      else flash(`Synced: ${r.created} new · ${r.updated} updated.`);
      void qc.invalidateQueries({ queryKey: ['nodes', 'repository'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const list = useMemo(
    () => [...(repos.data?.nodes ?? [])].sort((a, b) => (b.props.stars ?? 0) - (a.props.stars ?? 0)),
    [repos.data],
  );
  const visibleIds = useMemo(() => list.map((r) => r.id), [list]);
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const titled = useMemo(
    () => list.map((r) => ({ id: r.id, title: r.props.full_name ?? r.title })),
    [list],
  );
  const selectedTitles = useMemo(() => titlesForSelection(titled, bulk.selected), [titled, bulk.selected]);

  return (
    <div className="page">
      <PageHeader
        title="Repositories"
        subtitle="Connect GitHub once, then sync your repos in as first-class records. Languages become skills automatically."
        help={
          <InfoPopover
            title="How repositories work"
            shortcuts={[{ keys: '⌘P', label: 'Command palette → “Sync GitHub”' }]}
          >
            <p>
              Add a GitHub <strong>personal access token</strong> (repo read scope). <strong>Sync now</strong> pulls
              your non-fork repos in as <code>repository</code> nodes and links each repo’s primary language to a{' '}
              <code>skill</code>.
            </p>
            <p>Each repo is a normal record, open it to add context, connect it to a project, or hide it.</p>
          </InfoPopover>
        }
        actions={
          <div className="hstack">
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
            />
            <Button
              variant="primary"
              glyph="capture"
              disabled={!connection.canSync || sync.isPending}
              onClick={() => sync.mutate()}
              aria-label={
                connection.canSync
                  ? lastSyncAt
                    ? `Sync GitHub now (last synced ${formatLastSync(lastSyncAt)})`
                    : 'Sync GitHub now'
                  : 'Sync GitHub: connect a token first'
              }
            >
              {sync.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
        }
      />
      <RegisterRule
        ticks={
          list.length > 0
            ? list.slice(0, 12).map((repo, i, all) => ({
                at: all.length === 1 ? 0.5 : i / (all.length - 1),
                label: repo.props.full_name ?? repo.title,
              }))
            : undefined
        }
        label={list.length > 0 ? 'Synced repositories by star rank' : undefined}
      />

      <BulkDeleteConfirm
        open={bulk.confirmDelete}
        onOpenChange={bulk.setConfirmDelete}
        selectedCount={bulk.selectedCount}
        titles={selectedTitles}
        noun="repository"
        nouns="repositories"
        busy={bulk.deleting}
        onConfirm={() => {
          void bulk.deleteSelected();
        }}
      />

      <Section
        title="GitHub connection"
        actions={
          <Chip tone={connection.tone === 'danger' ? 'danger' : connection.tone === 'success' ? 'success' : connection.tone === 'warning' ? 'warning' : 'default'} mono>
            {connection.label}
          </Chip>
        }
      >
        {settings.isError ? (
          <ErrorState
            title="Couldn’t load GitHub settings"
            detail={(settings.error as Error | null)?.message}
            onRetry={() => void settings.refetch()}
          />
        ) : settings.isLoading ? (
          <div role="status" aria-label="Loading GitHub settings">
            <SkeletonRows rows={3} />
          </div>
        ) : (
          <>
            <div className="spread" style={{ marginBottom: 'var(--ae-space-3)' }}>
              <span className="u-muted">Last sync</span>
              <Mono>{formatLastSync(lastSyncAt)}</Mono>
            </div>
            <div className="field">
              <label className="label" htmlFor={tokenId}>
                Personal access token
              </label>
              <div className="hstack">
                <input
                  id={tokenId}
                  className="input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ flex: 1 }}
                  placeholder="ghp_… (repo read scope)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!token.trim() || saveToken.isPending}
                  onClick={() => saveToken.mutate(token.trim())}
                >
                  {saveToken.isPending ? 'Saving…' : connection.connected ? 'Replace' : 'Connect'}
                </Button>
                {connection.connected && (
                  <Button
                    size="sm"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                    aria-label="Disconnect GitHub token"
                  >
                    {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                )}
              </div>
            </div>
            <p className="u-muted" style={{ fontSize: 'var(--ae-text-xs)', margin: '8px 0 0' }}>
              Stored server-side only, never echoed back. Create one at github.com → Settings → Developer settings →
              Personal access tokens. Disconnecting removes the credential and keeps synced repositories.
            </p>
          </>
        )}
      </Section>

      <Section title="Synced repositories" meta={repos.isSuccess ? list.length : undefined}>
        {repos.isError ? (
          <ErrorState
            title="Couldn’t load repositories"
            detail={(repos.error as Error | null)?.message}
            onRetry={() => void repos.refetch()}
          />
        ) : repos.isLoading || settings.isLoading ? (
          <div role="status" aria-label="Loading repositories">
            <SkeletonRows rows={5} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            glyph="repository"
            title={
              settingsState === 'error'
                ? 'Repositories unavailable until Settings loads'
                : connection.connected
                  ? 'No repositories yet'
                  : 'Connect GitHub to begin'
            }
            hint={
              settingsState === 'error'
                ? 'Retry the GitHub settings request above, then sync.'
                : connection.connected
                  ? 'Hit “Sync now” to pull your repositories in.'
                  : 'Add a token above, then sync, your repos and their languages land automatically.'
            }
            action={
              connection.canSync ? (
                <Button variant="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
                  {sync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="repo-list">
            <SelectAllRow
              allSelected={allVisibleSelected}
              onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
            />
            {list.map((r) => {
              const isSelected = bulk.isSelected(r.id);
              const name = r.props.full_name ?? r.title;
              return (
                <div key={r.id} className="row" data-selected={isSelected || undefined}>
                  <SelectCheckbox
                    checked={isSelected}
                    label={`Select ${name}`}
                    onToggle={() => bulk.toggleOne(r.id)}
                  />
                  <Link to={entityHref('repository', r.id)} className="people__link" aria-label={`Open ${name}`}>
                    <div className="row__main">
                      <div className="row__title">
                        {name} {r.props.is_private && <Chip mono>private</Chip>}
                      </div>
                      {r.props.description && <div className="row__sub">{r.props.description}</div>}
                    </div>
                    {r.props.primary_language && <Chip mono>{r.props.primary_language}</Chip>}
                    {typeof r.props.stars === 'number' && r.props.stars > 0 && (
                      <Mono className="u-faint">{r.props.stars} stars</Mono>
                    )}
                    <ProvenanceChip source={r.source} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
