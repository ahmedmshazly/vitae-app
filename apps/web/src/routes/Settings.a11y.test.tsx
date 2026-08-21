/**
 * Accessibility contracts for Settings: it carries the app's only sliders, its
 * only colour-swatch picker, and three definition lists of stated facts.
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { runAxe } from '../test/a11y.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Settings } from './Settings.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
}));

const SETTINGS = {
  profile: { name: 'Ada', headline: 'Engineer', email: 'ada@example.test', links: [] },
  askWeights: { affiliation: 2, topic: 1.6, pinned: 0.3 },
  skillAliases: [{ alias: 'k8s', canonical: 'Kubernetes' }],
  resumeDefaults: { templateKey: 'cobalt', accent: '#2563eb', emphasis: 'technical' },
  github: { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' },
};

const STATUS = {
  ok: false,
  checks: { database: { ok: true, detail: '3ms' }, buildsvc: { ok: false, detail: 'refused' } },
  counts: { nodes: 10, edges: 20 },
  env: { node: 'v22', emulators: true, devLogin: true },
};

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockImplementation(async (path: string) =>
    path.startsWith('/status') ? STATUS : SETTINGS,
  );
});

describe('Settings a11y', () => {
  it('has no serious axe violations with every editor on screen', async () => {
    const { container } = renderWithApp(<Settings />, { route: '/settings' });
    await screen.findByRole('region', { name: /Ranking constants/ });
    const results = await runAxe(container);
    expect(results).toHaveNoViolations();
  });

  it('keeps the failed load reachable as an alert', async () => {
    mockApi.get.mockRejectedValue(new Error('offline'));
    const { container } = renderWithApp(<Settings />, { route: '/settings' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results).toHaveNoViolations();
  });
});
