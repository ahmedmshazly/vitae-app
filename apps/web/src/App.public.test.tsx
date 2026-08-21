import './test/api-mock.js';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from './test/render.js';
import { App } from './App.js';

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('./lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: auth.useAuth,
}));

vi.mock('./routes/marketing/Landing.js', () => ({
  Landing: () => <h1>Public welcome</h1>,
}));

describe('public application routes', () => {
  it('renders the welcome story without waiting for an auth or API decision', async () => {
    renderWithApp(<App />, { route: '/welcome' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Public welcome' }),
    ).toBeInTheDocument();
    expect(auth.useAuth).not.toHaveBeenCalled();
  });
});
