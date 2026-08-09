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
});
