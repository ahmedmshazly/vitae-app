/**
 * Shell chrome smoke: primary nav Today link and Capture control.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Shell } from './Shell.js';

let auth = createTestAuth();
vi.mock('../lib/auth.js', () => ({
  useAuth: () => auth,
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

beforeEach(() => {
  auth = createTestAuth();
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

    // "Application", not "Dossier". An evidence dossier is a different object
    // with its own screens now, and one crumb answering for both is a way to be
    // lost while the breadcrumb reads correctly.
    await waitFor(() => expect(document.title).toBe('Career / Applications, Application · Vitae'));
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

/**
 * A read-only workspace refuses every write with 402 PAYMENT_REQUIRED
 * (apps/api/src/middleware/workspace.ts entitlementGate), and until now nothing
 * in the browser said so: `useAuth().workspace.accessState` was carried on the
 * context and rendered nowhere, so every write control stayed enabled and the
 * only feedback was whatever toast the failing mutation happened to raise.
 */
describe('Shell, when the workspace is read-only', () => {
  const readOnly = {
    id: 'workspace-legacy-real',
    role: 'owner' as const,
    accessState: 'read_only' as const,
    trialEndsAt: null,
    graceEndsAt: null,
    deletionScheduledAt: null,
  };

  it('names the state, and says what can still be done', async () => {
    auth = createTestAuth({ cloudEnabled: true, workspace: readOnly });
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    const banner = await screen.findByRole('status', { name: /workspace access/i });
    expect(banner).toHaveTextContent(/read-only/i);
    expect(within(banner).getByRole('link', { name: /billing/i })).toHaveAttribute(
      'href',
      '/settings/billing',
    );
    expect(within(banner).getByRole('link', { name: /export/i })).toHaveAttribute(
      'href',
      '/data/exports',
    );
  });

  it('names a scheduled deletion differently from a plain lock', async () => {
    auth = createTestAuth({
      cloudEnabled: true,
      workspace: { ...readOnly, accessState: 'deletion_pending' },
    });
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    const banner = await screen.findByRole('status', { name: /workspace access/i });
    expect(banner).toHaveTextContent(/scheduled for deletion/i);
  });

  it('says nothing at all when the workspace is active', async () => {
    auth = createTestAuth({
      cloudEnabled: true,
      workspace: { ...readOnly, accessState: 'active' },
    });
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: /workspace access/i })).toBeNull();
  });
});
