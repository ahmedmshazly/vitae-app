import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../test/a11y.js';
import { renderWithApp } from '../../test/render.js';
import { NetworkHome } from './WorkspaceHomes.js';

describe('Workspace home semantics', () => {
  it('keeps every indexed destination a native link inside a semantic list', async () => {
    const { container } = renderWithApp(<NetworkHome />, { route: '/network' });
    const destinations = screen.getByRole('list', { name: 'Network destinations' });

    expect(within(destinations).getAllByRole('listitem')).toHaveLength(4);
    expect(within(destinations).getByRole('link', { name: /Correspondence/ })).toHaveAttribute(
      'href',
      '/network/correspondence',
    );
    expect(within(destinations).getByRole('link', { name: /People/ })).toHaveAttribute(
      'href',
      '/network/people',
    );
    expect(within(destinations).getByRole('link', { name: /Organizations/ })).toHaveAttribute(
      'href',
      '/network/organizations',
    );
    expect(within(destinations).getByRole('link', { name: /Find a warm path/ })).toHaveAttribute(
      'href',
      '/network/intelligence?lens=reach',
    );

    expect(await runAxe(container)).toHaveNoViolations();
  });
});
