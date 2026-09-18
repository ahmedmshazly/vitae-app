/**
 * A warm-path URL is shared state. If its organization has been archived, the
 * fallback target and rewritten address must be stated rather than silently
 * turning a link for one company into a path for another.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Intros } from './Intros.js';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="warm-path-location">{location.search}</output>;
}

beforeEach(() => {
  resetMockApi();
});

describe('Warm paths URL recovery', () => {
  it('states and canonicalizes a missing target instead of silently showing another organization', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path === '/intros/targets') {
        return {
          targets: [
            {
              id: 'org-nile',
              title: 'Nile Robotics',
              kind: 'company',
              city: 'Cairo',
              stage: null,
              reach: 'warm',
              reachable: true,
              affinity: 0.7,
              peopleCount: 1,
              openRoles: 2,
            },
          ],
        };
      }
      if (path === '/intros/paths?orgId=org-nile') return { paths: [] };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderWithApp(
      <>
        <Intros />
        <LocationProbe />
      </>,
      { route: '/network/intelligence?lens=reach&org=archived-org' },
    );

    const recovery = await screen.findByText('That organization is no longer available');
    expect(recovery.closest('[role="status"]')).toHaveTextContent('Showing Nile Robotics instead');
    await waitFor(() =>
      expect(screen.getByTestId('warm-path-location')).toHaveTextContent(
        '?lens=reach&org=org-nile',
      ),
    );
    expect(screen.getByRole('heading', { name: /^Routes to Nile Robotics/ })).toBeInTheDocument();
  });
});
