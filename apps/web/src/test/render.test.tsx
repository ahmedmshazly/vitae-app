import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestAuth, renderWithApp } from './render.js';

describe('renderWithApp', () => {
  it('renders the tree inside a router, query client, and toast provider', () => {
    renderWithApp(<h1>Harness</h1>, { route: '/settings' });
    expect(screen.getByRole('heading', { name: 'Harness' })).toBeInTheDocument();
  });

  it('builds a default owner auth stub for suites that mock useAuth', () => {
    const auth = createTestAuth({ googleEnabled: false });
    expect(auth.user?.email).toBe('owner@example.com');
    expect(auth.googleEnabled).toBe(false);
    expect(auth.devLoginEnabled).toBe(true);
  });
});
