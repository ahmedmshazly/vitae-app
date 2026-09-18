/**
 * Shell chrome smoke: primary nav Today link and Capture control.
 */
import './../test/api-mock.js';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('labels the all-reminders badge as open, not due today', async () => {
    mockApi.get.mockImplementation(async (path: string) => path.startsWith('/reminders')
      ? { reminders: [{ id: 'future', note: 'Next month', due_on: '2030-12-01' }] }
      : { checks: { database: { ok: true } } });
    renderWithApp(<Shell><div>main</div></Shell>);
    expect(await screen.findByRole('button', { name: 'Reminders, 1 open' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /1 due/ })).not.toBeInTheDocument();
  });
  it('does not claim typing or already handled keys for the new-record shortcut', async () => {
    renderWithApp(
      <Shell>
        <select aria-label="Task state"><option>New</option><option>Done</option></select>
        <button type="button" onKeyDown={(event) => event.preventDefault()}>Local shortcut</button>
      </Shell>,
      { route: '/today' },
    );
    const nativeKey = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
    screen.getByLabelText('Task state').dispatchEvent(nativeKey);
    expect(nativeKey.defaultPrevented).toBe(false);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Local shortcut' }), { key: 'n' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
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

  it('offers system and three explicit appearance modes and identifies the current choice', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );

    await user.click(screen.getByRole('button', { name: 'Appearance: System' }));

    const menu = screen.getByRole('menu', { name: 'Appearance' });
    expect(within(menu).getByRole('menuitemradio', { name: /^system/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(menu).getByRole('menuitemradio', { name: /high contrast/i })).toBeInTheDocument();
  });

  it('changes appearance with the keyboard and persists the explicit choice', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );

    await user.click(screen.getByRole('button', { name: 'Appearance: System' }));
    const dark = screen.getByRole('menuitemradio', { name: /dark/i });
    act(() => dark.focus());
    await user.keyboard('{Enter}');

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    expect(localStorage.getItem('vitae.theme')).toBe('dark');
  });

  it('supports roving appearance-menu navigation without relying on a pointer', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/' },
    );

    await user.click(screen.getByRole('button', { name: 'Appearance: System' }));
    act(() => screen.getByRole('menuitemradio', { name: /^light/i }).focus());
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: /high contrast/i })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitemradio', { name: /^system/i })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /^light/i })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveFocus();
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
    expect(main).toHaveRole('main');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('puts the skip link before shell controls and points it at the main landmark', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('moves focus and announces the destination after primary navigation', async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    await user.click(screen.getAllByRole('link', { name: 'Network' })[0]!);

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Network');
    expect(document.title).toBe('Network · Vitae');
  });

  it('opens the mobile More sheet as a named dialog and restores focus on Escape', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    const more = screen.getByRole('button', { name: 'More destinations' });
    await user.click(more);

    const sheet = await screen.findByRole('dialog', { name: 'Vitae workspaces' });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByRole('link', { name: /Data/ })).toHaveAttribute('href', '/data');
    expect(within(sheet).getByRole('link', { name: /Help/ })).toHaveAttribute('href', '/help');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Vitae workspaces' })).toBeNull(),
    );
    await waitFor(() => expect(more).toHaveFocus());
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('lets a More-sheet destination keep the route focus handoff', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Shell>
        <div>main</div>
      </Shell>,
      { route: '/today' },
    );

    await user.click(screen.getByRole('button', { name: 'More destinations' }));
    await user.click(
      (await screen.findByRole('dialog', { name: 'Vitae workspaces' })).querySelector(
        'a[href="/data"]',
      )!,
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Vitae workspaces' })).toBeNull(),
    );
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
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
