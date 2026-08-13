import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '../test/render.js';
import { NotFound } from './NotFound.js';

describe('NotFound', () => {
  it('says the address did not match rather than showing a working page', () => {
    renderWithApp(<NotFound />, { route: '/people/this-record-is-gone-x9' });
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.getByText('No page at this address')).toBeInTheDocument();
  });

  it('shows the address that failed, which is the one thing the user cannot see elsewhere', () => {
    renderWithApp(<NotFound />, { route: '/resume/tailorr' });
    expect(screen.getByText('/resume/tailorr')).toBeInTheDocument();
  });

  it('offers a way out', () => {
    renderWithApp(<NotFound />, { route: '/nope' });
    expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '/');
  });
});
