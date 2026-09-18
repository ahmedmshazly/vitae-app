import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  RegisterRule,
  Section,
  Select,
  SkeletonRows,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { accentLabel, accentName, DEFAULT_ACCENT, RESUME_ACCENTS } from '../lib/accent-palette.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useServerDraft } from '../lib/use-server-draft.js';
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
  gemini?: { configured: boolean; project: string | null; source?: 'env' | 'file' | 'none' };
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

const TEMPLATE_OPTIONS = [
  { value: 'cobalt', label: 'Cobalt' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'argon', label: 'Argon' },
];

const EMPHASIS_OPTIONS = [
  { value: 'technical', label: 'Technical' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
];

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

/**
 * A ruled register of stated facts: term on the left, value on the right, a
 * hairline between. Settings had three of these built out of `.spread` rows and
 * none of them were marked up as the definition lists they are.
 */
function Facts({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6">{children}</dl>;
}
function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid items-center border-b border-hairline py-2 last:border-b-0">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="m-0 flex min-w-0 justify-end text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Marks a form whose draft has moved away from what the server holds. */
function DirtyChip({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving && dirty)
    return (
      <Chip tone="accent" mono>
        saving
      </Chip>
    );
  if (!dirty) return <Chip mono>saved</Chip>;
  return (
    <Chip tone="warning" mono>
      unsaved
    </Chip>
  );
}

/** Settings (SRS P22): profile, ranking constants, taxonomy, GitHub, health. */
export function Settings() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const { flash } = useToast();
  const view = pathname.endsWith('/profile')
    ? 'profile'
    : pathname.endsWith('/preferences')
      ? 'preferences'
      : pathname.endsWith('/system')
        ? 'system'
        : 'all';
  const pageTitle =
    view === 'all'
      ? 'Settings'
      : view === 'profile'
        ? 'Profile'
        : view === 'preferences'
          ? 'Preferences'
          : 'System';

  const showProfile = view === 'all' || view === 'profile';
  const showPreferences = view === 'all' || view === 'preferences';
  const showSystem = view === 'all' || view === 'system';

  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<Status>('/status'),
    enabled: showSystem,
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsResp>('/settings'),
  });
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

  const systemStatus = showSystem ? (
    <SystemStatusSection
      isError={status.isError}
      error={status.error as Error | null}
      isLoading={status.isLoading || !status.data}
      refetching={status.isFetching}
      onRetry={() => void status.refetch()}
      data={status.data}
      failing={failing}
      healthy={status.isSuccess}
    />
  ) : null;

  const identity =
    view !== 'preferences' ? <IdentitySection email={user?.email} via={user?.via} /> : null;

  return (
    <div className="page">
      <PageHeader
        title={pageTitle}
        subtitle={
          view === 'profile'
            ? 'The owner identity used across your graph and career documents.'
            : view === 'preferences'
              ? 'Tune deterministic ranking, taxonomy, and document defaults.'
              : view === 'system'
                ? 'Live service health, connected sources, and ownership controls.'
                : 'Owner-only · single-user data plane.'
        }
        help={
          <InfoPopover title="Calibration">
            <p>
              Profile and résumé defaults feed new Tailor sessions. Ranking constants reshape Ask.
              Skill aliases teach the JD parser which nicknames mean which skills.
            </p>
            <p>
              GitHub credentials and sync live primarily under Repositories; System status is the
              live health strip.
            </p>
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
          title="Couldn't load settings"
          detail={(settings.error as Error | null)?.message}
          onRetry={() => void settings.refetch()}
          retrying={settings.isFetching}
        />
      ) : settings.isLoading || !settings.data ? (
        <SkeletonRows rows={8} label="Loading settings" />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="min-w-0">
            {showProfile && (
              <ProfileCard
                profile={settings.data.profile}
                email={user?.email ?? ''}
                saving={patch.isPending}
                saveError={
                  patch.isError && patch.variables?.profile
                    ? ((patch.error as Error | null)?.message ?? 'Try again.')
                    : null
                }
                onEdit={() => patch.reset()}
                onSave={(profile) => patch.mutate({ profile })}
              />
            )}
            {showPreferences && (
              <>
                <ResumeDefaultsCard
                  defaults={
                    settings.data.resumeDefaults ?? {
                      templateKey: 'cobalt',
                      accent: DEFAULT_ACCENT,
                      emphasis: 'technical',
                    }
                  }
                  saving={patch.isPending}
                  onSave={(resumeDefaults) => patch.mutate({ resumeDefaults })}
                />
                <WeightsCard
                  weights={settings.data.askWeights}
                  saving={patch.isPending}
                  onChange={(askWeights) => patch.mutate({ askWeights })}
                />
                <AliasesCard
                  aliases={settings.data.skillAliases}
                  saving={patch.isPending}
                  onSave={(skillAliases) => patch.mutate({ skillAliases })}
                />
              </>
            )}
            {view === 'system' && systemStatus}
          </div>

          <aside className="min-w-0">
            {view !== 'system' && systemStatus}
            {showSystem && (
              <>
                <GithubCard
                  configured={settings.data.github.configured}
                  lastSyncAt={settings.data.github.lastSyncAt}
                  onChanged={(message) => {
                    void qc.invalidateQueries({ queryKey: ['settings'] });
                    flash(message);
                  }}
                />
                <GeminiCard
                  configured={settings.data.gemini?.configured ?? false}
                  project={settings.data.gemini?.project ?? null}
                  source={settings.data.gemini?.source ?? 'none'}
                  onChanged={(message) => {
                    void qc.invalidateQueries({ queryKey: ['settings'] });
                    flash(message);
                  }}
                />
              </>
            )}
            {identity}
          </aside>
        </div>
      )}
    </div>
  );
}

function SystemStatusSection({
  isError,
  error,
  isLoading,
  refetching,
  onRetry,
  data,
  failing,
  healthy,
}: {
  isError: boolean;
  error: Error | null;
  isLoading: boolean;
  refetching: boolean;
  onRetry: () => void;
  data: Status | undefined;
  failing: number;
  healthy: boolean;
}) {
  return (
    <Section
      title="System status"
      actions={
        healthy ? (
          <Chip tone={failing > 0 ? 'danger' : 'success'} mono>
            {failing > 0 ? `${failing} down` : 'healthy'}
          </Chip>
        ) : undefined
      }
    >
      {isError ? (
        <ErrorState
          title="Couldn't load system status"
          detail={error?.message}
          onRetry={onRetry}
          retrying={refetching}
          retryLabel="Check again"
        />
      ) : isLoading || !data ? (
        <SkeletonRows rows={4} label="Loading system status" />
      ) : (
        <>
          <Facts>
            {Object.entries(data.checks).map(([name, c]) => (
              <Fact
                key={name}
                term={
                  <span className="flex items-center gap-2">
                    <Chip tone={c.ok ? 'success' : 'danger'} mono>
                      {c.ok ? 'ok' : 'down'}
                    </Chip>
                    {name}
                  </span>
                }
              >
                <Mono className="text-sm text-faint">{statusCheckDetail(c)}</Mono>
              </Fact>
            ))}
            <Fact term="Records">
              <Mono className="text-sm">
                {data.counts.nodes} nodes · {data.counts.edges} edges
              </Mono>
            </Fact>
            <Fact term="Environment">
              <Chip mono>{data.env.emulators ? 'emulators' : 'cloud'}</Chip>
            </Fact>
          </Facts>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/data/identity" className="vt-btn vt-btn--sm">
              Open duplicates queue
            </Link>
          </div>
        </>
      )}
    </Section>
  );
}

function IdentitySection({ email, via }: { email?: string; via?: string }) {
  return (
    <Section title="Identity">
      <Facts>
        <Fact term="Signed in as">
          <Mono className="text-sm">{email}</Mono>
        </Fact>
        <Fact term="Method">
          <Chip mono>{via}</Chip>
        </Fact>
      </Facts>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/data/exports" className="vt-btn vt-btn--sm">
          Export &amp; backups
        </Link>
      </div>
    </Section>
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
  const { draft, setDraft, dirty } = useServerDraft(defaults);
  const ids = useId();

  return (
    <Section title="Résumé defaults" actions={<DirtyChip dirty={dirty} saving={saving} />}>
      <p className="m-0 mb-3 text-sm text-ink-soft">
        Starting template, accent, and wording emphasis for new Tailor sessions.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Default template" htmlFor={`${ids}-template`}>
          <Select
            id={`${ids}-template`}
            label="Default template"
            value={draft.templateKey}
            clearable={false}
            options={TEMPLATE_OPTIONS}
            onChange={(value) => value && setDraft({ ...draft, templateKey: value })}
          />
        </Field>
        <Field label="Default wording" htmlFor={`${ids}-emphasis`}>
          <Select
            id={`${ids}-emphasis`}
            label="Default wording"
            value={draft.emphasis}
            clearable={false}
            options={EMPHASIS_OPTIONS}
            onChange={(value) => value && setDraft({ ...draft, emphasis: value })}
          />
        </Field>
      </div>
      <div className="mb-4">
        <span className="vt-fld__label" id={`${ids}-accent`}>
          Default accent
        </span>
        <div className="accent-picker" role="group" aria-labelledby={`${ids}-accent`}>
          {RESUME_ACCENTS.map((accent) => (
            <button
              key={accent.value}
              type="button"
              aria-label={accentLabel(accent.value)}
              aria-pressed={draft.accent === accent.value}
              title={`${accent.name} · ${accent.value}`}
              onClick={() => setDraft({ ...draft, accent: accent.value })}
              style={{ '--swatch': accent.value } as CSSProperties}
            />
          ))}
        </div>
        <p className="m-0 mt-1 text-xs text-faint">
          Selected: <Mono>{accentName(draft.accent)}</Mono>
        </p>
      </div>
      <Button variant="primary" disabled={!dirty || saving} onClick={() => onSave(draft)}>
        {saving && dirty ? 'Saving...' : 'Save résumé defaults'}
      </Button>
    </Section>
  );
}

function ProfileCard({
  profile,
  email,
  onSave,
  onEdit,
  saving,
  saveError,
}: {
  profile: SettingsResp['profile'];
  email: string;
  onSave: (p: SettingsResp['profile']) => void;
  onEdit: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const { draft, setDraft, dirty } = useServerDraft(profile);
  // FR-023: every visual label is associated with its control via htmlFor/id, so
  // clicking the label focuses the field and screen readers announce the name.
  const ids = useId();
  const updateDraft = (next: SettingsResp['profile']) => {
    onEdit();
    setDraft(next);
  };

  return (
    <Section title="Profile of me" actions={<DirtyChip dirty={dirty} saving={saving} />}>
      <p className="m-0 mb-3 text-sm text-ink-soft">The résumé contact block used by templates.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty && !saving) onSave(draft);
        }}
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor={`${ids}-name`}>
            <Input
              id={`${ids}-name`}
              value={draft.name}
              onChange={(e) => updateDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Headline" htmlFor={`${ids}-headline`}>
            <Input
              id={`${ids}-headline`}
              value={draft.headline}
              onChange={(e) => updateDraft({ ...draft, headline: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label="Contact email"
          htmlFor={`${ids}-email`}
          help="Left blank, documents fall back to the address you signed in with."
        >
          <Input
            id={`${ids}-email`}
            type="email"
            placeholder={email}
            value={draft.email}
            onChange={(e) => updateDraft({ ...draft, email: e.target.value })}
          />
        </Field>
        <Field label="Links (one per line)" htmlFor={`${ids}-links`}>
          <Textarea
            id={`${ids}-links`}
            rows={2}
            value={draft.links.join('\n')}
            onChange={(e) =>
              updateDraft({
                ...draft,
                links: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Button type="submit" variant="primary" disabled={!dirty || saving}>
          {saving && dirty ? 'Saving...' : 'Save profile'}
        </Button>
        {saveError ? (
          <StatusTrace
            className="mt-2"
            tone="warning"
            label="Couldn't save profile"
            detail={`${saveError} Your changes are still here; review them and save again.`}
          />
        ) : null}
      </form>
    </Section>
  );
}

function WeightsCard({
  weights,
  saving,
  onChange,
}: {
  weights: Record<string, number>;
  saving: boolean;
  onChange: (w: Record<string, number>) => void;
}) {
  const { draft, setDraft } = useServerDraft(weights);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = useId();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function update(key: string, value: number) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setPending(true);
    // Debounced live save: Ask reranks deterministically on next query.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPending(false);
      onChange(next);
    }, 500);
  }

  return (
    <Section title="Ranking constants" actions={<Chip mono>auto-saves</Chip>}>
      <p className="m-0 mb-3 text-sm text-ink-soft">
        Explainability includes tunability: Ask reranks live with these weights.
      </p>
      <div className="flex flex-col gap-2">
        {Object.entries(draft).map(([key, value]) => {
          const label = WEIGHT_LABELS[key] ?? key;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`${ids}-${key}`} className="text-sm text-ink-soft">
                  {label}
                </label>
                <Mono className="text-sm text-muted">{value.toFixed(2)}</Mono>
              </div>
              <input
                id={`${ids}-${key}`}
                className="vt-range"
                type="range"
                min={0}
                max={key === 'pinned' ? 1 : 3}
                step={0.05}
                value={value}
                aria-valuetext={`${label}: ${value.toFixed(2)}`}
                onChange={(e) => update(key, Number(e.target.value))}
              />
            </div>
          );
        })}
      </div>
      {pending || saving ? (
        <StatusTrace
          className="mt-2"
          tone="live"
          label={pending ? 'Holding your change' : 'Saving ranking constants'}
          detail={pending ? 'Saves once you stop moving' : undefined}
        />
      ) : null}
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
  const { draft: rows, setDraft: setRows, dirty } = useServerDraft(aliases);
  const [newAlias, setNewAlias] = useState('');
  const [newCanonical, setNewCanonical] = useState('');

  const canAdd = Boolean(newAlias.trim() && newCanonical.trim());
  function add() {
    if (!canAdd) return;
    setRows([...rows, { alias: newAlias.trim(), canonical: newCanonical.trim() }]);
    setNewAlias('');
    setNewCanonical('');
  }

  return (
    <Section
      title="Taxonomy · skills & aliases"
      meta={rows.length}
      actions={<DirtyChip dirty={dirty} saving={saving} />}
    >
      <p className="m-0 mb-3 text-sm text-ink-soft">
        The JD-parser dictionary: aliases resolve to canonical skills during capture and tailoring.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          glyph="tag"
          title="No aliases yet"
          hint="Teach the parser that k8s means Kubernetes, and every future import agrees."
        />
      ) : (
        <ul className="m-0 list-none p-0" aria-label="Skill aliases">
          {rows.map((r, i) => (
            <li
              key={`${r.alias}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-1 last:border-b-0"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-2 font-mono text-sm">
                <span className="text-muted">{r.alias}</span>
                <span className="text-faint" aria-hidden>
                  →
                </span>
                <span className="sr-only">resolves to</span>
                <span className="break-words text-ink-soft">{r.canonical}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove alias ${r.alias}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="New alias"
          mono
          placeholder="alias"
          value={newAlias}
          onChange={(e) => setNewAlias(e.target.value)}
        />
        <Input
          aria-label="Canonical skill for the new alias"
          mono
          placeholder="canonical skill"
          value={newCanonical}
          onChange={(e) => setNewCanonical(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!canAdd}>
          Add
        </Button>
      </form>
      <Button
        className="mt-3"
        size="sm"
        variant="primary"
        disabled={!dirty || saving}
        onClick={() => onSave(rows)}
      >
        {saving && dirty ? 'Saving...' : 'Save aliases'}
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
    <Section title="GitHub">
      <Facts>
        <Fact term="Token">
          <Chip tone={configured ? 'success' : 'warning'} mono>
            {configured ? 'configured' : 'not set'}
          </Chip>
        </Fact>
        <Fact term="Last sync">
          <Mono className="text-sm">{formatGithubSync(lastSyncAt)}</Mono>
        </Fact>
      </Facts>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim() && !saveToken.isPending) saveToken.mutate(token.trim());
        }}
      >
        <Field label="Personal access token" htmlFor={tokenId}>
          <Input
            id={tokenId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_... (repo read scope)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!token.trim() || saveToken.isPending}
          >
            {saveToken.isPending ? 'Saving...' : configured ? 'Replace' : 'Save'}
          </Button>
          {configured && (
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
      {saveToken.isError || disconnect.isError ? (
        <StatusTrace
          className="mt-2"
          tone="warning"
          label={saveToken.isError ? "Couldn't store the token" : "Couldn't disconnect GitHub"}
          detail={((saveToken.error ?? disconnect.error) as Error | null)?.message ?? 'Try again.'}
        />
      ) : null}
      <p className="m-0 mt-2 text-xs text-muted">
        Stored server-side only, never echoed back. Sync and the repository list live on{' '}
        <Link to="/data/sources/github">Repositories</Link>.
      </p>
    </Section>
  );
}

function GeminiCard({
  configured,
  project,
  source,
  onChanged,
}: {
  configured: boolean;
  project: string | null;
  source: 'env' | 'file' | 'none';
  onChanged: (message: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [projectDraft, setProjectDraft] = useState('');
  const keyId = useId();
  const projectId = useId();
  const save = useMutation({
    mutationFn: (value: { apiKey: string; project: string }) => api.post('/settings/gemini', value),
    onSuccess: () => {
      setApiKey('');
      setProjectDraft('');
      onChanged('Gemini key stored server-side. It is never echoed back');
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api.del('/settings/gemini'),
    onSuccess: () => onChanged('Gemini disconnected.'),
  });

  return (
    <Section title="Gemini">
      <Facts>
        <Fact term="Key">
          <Chip tone={configured ? 'success' : 'warning'} mono>
            {configured ? 'configured' : 'not set'}
          </Chip>
        </Fact>
        <Fact term="Project">
          <Mono className="text-sm">{project ?? 'not set'}</Mono>
        </Fact>
      </Facts>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (apiKey.trim() && !save.isPending) {
            save.mutate({ apiKey: apiKey.trim(), project: projectDraft.trim() });
          }
        }}
      >
        <Field label="Project" htmlFor={projectId}>
          <Input
            id={projectId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="GEMINI_PROJECT"
            value={projectDraft}
            onChange={(e) => setProjectDraft(e.target.value)}
          />
        </Field>
        <Field label="API key" htmlFor={keyId}>
          <Input
            id={keyId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!apiKey.trim() || save.isPending}
          >
            {save.isPending ? 'Saving...' : configured ? 'Replace' : 'Save'}
          </Button>
          {configured && source !== 'env' && (
            <Button
              type="button"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              aria-label="Disconnect Gemini"
            >
              {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          )}
        </div>
      </form>
      {save.isError || disconnect.isError ? (
        <StatusTrace
          className="mt-2"
          tone="warning"
          label={save.isError ? "Couldn't store the key" : "Couldn't disconnect Gemini"}
          detail={((save.error ?? disconnect.error) as Error | null)?.message ?? 'Try again.'}
        />
      ) : null}
      <p className="m-0 mt-2 text-xs text-muted">
        Stored server-side only, never echoed back. Connection custody lives on{' '}
        <Link to="/data/sources/gemini">Gemini</Link>.
      </p>
    </Section>
  );
}
