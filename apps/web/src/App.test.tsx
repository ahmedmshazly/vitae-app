import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

vi.mock('./routes/reference/EntityCatalog.js', () => ({
  default: () => <h1>Public entity explorer</h1>,
}));

describe('public reference routing', () => {
  it('renders /reference/entities without reading the auth context', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/reference/entities']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Public entity explorer' })).toBeInTheDocument();
  });
});
