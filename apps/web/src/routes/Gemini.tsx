/**
 * Gemini source: connect a project and API key, then leave them parked.
 * No workflow consumes the credential yet.
 */
import { useId, useState } from 'react';
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
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

export interface GeminiSettings {
  configured: boolean;
  project: string | null;
  source: 'env' | 'file' | 'none';
}

export type ConnectionTone = 'success' | 'warning' | 'muted' | 'danger';

export interface GeminiConnectionState {
  label: string;
  tone: ConnectionTone;
  connected: boolean;
}

/**
 * Connection chip for the Gemini panel. Settings may still be loading; never
 * invent "not connected" from a missing cache entry.
 */
export function geminiConnectionState(
  settingsState: 'loading' | 'error' | 'ready',
  gemini: GeminiSettings | undefined,
): GeminiConnectionState {
  if (settingsState === 'loading') {
    return { label: 'checking', tone: 'muted', connected: false };
  }
  if (settingsState === 'error') {
    return { label: 'unavailable', tone: 'danger', connected: false };
  }
  if (!gemini?.configured) {
    return { label: 'not connected', tone: 'warning', connected: false };
  }
  return { label: 'connected', tone: 'success', connected: true };
}

export function Gemini() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [project, setProject] = useState('');
  const keyId = useId();
  const projectId = useId();
  const keyHelpId = `${keyId}-help`;

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ gemini: GeminiSettings }>('/settings'),
  });

  const settingsState: 'loading' | 'error' | 'ready' = settings.isError
    ? 'error'
    : settings.isLoading || !settings.data
      ? 'loading'
      : 'ready';
  const gemini = settings.data?.gemini;
  const connection = geminiConnectionState(settingsState, gemini);

  const save = useMutation({
    mutationFn: (value: { apiKey: string; project: string }) =>
      api.post('/settings/gemini', value),
    onSuccess: async () => {
      setApiKey('');
      setProject('');
      await qc.invalidateQueries({ queryKey: ['settings'] });
      flash('Gemini connected. The key is never echoed back.');
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.del('/settings/gemini'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] });
      flash('Gemini disconnected.');
    },
  });

  const fromEnv = gemini?.source === 'env';

  return (
    <div className="page data-workspace-page data-gemini-page">
      <PageHeader
        title="Gemini"
        subtitle="Connect a Google Gemini project and API key. Nothing uses them yet; they stay ready."
        help={
          <InfoPopover title="How Gemini is stored">
            <p>
              The API key is stored server-side only, never returned to this browser after saving.
              A project id is an identifier, not a secret, and can be shown.
            </p>
            <p>
              If the key is already in the environment, rotate it there. This screen will refuse a
              competing copy.
            </p>
          </InfoPopover>
        }
      />

      <div className="data-workspace-trace" aria-live="polite">
        {settings.isError ? (
          <StatusTrace
            tone="danger"
            label="Couldn't load Gemini settings"
            detail={(settings.error as Error).message}
          />
        ) : settings.isLoading ? (
          <StatusTrace tone="live" label="Checking Gemini" detail="Reading connection status" />
        ) : connection.connected ? (
          <StatusTrace
            tone="success"
            label="Gemini is connected"
            detail={
              fromEnv
                ? 'Credential available from the environment'
                : 'Credential saved on this machine'
            }
          />
        ) : (
          <StatusTrace
            tone="warning"
            label="Gemini needs a connection"
            detail="Add a project and API key below, or set them in the environment"
          />
        )}
      </div>

      <Section
        title="Gemini connection"
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
            title="Couldn't load Gemini settings"
            detail={(settings.error as Error | null)?.message}
            onRetry={() => void settings.refetch()}
          />
        ) : settings.isLoading ? (
          <SkeletonRows rows={3} label="Loading Gemini settings" />
        ) : (
          <div className="data-github-connection">
            <div className="data-github-connection__brief">
              <span className="data-state-dot" data-tone={connection.tone} aria-hidden />
              <div>
                <strong>
                  {connection.connected ? 'Credential available' : 'Credential required'}
                </strong>
                <p>
                  {fromEnv
                    ? 'The key is provided by the environment. Rotate it there, not through this form.'
                    : 'The key is stored server-side and never returned to this browser after saving.'}
                </p>
              </div>
              <div className="data-github-connection__time">
                <span>Project</span>
                <Mono>{gemini?.project ?? 'not set'}</Mono>
              </div>
            </div>
            <form
              className="data-github-connection__form data-github-connection__form--stacked"
              onSubmit={(event) => {
                event.preventDefault();
                if (apiKey.trim() && !save.isPending) {
                  save.mutate({ apiKey: apiKey.trim(), project: project.trim() });
                }
              }}
            >
              <div className="data-github-connection__fields">
                <Field label="Project" htmlFor={projectId}>
                  <Input
                    id={projectId}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="GEMINI_PROJECT"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  />
                </Field>
                <Field
                  label={connection.connected ? 'Replace API key' : 'API key'}
                  htmlFor={keyId}
                >
                  <Input
                    id={keyId}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="AIza… (Google AI Studio or Vertex)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    aria-describedby={keyHelpId}
                  />
                </Field>
              </div>
              <div className="data-github-connection__actions">
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={!apiKey.trim() || save.isPending}
                >
                  {save.isPending
                    ? 'Saving...'
                    : connection.connected
                      ? 'Replace key'
                      : 'Connect Gemini'}
                </Button>
                {connection.connected && !fromEnv && (
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
                className="data-github-connection__help"
                tone="warning"
                label={save.isError ? "Couldn't store the key" : "Couldn't disconnect Gemini"}
                detail={((save.error ?? disconnect.error) as Error | null)?.message ?? 'Try again.'}
              />
            ) : null}
            <p id={keyHelpId} className="data-github-connection__help">
              Stored server-side only, never echoed back. Accepts{' '}
              <code>GEMINI_API_KEY</code> and <code>GEMINI_PROJECT</code>, or the{' '}
              <code>GEMENI_*</code> aliases already in a local <code>.env</code>.
            </p>
          </div>
        )}
      </Section>

      <Section title="Workflows">
        <EmptyState
          glyph="idea"
          title="No Gemini workflows yet"
          hint="The credential is stored so a later feature can use it. Nothing is sent to Google from this screen."
        />
      </Section>
    </div>
  );
}
