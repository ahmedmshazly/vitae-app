/**
 * Repositories: the states the ledger and the connection panel report.
 *
 * Two waits were wrapped in a second live region each, the ledger was gated on
 * a Settings request it does not depend on, and every fact about a repository
 * lived inside a link that had renamed itself with an aria-label.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Repositories } from './Repositories.js';

function repo(id: string, fullName: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: fullName.split('/')[1] ?? fullName,
    source: 'github',
    props: {
      full_name: fullName,
      primary_language: 'TypeScript',
      stars: 12,
      description: `${fullName} keeps the graph honest`,
      ...over,
    },
  };
}

/** One handler per endpoint, because this screen asks two questions at once. */
function serve(settings: unknown, repos: unknown) {
  mockApi.get.mockImplementation((url: string) =>
    url === '/settings' ? settings : repos,
  );
}

const connected = Promise.resolve({
  github: { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' },
});
const unconfigured = Promise.resolve({ github: { configured: false, lastSyncAt: null } });
const pending = new Promise<never>(() => {});

function renderRepositories() {
  return renderWithApp(<Repositories />, { route: '/repositories' });
}

beforeEach(() => {
  resetMockApi();
});

describe('Repositories states', () => {
  it('waits for the token check in one live region rather than two', () => {
    serve(pending, Promise.resolve({ nodes: [] }));
    renderRepositories();

    const wait = screen.getByLabelText('Loading GitHub settings');
    expect(wait).toHaveAttribute('role', 'status');
    // The skeleton is already a polite live region with a label of its own; a
    // wrapper around it made the same wait announce twice.
    expect(within(wait).queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the repositories it already has while the token check is still out', async () => {
    serve(pending, Promise.resolve({ nodes: [repo('r1', 'jordan/vitae')] }));
    renderRepositories();

    expect(await screen.findByRole('link', { name: 'Open jordan/vitae' })).toBeInTheDocument();
  });

  it('answers no connection question the token check has not answered yet', async () => {
    serve(pending, Promise.resolve({ nodes: [] }));
    renderRepositories();

    expect(await screen.findByText('No repositories yet')).toBeInTheDocument();
    expect(screen.queryByText('Connect GitHub to begin')).not.toBeInTheDocument();
  });

  it('keeps every fact about a repository beside the link instead of inside it', async () => {
    serve(connected, Promise.resolve({ nodes: [repo('r1', 'jordan/vitae', { forks: 3 })] }));
    renderRepositories();

    const link = await screen.findByRole('link', { name: 'Open jordan/vitae' });
    expect(link).toHaveTextContent('jordan/vitae');
    // An aria-label replaces the contents of an element in its accessible
    // name, so anything inside this link was announced as nothing at all.
    expect(link).not.toHaveTextContent('12 stars');
    expect(link).not.toHaveTextContent('TypeScript');
    expect(link).not.toHaveTextContent('keeps the graph honest');

    const row = link.closest('li')!;
    expect(within(row).getByText('12 stars')).toBeInTheDocument();
    expect(within(row).getByText('3 forks')).toBeInTheDocument();
    expect(within(row).getByText('TypeScript')).toBeInTheDocument();
    expect(within(row).getByText('jordan/vitae keeps the graph honest')).toBeInTheDocument();
  });

  it('is a real list, so the ledger can be counted and skipped', async () => {
    serve(
      connected,
      Promise.resolve({ nodes: [repo('r1', 'jordan/vitae'), repo('r2', 'jordan/atlas')] }),
    );
    renderRepositories();

    await screen.findByRole('link', { name: 'Open jordan/vitae' });
    const section = screen.getByRole('region', { name: /^Synced repositories/ });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('asks for the token with a labelled field that carries its own help', async () => {
    serve(unconfigured, Promise.resolve({ nodes: [] }));
    renderRepositories();

    const field = await screen.findByLabelText('Personal access token');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAccessibleDescription(/never echoed back/);
  });

  it('reports a failed repository list without claiming you have none', async () => {
    // Built inside the handler so the rejection is created when the query
    // asks for it, not when the test file is read.
    mockApi.get.mockImplementation((url: string) =>
      url === '/settings' ? connected : Promise.reject(new Error('repository index unreachable')),
    );
    renderRepositories();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load repositories");
    expect(alert).toHaveTextContent('repository index unreachable');
    expect(screen.queryByText('No repositories yet')).not.toBeInTheDocument();
  });
});
