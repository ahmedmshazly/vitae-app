import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useToast } from '../features/Toast.js';

interface Status {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail?: unknown }>;
  counts: { nodes: number; edges: number };
  env: { node: string; emulators: boolean; devLogin: boolean };
}
interface SettingsResp {
  profile: { name: string; headline: string; email: string; links: string[] };
  askWeights: Record<string, number>;
  skillAliases: Array<{ alias: string; canonical: string }>;
  resumeDefaults?: { templateKey: string; accent: string; emphasis: string };
  github: { configured: boolean; lastSyncAt: string | null };
}

const WEIGHT_LABELS: Record<string, string> = {
  affiliation: 'Affiliation (org match)',
  topic: 'Topic overlap',
  strength: 'Tie strength',
  geo: 'Geography',
  reciprocity: 'Favor balance',
  graph: 'Graph proximity',
  pinned: 'Pinned bonus',
};

/** Human detail for a health check, never colour alone. */
export function statusCheckDetail(check: { ok: boolean; detail?: unknown }): string {
  if (check.detail != null && String(check.detail).length > 0) return String(check.detail);
  return check.ok ? 'ok' : 'down';
}

/** Format last GitHub sync for the integrations panel. */
export function formatGithubSync(lastSyncAt: string | null | undefined): string {
  if (!lastSyncAt) return 'never';
  return lastSyncAt.slice(0, 16).replace('T', ' ');
}

/** Settings (SRS P22): profile, ranking constants, taxonomy, GitHub, health. */
export function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { flash } = useToast();

  const status = useQuery({ queryKey: ['status'], queryFn: () => api.get<Status>('/status') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsResp>('/settings') });
  // FR-008: opening Settings used to kick off a full duplicate scan just to
  // print a candidate count in a link label. The scan is the expensive thing in
  // the system; it belongs on the page that exists to show its results.

  const patch = useMutation({
    mutationFn: (body: Partial<SettingsResp>) => api.patch<SettingsResp>('/settings', body),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      if (variables.profile) flash('Profile saved.');
      else if (variables.resumeDefaults) flash('Résumé defaults saved.');
      else if (variables.askWeights) flash('Ranking constants saved.');
      else if (variables.skillAliases) flash('Skill aliases saved.');
      else flash('Settings saved.');
    },
  });

  const checkEntries = status.data ? Object.entries(status.data.checks) : [];
  const failing = checkEntries.filter(([, c]) => !c.ok).length;

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Owner-only · single-user data plane."
        help={
          <InfoPopover title="Calibration">
            <p>
              Profile and résumé defaults feed new Tailor sessions. Ranking constants reshape Ask. Skill aliases
              teach the JD parser which nicknames mean which skills.
            </p>
            <p>GitHub credentials and sync live primarily under Repositories; System status is the live health strip.</p>
          </InfoPopover>
        }
      />
      <RegisterRule
        ticks={
          checkEntries.length > 0
            ? checkEntries.map(([name], i, all) => ({
                at: all.length === 1 ? 0.5 : i / (all.length - 1),
                label: name,
              }))
            : undefined
        }
        activeIndex={checkEntries.findIndex(([, c]) => !c.ok)}
        label={checkEntries.length > 0 ? 'System health checks' : undefined}
      />

      {settings.isError ? (
        <ErrorState
          title="Couldn’t load settings"
          detail={(settings.error as Error | null)?.message}
          onRetry={() => void settings.refetch()}
        />
      ) : settings.isLoading || !settings.data ? (
        <div role="status" aria-label="Loading settings">
          <SkeletonRows rows={8} />
        </div>
      ) : (
        <div className="grid-2">
          <ProfileCard
            profile={settings.data.profile}
            email={user?.email ?? ''}
            saving={patch.isPending}
            onSave={(profile) => patch.mutate({ profile })}
          />
          <ResumeDefaultsCard
            defaults={
              settings.data.resumeDefaults ?? {
                templateKey: 'cobalt',
                accent: '#2563eb',
                emphasis: 'technical',
              }
            }
            saving={patch.isPending}
            onSave={(resumeDefaults) => patch.mutate({ resumeDefaults })}
          />
          <WeightsCard
            weights={settings.data.askWeights}
            onChange={(askWeights) => patch.mutate({ askWeights })}
          />
          <AliasesCard
            aliases={settings.data.skillAliases}
            saving={patch.isPending}
            onSave={(skillAliases) => patch.mutate({ skillAliases })}
          />

          <Section title="GitHub">
            <GithubCard
              configured={settings.data.github.configured}
              lastSyncAt={settings.data.github.lastSyncAt}
              onChanged={(message) => {
                void qc.invalidateQueries({ queryKey: ['settings'] });
                flash(message);
              }}
            />
          </Section>

          <Section
            title="System status"
            actions={
              status.isSuccess ? (
                <Chip tone={failing > 0 ? 'danger' : 'success'} mono>
                  {failing > 0 ? `${failing} down` : 'healthy'}
                </Chip>
              ) : undefined
            }
          >
            {status.isError ? (
              <ErrorState
                title="Couldn’t load system status"
                detail={(status.error as Error | null)?.message}
                onRetry={() => void status.refetch()}
              />
            ) : status.isLoading || !status.data ? (
              <div role="status" aria-label="Loading system status">
                <SkeletonRows rows={4} />
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {Object.entries(status.data.checks).map(([name, c]) => (
                  <div key={name} className="spread">
                    <span className="hstack">
                      <Chip tone={c.ok ? 'success' : 'danger'} mono>
                        {c.ok ? 'ok' : 'down'}
                      </Chip>
                      {name}
                    </span>
                    <Mono className="u-faint">{statusCheckDetail(c)}</Mono>
                  </div>
                ))}
                <div className="spread">
                  <span className="u-muted">Records</span>
                  <Mono>
                    {status.data.counts.nodes} nodes · {status.data.counts.edges} edges
                  </Mono>
                </div>
                <div className="spread">
                  <span className="u-muted">Environment</span>
                  <Chip mono>{status.data.env.emulators ? 'emulators' : 'cloud'}</Chip>
                </div>
                <Link to="/import/duplicates" className="vt-btn vt-btn--sm" style={{ alignSelf: 'flex-start' }}>
                  Open duplicates queue
                </Link>
              </div>
            )}
          </Section>

          <Section title="Identity">
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread">
                <span className="u-muted">Signed in as</span>
                <Mono>{user?.email}</Mono>
              </div>
              <div className="spread">
                <span className="u-muted">Method</span>
                <Chip mono>{user?.via}</Chip>
              </div>
              <div className="spread">
                <span className="u-muted">Backups</span>
                <Link to="/export" className="vt-btn vt-btn--sm">
                  Export &amp; backups
                </Link>
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function ResumeDefaultsCard({
  defaults,
  onSave,
  saving,
}: {
  defaults: { templateKey: string; accent: string; emphasis: string };
  onSave: (defaults: { templateKey: string; accent: string; emphasis: string }) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(defaults);
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);
  const ids = useId();
  const accents = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#111827'];

  useEffect(() => {
    setDraft(defaults);
  }, [defaults]);

  return (
    <Section title="Résumé defaults">
      <p className="m-0 mb-3 text-sm text-ink-soft">
        Starting template, accent, and wording emphasis for new Tailor sessions.
      </p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-template`}>
          Default template
        </label>
        <select
          id={`${ids}-template`}
          className="input"
          value={draft.templateKey}
          onChange={(e) => setDraft({ ...draft, templateKey: e.target.value })}
        >
          <option value="cobalt">Cobalt</option>
          <option value="onyx">Onyx</option>
          <option value="argon">Argon</option>
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-emphasis`}>
          Default wording
        </label>
        <select
          id={`${ids}-emphasis`}
          className="input"
          value={draft.emphasis}
          onChange={(e) => setDraft({ ...draft, emphasis: e.target.value })}
        >
          <option value="technical">Technical</option>
          <option value="leadership">Leadership</option>
          <option value="concise">Concise</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>
      <div className="field">
        <span className="label" id={`${ids}-accent`}>
          Default accent
        </span>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }} role="group" aria-labelledby={`${ids}-accent`}>
          {accents.map((accent) => (
            <button
              key={accent}
              type="button"
              aria-label={`Use ${accent} accent`}
              aria-pressed={draft.accent === accent}
              title={accent}
              onClick={() => setDraft({ ...draft, accent })}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: draft.accent === accent ? '2px solid var(--ae-fg)' : '1px solid var(--ae-border)',
                background: accent,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>
      <Button variant="primary" disabled={!dirty || saving} onClick={() => onSave(draft)}>
        {saving && dirty ? 'Saving…' : 'Save résumé defaults'}
      </Button>
    </Section>
  );
}

function ProfileCard({
  profile,
  email,
  onSave,
  saving,
}: {
  profile: SettingsResp['profile'];
  email: string;
  onSave: (p: SettingsResp['profile']) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  // FR-023: every visual label is associated with its control via htmlFor/id, so
  // clicking the label focuses the field and screen readers announce the name.
  const ids = useId();
  return (
    <Section title="Profile of me">
      <p className="m-0 mb-3 text-sm text-ink-soft">The résumé contact block used by templates.</p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-name`}>
          Name
        </label>
        <input
          id={`${ids}-name`}
          className="input"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-headline`}>
          Headline
        </label>
        <input
          id={`${ids}-headline`}
          className="input"
          value={draft.headline}
          onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-email`}>
          Contact email
        </label>
        <input
          id={`${ids}-email`}
          type="email"
          className="input"
          placeholder={email}
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-links`}>
          Links (one per line)
        </label>
        <textarea
          id={`${ids}-links`}
          className="textarea"
          rows={2}
          value={draft.links.join('\n')}
          onChange={(e) =>
            setDraft({ ...draft, links: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })
          }
        />
      </div>
      <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => onSave(draft)} style={{ marginTop: 10 }}>
        {saving && dirty ? 'Saving…' : 'Save profile'}
      </Button>
    </Section>
  );
}

function WeightsCard({ weights, onChange }: { weights: Record<string, number>; onChange: (w: Record<string, number>) => void }) {
  const [draft, setDraft] = useState(weights);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = useId();

  useEffect(() => setDraft(weights), [weights]);

  function update(key: string, value: number) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    // Debounced live save: Ask reranks deterministically on next query.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 500);
  }

  return (
    <Section title="Ranking constants">
      <p className="m-0 mb-3 text-sm text-ink-soft">
        Explainability includes tunability: Ask reranks live with these weights.
      </p>
      <div className="stack" style={{ gap: 12 }}>
        {Object.entries(draft).map(([key, value]) => {
          const label = WEIGHT_LABELS[key] ?? key;
          return (
            <div key={key}>
              <div className="spread" style={{ fontSize: 'var(--ae-text-sm)', marginBottom: 4 }}>
                <label htmlFor={`${ids}-${key}`} style={{ color: 'var(--ae-fg-soft)' }}>
                  {label}
                </label>
                <Mono style={{ color: 'var(--ae-muted)' }}>{value.toFixed(2)}</Mono>
              </div>
              <input
                id={`${ids}-${key}`}
                type="range"
                min={0}
                max={key === 'pinned' ? 1 : 3}
                step={0.05}
                value={value}
                aria-valuetext={`${label}: ${value.toFixed(2)}`}
                onChange={(e) => update(key, Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--ae-accent)' }}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AliasesCard({
  aliases,
  onSave,
  saving,
}: {
  aliases: Array<{ alias: string; canonical: string }>;
  onSave: (a: Array<{ alias: string; canonical: string }>) => void;
  saving: boolean;
}) {
  const [rows, setRows] = useState(aliases);
  const [newAlias, setNewAlias] = useState('');
  const [newCanonical, setNewCanonical] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(aliases);
  const ids = useId();

  useEffect(() => setRows(aliases), [aliases]);

  return (
    <Section title="Taxonomy · skills & aliases" meta={rows.length}>
      <p className="m-0 mb-3 text-sm text-ink-soft">
        The JD-parser dictionary: aliases resolve to canonical skills during capture and tailoring.
      </p>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((r, i) => (
          <div key={`${r.alias}-${i}`} className="hstack" style={{ fontFamily: 'var(--ae-font-mono)', fontSize: 'var(--ae-text-sm)' }}>
            <span style={{ color: 'var(--ae-muted)' }}>{r.alias}</span>
            <span className="u-faint">→</span>
            <span style={{ color: 'var(--ae-fg-soft)', flex: 1 }}>{r.canonical}</span>
            <button
              type="button"
              className="coll__chipx"
              aria-label={`Remove alias ${r.alias}`}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <div className="hstack">
          <label className="sr-only" htmlFor={`${ids}-alias`}>
            Alias
          </label>
          <input
            id={`${ids}-alias`}
            className="input"
            style={{ width: 110 }}
            placeholder="alias"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
          />
          <span className="u-faint">→</span>
          <label className="sr-only" htmlFor={`${ids}-canonical`}>
            Canonical skill
          </label>
          <input
            id={`${ids}-canonical`}
            className="input"
            style={{ flex: 1 }}
            placeholder="canonical skill"
            value={newCanonical}
            onChange={(e) => setNewCanonical(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!newAlias.trim() || !newCanonical.trim()}
            onClick={() => {
              setRows([...rows, { alias: newAlias.trim(), canonical: newCanonical.trim() }]);
              setNewAlias('');
              setNewCanonical('');
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => onSave(rows)} style={{ marginTop: 10 }}>
        {saving && dirty ? 'Saving…' : 'Save aliases'}
      </Button>
    </Section>
  );
}

function GithubCard({
  configured,
  lastSyncAt,
  onChanged,
}: {
  configured: boolean;
  lastSyncAt: string | null;
  onChanged: (message: string) => void;
}) {
  const [token, setToken] = useState('');
  const tokenId = useId();
  const saveToken = useMutation({
    mutationFn: (value: string) => api.post('/settings/github-token', { token: value }),
    onSuccess: () => {
      setToken('');
      onChanged('Token stored server-side. It is never echoed back');
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api.del('/settings/github-token'),
    onSuccess: () => onChanged('GitHub disconnected. Synced repositories were kept.'),
  });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="spread">
        <span className="u-muted">Token</span>
        <Chip tone={configured ? 'success' : 'warning'} mono>
          {configured ? 'configured' : 'not set'}
        </Chip>
      </div>
      <div className="spread">
        <span className="u-muted">Last sync</span>
        <Mono>{formatGithubSync(lastSyncAt)}</Mono>
      </div>
      <div className="field" style={{ margin: 0 }}>
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
            {saveToken.isPending ? 'Saving…' : configured ? 'Replace' : 'Save'}
          </Button>
          {configured && (
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
      <p className="u-muted" style={{ fontSize: 'var(--ae-text-xs)', margin: 0 }}>
        Stored server-side only, never echoed back. Sync and the repository list live on{' '}
        <Link to="/repositories">Repositories</Link>.
      </p>
    </div>
  );
}
