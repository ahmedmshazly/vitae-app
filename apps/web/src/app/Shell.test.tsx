/**
 * Shell chrome smoke: primary nav Today link and Capture control.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Shell } from './Shell.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
}));

beforeEach(() => {
  resetMockApi();
  localStorage.clear();
  // Suppress first-run modal so chrome controls stay unobscured.
  localStorage.setItem('vitae.v1.welcomed', '1');
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/status')) return { checks: { database: { ok: true } } };
    if (path.startsWith('/reminders')) return { reminders: [] };
    if (path.startsWith('/views')) return { views: [] };
    return {};
  });
});

describe('Shell', () => {
  it('renders Today in the primary nav and a Capture control', async () => {
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    // Rail + mobile dock both use aria-label="Primary".
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Today/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Quick capture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reminders' })).toBeInTheDocument();
  });

  it('keeps a live region mounted before there is anything to announce', async () => {
    const { container } = renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    // Persistent, not created with its text. A live region inserted at the same
    // moment as its content is routinely missed by screen readers, which is
    // what made navigation silent here.
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live).not.toBeNull();
  });

  it('announces the page a navigation landed on, using the name the breadcrumb shows', async () => {
    const { container } = renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/people' },
    );
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live?.textContent).toBe('People');
  });

  it('keeps the browser title aligned with the current screen', async () => {
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/career/applications/application-1' },
    );

    await waitFor(() => expect(document.title).toBe('Career / Applications, Dossier · Vitae'));
  });

  it('gives the content region a focus target for a route change to move to', async () => {
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    // tabIndex -1 is what makes the region focusable by script without adding a
    // tab stop. It was already set and nothing ever focused it.
    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
