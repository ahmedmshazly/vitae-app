/**
 * Breadcrumb leaf/parent copy for exact routes and record detail.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { Breadcrumb } from './Breadcrumb.js';

describe('Breadcrumb', () => {
  it('shows Today on the home route', () => {
    renderWithApp(<Breadcrumb />, { route: '/' });
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('uses Ask parent and Who should I call leaf', () => {
    renderWithApp(<Breadcrumb />, { route: '/ask/people' });
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Who should I call')).toBeInTheDocument();
  });

  it('maps record detail under Collections', () => {
    renderWithApp(<Breadcrumb />, { route: '/n/abc-123' });
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });
});
