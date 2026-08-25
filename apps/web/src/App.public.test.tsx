import './test/api-mock.js';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from './test/render.js';
import { App, publicAuthDoorDestination } from './App.js';

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('./lib/auth.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: auth.useAuth,
  // The public home renders for a visitor with no remembered session; the
  // returning-session redirect is asserted end to end in shell.spec.ts.
  hasSessionHint: () => false,
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

vi.mock('./routes/marketing/Landing.js', () => ({
  Landing: () => <h1>Public welcome</h1>,
}));

describe('public application routes', () => {
  it('carries an explicit valid plan choice from signup to billing', () => {
    expect(publicAuthDoorDestination('/signup', '?period=monthly', true)).toBe(
      '/settings/billing?period=monthly',
    );
    expect(publicAuthDoorDestination('/signup', '?period=unexpected', true)).toBe(
      '/settings/billing',
    );
    expect(publicAuthDoorDestination('/signup', '?period=monthly', false)).toBe('/today');
  });

  it('renders the public home without waiting for an auth or API decision', async () => {
    renderWithApp(<App />, { route: '/' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Public welcome' }),
    ).toBeInTheDocument();
    expect(auth.useAuth).not.toHaveBeenCalled();
  });

  it('keeps the legacy welcome address as a client redirect to public home', async () => {
    renderWithApp(<App />, { route: '/welcome' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Public welcome' }),
    ).toBeInTheDocument();
    expect(auth.useAuth).not.toHaveBeenCalled();
  });
});
