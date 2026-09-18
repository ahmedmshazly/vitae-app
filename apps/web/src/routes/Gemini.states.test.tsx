/**
 * Gemini source: connection custody only. No workflow consumes the key yet.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Gemini } from './Gemini.js';

function serve(settings: unknown) {
  mockApi.get.mockImplementation((url: string) => (url === '/settings' ? settings : {}));
}

const connected = Promise.resolve({
  github: { configured: false, lastSyncAt: null },
  gemini: { configured: true, project: 'gen-lang-client-test', source: 'env' },
});
const fileBacked = Promise.resolve({
  github: { configured: false, lastSyncAt: null },
  gemini: { configured: true, project: 'file-project', source: 'file' },
});
const unconfigured = Promise.resolve({
  github: { configured: false, lastSyncAt: null },
  gemini: { configured: false, project: null, source: 'none' },
});
const pending = new Promise<never>(() => {});

beforeEach(() => {
  resetMockApi();
});

describe('Gemini source states', () => {
  it('waits for the key check in one live region rather than two', () => {
    serve(pending);
    renderWithApp(<Gemini />, { route: '/data/sources/gemini' });

    const wait = screen.getByLabelText('Loading Gemini settings');
    expect(wait).toHaveAttribute('role', 'status');
    expect(within(wait).queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks for the key with a labelled password field that carries its own help', async () => {
    serve(unconfigured);
    renderWithApp(<Gemini />, { route: '/data/sources/gemini' });

    const field = await screen.findByLabelText('API key');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAccessibleDescription(/never echoed back/);
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
  });

  it('shows the project id and never the key once connected', async () => {
    serve(connected);
    renderWithApp(<Gemini />, { route: '/data/sources/gemini' });

    expect(await screen.findByText('gen-lang-client-test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect Gemini' })).not.toBeInTheDocument();
    expect(screen.queryByText(/AIza/)).not.toBeInTheDocument();
  });

  it('lets a file-backed key disconnect', async () => {
    serve(fileBacked);
    renderWithApp(<Gemini />, { route: '/data/sources/gemini' });

    expect(await screen.findByRole('button', { name: 'Disconnect Gemini' })).toBeInTheDocument();
  });

  it('says the credential is parked until a workflow exists', async () => {
    serve(connected);
    renderWithApp(<Gemini />, { route: '/data/sources/gemini' });

    expect(await screen.findByText('No Gemini workflows yet')).toBeInTheDocument();
    expect(screen.getByText(/stored so a later feature can use it/)).toBeInTheDocument();
  });
});
