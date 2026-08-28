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
  Field,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
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
  const tokenHelpId = `${tokenId}-help`;
  const bulk = useBulkNodeDelete({ noun: 'repository', nouns: 'repositories' });

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/settings'),
  });
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
    mutationFn: () =>
      api.post<{ status: string; created: number; updated: number }>('/imports/github/sync', {}),
    onSuccess: (r) => {
      if (r.status === 'not_modified') flash('Already up to date. Nothing changed.');
      else flash(`Synced: ${r.created} new · ${r.updated} updated.`);
      void qc.invalidateQueries({ queryKey: ['nodes', 'repository'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const list = useMemo(
    () =>
      [...(repos.data?.nodes ?? [])].sort((a, b) => (b.props.stars ?? 0) - (a.props.stars ?? 0)),
    [repos.data],
  );
  const visibleIds = useMemo(() => list.map((r) => r.id), [list]);
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const titled = useMemo(
    () => list.map((r) => ({ id: r.id, title: r.props.full_name ?? r.title })),
    [list],
  );
  const selectedTitles = useMemo(
    () => titlesForSelection(titled, bulk.selected),
    [titled, bulk.selected],
  );

  return (
    <div className="page data-workspace-page data-repositories-page">
      <PageHeader
        title="Repositories"
        subtitle="Connect GitHub once, then sync your repos in as first-class records. Languages become skills automatically."
        help={
          <InfoPopover
            title="How repositories work"
            shortcuts={[{ keys: '⌘P', label: "Command palette → 'Sync GitHub'" }]}
          >
            <p>
              Add a GitHub <strong>personal access token</strong> (repo read scope).{' '}
              <strong>Sync now</strong> pulls your non-fork repos in as <code>repository</code>{' '}
              nodes and links each repo's primary language to a <code>skill</code>.
            </p>
            <p>
              Each repo is a normal record, open it to add context, connect it to a project, or hide
              it.
            </p>
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
              glyph="repository"
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
              {sync.isPending ? 'Syncing...' : 'Sync now'}
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

      <nav className="data-process" aria-label="Repository sync workflow">
        <ol>
          <li
            data-state={connection.connected ? 'done' : 'current'}
            aria-current={!connection.connected ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Connect privately</strong>
              <small>Store one server-side token</small>
            </span>
          </li>
          <li
            data-state={
              sync.isPending || (connection.connected && !lastSyncAt && list.length === 0)
                ? 'current'
                : connection.connected && (Boolean(lastSyncAt) || list.length > 0)
                  ? 'done'
                  : 'upcoming'
            }
            aria-current={
              sync.isPending || (connection.connected && !lastSyncAt && list.length === 0)
                ? 'step'
                : undefined
            }
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Sync records</strong>
              <small>Pull current non-fork repositories</small>
            </span>
          </li>
          <li
            data-state={list.length > 0 && !sync.isPending ? 'current' : 'upcoming'}
            aria-current={list.length > 0 && !sync.isPending ? 'step' : undefined}
          >
            <span className="data-process__node" aria-hidden />
            <span>
              <strong>Enrich the graph</strong>
              <small>Open, connect, or annotate</small>
            </span>
          </li>
        </ol>
      </nav>

      <div className="data-operation-trace">
        {/* The settings section below announces its own wait and its own
            failure. This line is the screen's operation trace, so for those two
            states it is chrome, not a second announcement. */}
        {settings.isLoading ? (
          <StatusTrace
            tone="live"
            announce={false}
            label="Checking GitHub connection"
            detail="No credential is shown"
          />
        ) : settings.isError ? (
          <StatusTrace
            tone="danger"
            announce={false}
            label="GitHub settings unavailable"
            detail={(settings.error as Error).message}
          />
        ) : saveToken.isPending ? (
          <StatusTrace tone="live" label="Saving GitHub token" detail="Server-side only" />
        ) : saveToken.isError ? (
          <StatusTrace
            tone="danger"
            label="GitHub token was not saved"
            detail={(saveToken.error as Error).message}
          />
        ) : disconnect.isPending ? (
          <StatusTrace
            tone="live"
            label="Disconnecting GitHub"
            detail="Synced repository records will remain"
          />
        ) : disconnect.isError ? (
          <StatusTrace
            tone="danger"
            label="GitHub was not disconnected"
            detail={(disconnect.error as Error).message}
          />
        ) : sync.isPending ? (
          <StatusTrace
            tone="live"
            label="Syncing GitHub repositories"
            detail="Checking current records"
          />
        ) : sync.isError ? (
          <StatusTrace
            tone="danger"
            label="Repository sync stopped"
            detail={(sync.error as Error).message}
          />
        ) : connection.connected ? (
          <StatusTrace
            tone={lastSyncAt ? 'success' : 'neutral'}
            label={lastSyncAt ? 'GitHub connection is current' : 'GitHub is ready to sync'}
            detail={lastSyncAt ? `Last sync ${formatLastSync(lastSyncAt)}` : 'No sync recorded'}
          />
        ) : (
          <StatusTrace
            tone="warning"
            label="GitHub needs a connection"
            detail="Add a read-only token below"
          />
        )}
      </div>

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
          <Chip
            tone={
              connection.tone === 'danger'
                ? 'danger'
                : connection.tone === 'success'
                  ? 'success'
                  : connection.tone === 'warning'
                    ? 'warning'
                    : 'default'
            }
            mono
          >
            {connection.label}
          </Chip>
        }
      >
        {settings.isError ? (
          <ErrorState
            title="Couldn't load GitHub settings"
            detail={(settings.error as Error | null)?.message}
            onRetry={() => void settings.refetch()}
          />
        ) : settings.isLoading ? (
          // `SkeletonRows` is itself a polite live region with a label. Wrapping
          // it in a second `role="status"` put two live regions around one
          // wait, and screen readers announce both.
          <SkeletonRows rows={3} label="Loading GitHub settings" />
        ) : (
          <div className="data-github-connection">
            <div className="data-github-connection__brief">
              <span className="data-state-dot" data-tone={connection.tone} aria-hidden />
              <div>
                <strong>
                  {connection.connected ? 'Credential available' : 'Credential required'}
                </strong>
                <p>
                  The token is encrypted at rest and never returned to this browser after saving.
                </p>
              </div>
              <div className="data-github-connection__time">
                <span>Last sync</span>
                <Mono>{formatLastSync(lastSyncAt)}</Mono>
              </div>
            </div>
            <form
              className="data-github-connection__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (token.trim() && !saveToken.isPending) saveToken.mutate(token.trim());
              }}
            >
              {/* `Field` + `Input`, not a hand-rolled `.field`/`.label`/`.input`
                  trio. The one-off drew its border from --ae-border-strong,
                  which is the hairline for *edges*, not for controls: the field
                  a person is asked to paste a credential into was the faintest
                  control on the screen. */}
              <Field
                label={
                  connection.connected ? 'Replace personal access token' : 'Personal access token'
                }
                htmlFor={tokenId}
              >
                <Input
                  id={tokenId}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ghp_... (repo read scope)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  aria-describedby={tokenHelpId}
                />
              </Field>
              <div className="data-github-connection__actions">
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={!token.trim() || saveToken.isPending}
                >
                  {saveToken.isPending
                    ? 'Saving...'
                    : connection.connected
                      ? 'Replace token'
                      : 'Connect GitHub'}
                </Button>
                {connection.connected && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                    aria-label="Disconnect GitHub token"
                  >
                    {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                )}
              </div>
            </form>
            <p id={tokenHelpId} className="data-github-connection__help">
              Stored server-side only, never echoed back. Create one at github.com → Settings →
              Developer settings → Personal access tokens. Disconnecting removes the credential and
              keeps synced repositories.
            </p>
          </div>
        )}
      </Section>

      <Section title="Synced repositories" meta={repos.isSuccess ? list.length : undefined}>
        {repos.isError ? (
          <ErrorState
            title="Couldn't load repositories"
            detail={(repos.error as Error | null)?.message}
            onRetry={() => void repos.refetch()}
          />
        ) : repos.isLoading ? (
          // Gated on the repository query alone. It used to wait for Settings
          // too, so a slow or hanging token check held a list that had already
          // arrived behind a skeleton, and the ledger reported the state of a
          // request that has nothing to do with it.
          <SkeletonRows rows={5} label="Loading repositories" />
        ) : list.length === 0 ? (
          <EmptyState
            glyph="repository"
            title={
              settingsState === 'error'
                ? 'Repositories unavailable until Settings loads'
                : settingsState === 'loading' || connection.connected
                  ? 'No repositories yet'
                  : 'Connect GitHub to begin'
            }
            hint={
              settingsState === 'error'
                ? 'Retry the GitHub settings request above, then sync.'
                : settingsState === 'loading'
                  ? // Now that the ledger no longer waits for Settings, it can
                    // arrive first, and it must not answer a question the token
                    // check has not answered yet.
                    'Still checking whether GitHub is connected.'
                  : connection.connected
                    ? "Hit 'Sync now' to pull your repositories in."
                    : 'Add a token above, then sync; your repos and their languages land automatically.'
            }
            action={
              connection.canSync ? (
                <Button variant="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
                  {sync.isPending ? 'Syncing...' : 'Sync now'}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="data-repo-ledger" aria-busy={bulk.deleting}>
            {/* Chrome for the ledger, not one of the repositories in it, so it
                stays outside the list. */}
            <SelectAllRow
              allSelected={allVisibleSelected}
              onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
            />
            <ul className="repo-rows">
              {list.map((r, index) => {
                const isSelected = bulk.isSelected(r.id);
                const name = r.props.full_name ?? r.title;
                return (
                  <li
                    key={r.id}
                    className="row data-repo-row"
                    data-selected={isSelected || undefined}
                  >
                    <Mono className="data-ledger-index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </Mono>
                    <SelectCheckbox
                      checked={isSelected}
                      label={`Select ${name}`}
                      onToggle={() => bulk.toggleOne(r.id)}
                    />
                    <div className="repo-row__body">
                      <div className="repo-row__main">
                        {/*
                          The link is the name and nothing else now. It used to
                          wrap the description, the language, the star and fork
                          counts and the provenance chip, and then name itself
                          `Open jordan/vitae` with an aria-label, so every one
                          of those facts was announced as nothing at all: an
                          aria-label replaces an element's contents in the
                          accessible name, it does not sit beside them. The
                          label stays, because `Open jordan/vitae` is the right
                          name for this link; what changed is that it no longer
                          has five facts underneath it to erase.
                        */}
                        <Link
                          to={entityHref('repository', r.id)}
                          className="repo-row__link"
                          aria-label={`Open ${name}`}
                        >
                          {name}
                        </Link>
                        {r.props.description && (
                          <span className="repo-row__desc">{r.props.description}</span>
                        )}
                      </div>
                      <div className="repo-row__facts">
                        {r.props.is_private && <Chip mono>private</Chip>}
                        {r.props.primary_language && <Chip mono>{r.props.primary_language}</Chip>}
                        {typeof r.props.stars === 'number' && r.props.stars > 0 && (
                          <Mono className="repo-row__count text-xs text-faint">
                            {r.props.stars} stars
                          </Mono>
                        )}
                        {typeof r.props.forks === 'number' && r.props.forks > 0 && (
                          <Mono className="repo-row__count text-xs text-faint">
                            {r.props.forks} forks
                          </Mono>
                        )}
                        <ProvenanceChip source={r.source} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
