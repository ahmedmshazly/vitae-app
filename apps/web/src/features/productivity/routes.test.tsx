/**
 * Route ownership, flag gating, command uniqueness, auth, and no-fetch when off.
 */
import '../../test/api-mock.js';
import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNCHANGED_TODAY_ROUTES, PRODUCTIVITY_ROUTES } from '@vitae/core';
import { App } from '../../App.js';
import { buildCommands } from '../../app/commands.js';
import { ROUTES, WORKSPACE_NAV, hubForPath, visibleWorkspaceNav } from '../../app/routes.js';
import { Shell } from '../../app/Shell.js';
import { createTestAuth, renderWithApp } from '../../test/render.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { ProductivityPage } from './ProductivityStub.js';

const flag = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../lib/productivity-flag.js', () => ({
  isProductivityEnabled: () => flag.enabled,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

const auth = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../../lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => auth.useAuth(),
  hasSessionHint: () => false,
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

vi.mock('../../routes/marketing/Landing.js', () => ({
  Landing: () => <h1>Public welcome</h1>,
}));

function signedIn() {
  auth.useAuth.mockReturnValue(createTestAuth());
}

function signedOut() {
  auth.useAuth.mockReturnValue(
    createTestAuth({
      user: null,
      workspace: null,
      cloudEnabled: false,
    }),
  );
}

function stubShellApis() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/status')) return { checks: { database: { ok: true } } };
    if (path.startsWith('/reminders')) return { reminders: [] };
    if (path.startsWith('/views')) return { views: [] };
    if (path.startsWith('/productivity/tasks')) return { tasks: [] };
    if (path.startsWith('/productivity/waiting')) return { tasks: [] };
    if (path.startsWith('/productivity/rules')) return { rules: [] };
    if (path.startsWith('/productivity/templates')) return { templates: [] };
    if (path.startsWith('/productivity/time-entries')) return { time_entries: [] };
    if (path.startsWith('/nodes')) return { nodes: [], edges: [], neighbors: {} };
    return {};
  });
}

function productivityApiCalls(): unknown[][] {
  return [...mockApi.get.mock.calls, ...mockApi.post.mock.calls].filter((call) =>
    String(call[0]).includes('/productivity'),
  );
}

beforeEach(() => {
  flag.enabled = false;
  signedIn();
  resetMockApi();
  localStorage.clear();
  localStorage.setItem('vitae.v1.welcomed', '1');
  stubShellApis();
});

describe('productivity route registry', () => {
  it('owns the six paths and leaves Today, Planner, and Ledger as the same strings', () => {
    expect(ROUTES.tasks.path).toBe('/today/tasks');
    expect(ROUTES.waiting.path).toBe('/today/waiting');
    expect(ROUTES.review.path).toBe('/today/review');
    expect(ROUTES.analytics.path).toBe('/today/analytics');
    expect(ROUTES.automation.path).toBe('/today/automation');
    expect(ROUTES.taskTemplates.path).toBe('/today/task-templates');
    expect(ROUTES.tasks.label).toBe('Tasks');
    expect(ROUTES.waiting.label).toBe('Waiting');
    expect(ROUTES.review.label).toBe('Review');
    expect(ROUTES.analytics.label).toBe('Analytics');
    expect(ROUTES.automation.label).toBe('Automation');
    expect(ROUTES.taskTemplates.label).toBe('Task templates');

    expect(ROUTES.today.path).toBe('/today');
    expect(ROUTES.planner.path).toBe('/today/planner');
    expect(ROUTES.ledger.path).toBe('/today/ledger');
    expect([...UNCHANGED_TODAY_ROUTES]).toEqual([
      ROUTES.today.path,
      ROUTES.planner.path,
      ROUTES.ledger.path,
    ]);
    expect([...PRODUCTIVITY_ROUTES]).toEqual([
      ROUTES.tasks.path,
      ROUTES.waiting.path,
      ROUTES.review.path,
      ROUTES.analytics.path,
      ROUTES.automation.path,
      ROUTES.taskTemplates.path,
    ]);

    expect(WORKSPACE_NAV.today).toEqual([ROUTES.today, ROUTES.planner, ROUTES.ledger]);
    expect(hubForPath('/today/tasks')).toBe('today');
    expect(hubForPath('/today/task-templates')).toBe('today');
  });

  it('keeps legacy compatibility URLs on their hubs', () => {
    expect(hubForPath('/people')).toBe('network');
    expect(hubForPath('/orgs')).toBe('network');
    expect(hubForPath('/resume/tailor')).toBe('career');
    expect(hubForPath('/collections')).toBe('explore');
    expect(hubForPath('/import')).toBe('data');
    expect(hubForPath('/today/planner')).toBe('today');
    expect(hubForPath('/today/ledger')).toBe('today');
  });

  it('omits the six destinations from the Today strip when the flag is off', () => {
    expect(visibleWorkspaceNav('today', { productivityEnabled: false }).map((r) => r.path)).toEqual([
      '/today',
      '/today/planner',
      '/today/ledger',
    ]);
    expect(
      visibleWorkspaceNav('today', { productivityEnabled: true }).map((r) => r.path),
    ).toEqual([
      '/today',
      '/today/planner',
      '/today/ledger',
      '/today/tasks',
      '/today/waiting',
      '/today/review',
      '/today/analytics',
      '/today/automation',
      '/today/task-templates',
    ]);
  });
});

describe('productivity commands', () => {
  const deps = {
    navigate: vi.fn(),
    openCapture: vi.fn(),
    openNew: vi.fn(),
  };

  it('keeps command ids unique with the six new actions present', () => {
    const cmds = buildCommands({ ...deps, productivityEnabled: true });
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'open-tasks',
        'open-waiting',
        'open-review',
        'open-analytics',
        'open-automation',
        'open-task-templates',
        'capture',
        'today',
        'planner',
        'ledger',
      ]),
    );
    expect(ids.filter((id) => id === 'capture')).toHaveLength(1);
  });

  it('omits the new commands when the flag is off', () => {
    const cmds = buildCommands({ ...deps, productivityEnabled: false });
    const ids = cmds.map((c) => c.id);
    expect(ids).not.toContain('open-tasks');
    expect(ids).not.toContain('open-waiting');
    expect(ids).not.toContain('open-review');
    expect(ids).not.toContain('open-analytics');
    expect(ids).not.toContain('open-automation');
    expect(ids).not.toContain('open-task-templates');
    expect(ids).toContain('capture');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('productivity flag off', () => {
  it('renders a not-available page and does not fetch /productivity', async () => {
    flag.enabled = false;
    renderWithApp(<ProductivityPage />, { route: '/today/tasks' });

    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(productivityApiCalls()).toEqual([]);
  });

  it('keeps Tasks out of the Today strip and still does not fetch /productivity', async () => {
    flag.enabled = false;
    renderWithApp(
      <Shell>
        <ProductivityPage />
      </Shell>,
      { route: '/today/tasks' },
    );

    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    const strip = screen.getByRole('navigation', { name: 'Today workspace' });
    expect(strip).not.toHaveTextContent('Tasks');
    expect(strip).toHaveTextContent('Planner');
    expect(strip).toHaveTextContent('Ledger');
    expect(productivityApiCalls()).toEqual([]);
  });
});

describe('productivity flag on', () => {
  it('renders the tasks screen inside the shell on /today/tasks', async () => {
    flag.enabled = true;
    renderWithApp(<App />, { route: '/today/tasks' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Capture a task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick capture' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Today workspace' })).toHaveTextContent('Tasks');
    await waitFor(() => expect(productivityApiCalls().length).toBeGreaterThan(0));
  });
});

describe('productivity auth gating', () => {
  it('redirects an unauthenticated visit the same way as /today', async () => {
    signedOut();
    const tasks = renderWithApp(<App />, { route: '/today/tasks' });
    expect(await screen.findByRole('heading', { name: 'Public welcome' })).toBeInTheDocument();
    tasks.unmount();

    renderWithApp(<App />, { route: '/today' });
    expect(await screen.findByRole('heading', { name: 'Public welcome' })).toBeInTheDocument();
  });
});
