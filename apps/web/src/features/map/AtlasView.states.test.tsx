/**
 * Shared Atlas links are durable only when removed evidence has a recovery
 * path. These cases intentionally start with stale URL selections, rather
 * than clicking the current map, because that is how a person encounters the
 * failure after an archive or a filtered import.
 */
import { forwardRef } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@vitae/ui';
import { renderWithApp } from '../../test/render.js';
import { AtlasView } from './AtlasView.js';
import type { MapData } from './types.js';

const get = vi.fn();

vi.mock('../../lib/api.js', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock('./AtlasCanvas.js', () => ({
  AtlasCanvas: forwardRef(function AtlasCanvas(_, _ref) {
    return <div data-testid="atlas-canvas" />;
  }),
}));

const data: MapData = {
  cities: [
    {
      city: 'Cairo',
      count: 1,
      types: { person: 1 },
      records: [{ id: 'p1', type: 'person', title: 'Nadia Fahmy', link: 'LOCATED_IN' }],
      lat: 30.0444,
      lng: 31.2357,
    },
  ],
  trips: [],
};

describe('AtlasView stale shared links', () => {
  it('removes a missing trip selection and explains the recovery', async () => {
    get.mockResolvedValue(data);
    const view = renderWithApp(<AtlasView />, {
      route: '/explore/atlas?trip=archived-trip',
      wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
    });

    expect(await screen.findByText('That trip is no longer available. The map link was updated.')).toBeInTheDocument();
    await waitFor(() => expect(view.queryClient.getQueryData(['map', null, null])).toEqual(data));
  });

  it('removes a missing place selection and explains the recovery', async () => {
    get.mockResolvedValue(data);
    renderWithApp(<AtlasView />, {
      route: '/explore/atlas?city=Archived%20place',
      wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
    });

    expect(await screen.findByText('That place is no longer available. The map link was updated.')).toBeInTheDocument();
  });
});
