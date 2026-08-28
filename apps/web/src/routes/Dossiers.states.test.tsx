/**
 * Four states are four screens (NFR-REL-004). This list has a fifth that is
 * easy to mistake for the empty one: a workspace with no self record has no
 * subject to make a dossier about, and saying "no dossiers yet" there sends a
 * person looking for a New button that could not work.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Dossiers } from './Dossiers.js';

const SELF = { self: { id: 'p1', title: 'Ada Lovelace' } };

function renderList() {
  return renderWithApp(
    <Routes>
      <Route path="/career/dossiers" element={<Dossiers />} />
    </Routes>,
    { route: '/career/dossiers' },
  );
}

/** Answer /auth/me one way and everything else another. */
function answers(self: unknown, rest: (path: string) => unknown) {
  mockApi.get.mockImplementation((path: string) => {
    if (path.startsWith('/auth/me')) {
      return self instanceof Error ? Promise.reject(self) : Promise.resolve(self);
    }
    const value = rest(path);
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

beforeEach(() => {
  resetMockApi();
});

describe('Dossiers states', () => {
  it('reports a failed identity lookup instead of claiming you have no self record', async () => {
    answers(new Error('auth service unavailable'), () => ({ dossiers: [] }));
    renderList();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't check whose dossiers these are");
    expect(alert).toHaveTextContent('auth service unavailable');
    expect(screen.queryByText('No self record yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No dossiers yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('tells a workspace with no self record apart from one with no dossiers', async () => {
    answers({ self: null }, () => ({ dossiers: [] }));
    const { unmount } = renderList();

    expect(await screen.findByText('No self record yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Profile settings' })).toBeInTheDocument();
    // There is nothing to make a dossier about, and the control says so by
    // being unavailable rather than by failing when it is pressed.
    expect(screen.getByRole('button', { name: 'New dossier' })).toBeDisabled();
    unmount();

    resetMockApi();
    answers(SELF, () => ({ dossiers: [] }));
    renderList();

    expect(await screen.findByText('No dossiers yet')).toBeInTheDocument();
    expect(screen.queryByText('No self record yet')).not.toBeInTheDocument();
  });

  it('reports a failed list instead of an empty one', async () => {
    answers(SELF, () => new Error('dossier service unavailable'));
    renderList();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your dossiers");
    expect(alert).toHaveTextContent('dossier service unavailable');
    expect(screen.queryByText('No dossiers yet')).not.toBeInTheDocument();
  });

  it('keeps a loading frame while the list is on its way', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderList();

    expect(screen.getByLabelText('Loading your dossiers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dossiers' })).toBeInTheDocument();
    expect(screen.queryByText('No dossiers yet')).not.toBeInTheDocument();
  });

  it('says the audiences could not be loaded rather than offering no choice', async () => {
    answers(SELF, (path) =>
      path.startsWith('/dossiers/audiences')
        ? new Error('grammar unavailable')
        : { dossiers: [] },
    );
    renderList();

    await screen.findByText('No dossiers yet');
    await userEvent.click(screen.getAllByRole('button', { name: 'New dossier' })[0]!);

    expect(await screen.findByText("Couldn't load the audiences")).toBeInTheDocument();
    expect(screen.getByText('grammar unavailable')).toBeInTheDocument();
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
