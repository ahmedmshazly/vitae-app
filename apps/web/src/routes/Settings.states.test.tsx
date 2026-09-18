/**
 * Settings route: load states, health reporting, and each editor's own save
 * signal. The page owns five separate drafts, so "did that save?" has to be
 * answerable per region, not once for the screen.
 */
import './../test/api-mock.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Settings } from './Settings.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

const SETTINGS = {
  profile: { name: 'Ada', headline: 'Engineer', email: 'ada@example.test', links: [] },
  askWeights: { affiliation: 2, topic: 1.6, pinned: 0.3 },
  skillAliases: [{ alias: 'k8s', canonical: 'Kubernetes' }],
  resumeDefaults: { templateKey: 'cobalt', accent: '#2563eb', emphasis: 'technical' },
  github: { configured: false, lastSyncAt: null },
};

const STATUS = {
  ok: false,
  checks: {
    database: { ok: true, detail: '3ms' },
    buildsvc: { ok: false, detail: 'connection refused' },
  },
  counts: { nodes: 10, edges: 20 },
  env: { node: 'v22', emulators: true, devLogin: true },
};

function serve(over: { settings?: unknown; status?: unknown } = {}) {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/status')) {
      const value = over.status ?? STATUS;
      if (value instanceof Error) throw value;
      return value;
    }
    const value = over.settings ?? SETTINGS;
    if (value instanceof Error) throw value;
    return value;
  });
}

function section(title: string): HTMLElement {
  return screen.getByRole('region', { name: new RegExp(title) });
}

beforeEach(() => {
  resetMockApi();
});

describe('Settings load states', () => {
  it('announces the load before any of the editors exist', () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    renderWithApp(<Settings />, { route: '/settings' });
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument();
  });

  it('names the failure and offers a retry', async () => {
    const user = userEvent.setup();
    serve({ settings: new Error('settings store unreachable') });
    renderWithApp(<Settings />, { route: '/settings' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load settings")).toBeInTheDocument();
    expect(within(alert).getByText('settings store unreachable')).toBeInTheDocument();

    serve();
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: /Profile of me/ })).toBeInTheDocument();
  });

  it('reports a failed health check without touching the rest of the page', async () => {
    serve({ status: new Error('health endpoint unreachable') });
    renderWithApp(<Settings />, { route: '/settings' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't load system status")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Profile of me/ })).toBeInTheDocument();
  });
});

describe('Settings system health', () => {
  it('states ok and down in words beside every check', async () => {
    serve();
    renderWithApp(<Settings />, { route: '/settings' });

    const status = await screen.findByRole('region', { name: /System status/ });
    expect(within(status).getByText('1 down')).toBeInTheDocument();
    expect(within(status).getByText('down')).toBeInTheDocument();
    expect(within(status).getByText('connection refused')).toBeInTheDocument();
    expect(within(status).getByText('3ms')).toBeInTheDocument();
    expect(within(status).getByText('10 nodes · 20 edges')).toBeInTheDocument();
  });
});

describe('Settings profile editor', () => {
  it('holds clean until the draft moves, then saves what changed', async () => {
    const user = userEvent.setup();
    serve();
    mockApi.patch.mockResolvedValue(SETTINGS);
    renderWithApp(<Settings />, { route: '/settings' });

    const profile = await screen.findByRole('region', { name: /Profile of me/ });
    expect(within(profile).getByText('saved')).toBeInTheDocument();
    expect(within(profile).getByRole('button', { name: 'Save profile' })).toBeDisabled();

    await user.type(within(profile).getByLabelText('Name'), ' Lovelace');
    expect(within(profile).getByText('unsaved')).toBeInTheDocument();

    await user.click(within(profile).getByRole('button', { name: 'Save profile' }));
    expect(mockApi.patch).toHaveBeenCalledWith('/settings', {
      profile: { ...SETTINGS.profile, name: 'Ada Lovelace' },
    });
  });

  it('keeps a failed profile draft in place and makes retry explicit', async () => {
    const user = userEvent.setup();
    serve();
    mockApi.patch.mockRejectedValueOnce(new Error('profile service unavailable'));
    renderWithApp(<Settings />, { route: '/settings' });

    const profile = await screen.findByRole('region', { name: /Profile of me/ });
    const name = within(profile).getByLabelText('Name');
    await user.type(name, ' Lovelace');
    await user.click(within(profile).getByRole('button', { name: 'Save profile' }));

    expect(await within(profile).findByText("Couldn't save profile")).toBeInTheDocument();
    expect(within(profile).getByText(/profile service unavailable/)).toBeInTheDocument();
    expect(name).toHaveValue('Ada Lovelace');
    expect(within(profile).getByRole('button', { name: 'Save profile' })).toBeEnabled();

    await user.type(name, '!');
    expect(within(profile).queryByText("Couldn't save profile")).not.toBeInTheDocument();
  });
});

describe('Settings résumé defaults', () => {
  it('names each accent instead of reading out its hex', async () => {
    const user = userEvent.setup();
    serve();
    renderWithApp(<Settings />, { route: '/settings' });

    const defaults = await screen.findByRole('region', { name: /Résumé defaults/ });
    const cobalt = within(defaults).getByRole('button', { name: 'Use Cobalt accent' });
    const teal = within(defaults).getByRole('button', { name: 'Use Teal accent' });
    expect(cobalt).toHaveAttribute('aria-pressed', 'true');
    expect(teal).toHaveAttribute('aria-pressed', 'false');

    await user.click(teal);
    expect(teal).toHaveAttribute('aria-pressed', 'true');
    expect(within(defaults).getByText('Teal')).toBeInTheDocument();
  });
});

describe('Settings taxonomy editor', () => {
  it('adds and removes an alias by name', async () => {
    const user = userEvent.setup();
    serve();
    renderWithApp(<Settings />, { route: '/settings' });

    const taxonomy = await screen.findByRole('region', { name: /Taxonomy/ });
    expect(within(taxonomy).getByText('k8s')).toBeInTheDocument();

    await user.type(within(taxonomy).getByLabelText('New alias'), 'ts');
    await user.type(
      within(taxonomy).getByLabelText('Canonical skill for the new alias'),
      'TypeScript',
    );
    await user.click(within(taxonomy).getByRole('button', { name: 'Add' }));
    expect(within(taxonomy).getByText('TypeScript')).toBeInTheDocument();

    await user.click(within(taxonomy).getByRole('button', { name: 'Remove alias k8s' }));
    expect(within(taxonomy).queryByText('k8s')).not.toBeInTheDocument();
  });

  it('says so when the dictionary is empty rather than showing a bare rule', async () => {
    serve({ settings: { ...SETTINGS, skillAliases: [] } });
    renderWithApp(<Settings />, { route: '/settings' });

    const taxonomy = await screen.findByRole('region', { name: /Taxonomy/ });
    expect(within(taxonomy).getByText('No aliases yet')).toBeInTheDocument();
  });
});

describe('Settings ranking constants', () => {
  it('labels every weight and reports that a change is being held', async () => {
    serve();
    mockApi.patch.mockResolvedValue(SETTINGS);
    renderWithApp(<Settings />, { route: '/settings' });

    const ranking = await screen.findByRole('region', { name: /Ranking constants/ });
    const slider = within(ranking).getByLabelText('Affiliation (org match)');
    expect(within(ranking).getByLabelText('Topic overlap')).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '2.5' } });
    expect(within(ranking).getByText('Holding your change')).toBeInTheDocument();

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalled(), { timeout: 2000 });
    expect(mockApi.patch.mock.calls[0][1]).toEqual({
      askWeights: { ...SETTINGS.askWeights, affiliation: 2.5 },
    });
  });
});

describe('Settings GitHub panel', () => {
  it('offers a disconnect only once a token is configured', async () => {
    serve({
      settings: {
        ...SETTINGS,
        github: { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' },
      },
    });
    renderWithApp(<Settings />, { route: '/settings' });

    const github = await screen.findByRole('region', { name: /GitHub/ });
    expect(within(github).getByLabelText('Personal access token')).toBeInTheDocument();
    expect(within(github).getByText('2026-08-01 10:00')).toBeInTheDocument();
    expect(
      within(github).getByRole('button', { name: 'Disconnect GitHub token' }),
    ).toBeInTheDocument();
    expect(within(github).getByRole('link', { name: 'Repositories' })).toBeInTheDocument();
  });

  it('reports a token that would not store', async () => {
    const user = userEvent.setup();
    serve();
    mockApi.post.mockRejectedValue(new Error('github rejected the token'));
    renderWithApp(<Settings />, { route: '/settings' });

    const github = await screen.findByRole('region', { name: /GitHub/ });
    await user.type(within(github).getByLabelText('Personal access token'), 'ghp_x');
    await user.click(within(github).getByRole('button', { name: 'Save' }));

    expect(await within(github).findByText("Couldn't store the token")).toBeInTheDocument();
    expect(within(github).getByText('github rejected the token')).toBeInTheDocument();
  });
});

describe('Settings Gemini panel', () => {
  it('offers a disconnect only once a key is configured', async () => {
    serve({
      settings: {
        ...SETTINGS,
        gemini: { configured: true, project: 'gen-lang-client-test', source: 'file' },
      },
    });
    renderWithApp(<Settings />, { route: '/settings' });

    const gemini = await screen.findByRole('region', { name: /^Gemini/ });
    expect(within(gemini).getByLabelText('API key')).toBeInTheDocument();
    expect(within(gemini).getByText('gen-lang-client-test')).toBeInTheDocument();
    expect(within(gemini).getByRole('button', { name: 'Disconnect Gemini' })).toBeInTheDocument();
    expect(within(gemini).getByRole('link', { name: 'Gemini' })).toBeInTheDocument();
  });
});

describe('Settings sub-views', () => {
  it('shows only the profile pair on the profile view', async () => {
    serve();
    renderWithApp(<Settings />, { route: '/settings/profile' });

    expect(await screen.findByRole('region', { name: /Profile of me/ })).toBeInTheDocument();
    expect(section('Identity')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Ranking constants/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /System status/ })).not.toBeInTheDocument();
  });

  it('leaves the health strip out of the preferences view', async () => {
    serve();
    renderWithApp(<Settings />, { route: '/settings/preferences' });

    expect(await screen.findByRole('region', { name: /Ranking constants/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Identity/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /GitHub/ })).not.toBeInTheDocument();
  });
});
