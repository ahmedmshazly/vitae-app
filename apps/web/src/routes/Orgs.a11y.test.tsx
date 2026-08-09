/**
 * Accessibility contracts for the Organizations directory empty and error states.
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { runAxe } from '../test/a11y.js';
import { renderWithApp } from '../test/render.js';
import { Orgs } from './Orgs.js';

beforeEach(() => {
  resetMockApi();
});

describe('Organizations a11y', () => {
  it('has no serious axe violations in the empty state', async () => {
    mockApi.get.mockResolvedValue({ orgs: [] });
    const { container } = renderWithApp(<Orgs />, { route: '/orgs' });
    await screen.findByText('No organizations yet');
    const results = await runAxe(container);
    expect(results).toHaveNoViolations();
  });

  it('exposes the error state as an alert with a retry control', async () => {
    mockApi.get.mockRejectedValue(new Error('offline'));
    const { container } = renderWithApp(<Orgs />, { route: '/orgs' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results).toHaveNoViolations();
  });
});
