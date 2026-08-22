/**
 * The 404, in the states it is actually reached in.
 *
 * Before this screen existed, a dead URL rendered the Dashboard, so the two
 * things a person needs (which address failed, and where they can go instead)
 * were the two things the page did not say.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { HUBS } from '../app/routes.js';
import { NotFound } from './NotFound.js';

describe('NotFound states', () => {
  it('announces the dead address through the same status grammar as everything else', () => {
    renderWithApp(<NotFound />, { route: '/resume/tailorr' });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Requested address did not resolve');
    expect(status).toHaveTextContent('/resume/tailorr');
  });

  it('offers every workspace as a real route, not one button home', () => {
    renderWithApp(<NotFound />, { route: '/wombat' });

    const index = screen.getByRole('region', { name: /^Every workspace/ });
    expect(within(index).getAllByRole('link')).toHaveLength(HUBS.length);
    for (const hub of HUBS) {
      expect(within(index).getByRole('link', { name: new RegExp(hub.label) })).toHaveAttribute(
        'href',
        hub.path,
      );
    }
  });

  it('names the closest workspace in words when the address still looks like one', () => {
    renderWithApp(<NotFound />, { route: '/resume/tailorr' });

    const likely = screen.getByText('closest match to that address');
    // The guess is a word and a position, so it survives being read as text.
    expect(within(likely.closest('li')!).getByRole('link', { name: /Career/ })).toBeInTheDocument();
  });

  it('guesses nothing for an address that belonged nowhere', () => {
    renderWithApp(<NotFound />, { route: '/wombat' });

    expect(screen.queryByText('closest match to that address')).not.toBeInTheDocument();
  });

  it('makes the way out a link rather than a control nested inside one', () => {
    renderWithApp(<NotFound />, { route: '/wombat' });

    const out = screen.getByRole('link', { name: 'Go to Today' });
    expect(out).toHaveAttribute('href', '/');
    expect(within(out).queryByRole('button')).not.toBeInTheDocument();
  });
});
