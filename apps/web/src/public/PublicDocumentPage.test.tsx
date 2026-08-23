import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { PublicDocumentPage, PublicGuidePage } from './PublicDocumentPage.js';

vi.mock('../routes/marketing/Chrome.js', () => ({
  MarketingShell: ({ children }: { children: ReactNode }) => (
    <>
      <header>Vitae navigation</header>
      <main>{children}</main>
      <footer>Vitae footer</footer>
    </>
  ),
}));

describe('public document pages', () => {
  it('renders a guide from the shared marketing editorial registry', () => {
    renderWithApp(
      <Routes>
        <Route path="/guides/:slug" element={<PublicGuidePage />} />
      </Routes>,
      { route: '/guides/first-career-record' },
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Build the first useful career record',
    );
    expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(2);
  });

  it('states that Cloud legal documents are not live before launch', () => {
    renderWithApp(<PublicDocumentPage />, { route: '/legal/terms' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Terms are not published for an unopened service',
    );
    expect(screen.getByText('Cloud is not open yet')).toBeInTheDocument();
  });

  it('shows a real public missing page for an unknown guide', () => {
    renderWithApp(
      <Routes>
        <Route path="/guides/:slug" element={<PublicGuidePage />} />
      </Routes>,
      { route: '/guides/not-a-guide' },
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'That public page is not available.',
    );
    expect(screen.getByRole('link', { name: 'Go to Vitae home' })).toHaveAttribute('href', '/');
  });
});
