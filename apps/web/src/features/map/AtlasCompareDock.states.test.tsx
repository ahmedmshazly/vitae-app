/**
 * Comparing two places: where the comparison came from, and what it means when
 * half of it is empty. The trips half used to vanish rather than report itself.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { AtlasCompareDock } from './AtlasCompareDock.js';
import type { MapTrip } from './types.js';

const trip: MapTrip = {
  id: 't1',
  title: 'Nile winter',
  stops: [{ city: 'Cairo' }, { city: 'Aswan' }],
  companionIds: [],
};

function dock(over: Partial<Parameters<typeof AtlasCompareDock>[0]> = {}) {
  return renderWithApp(
    <AtlasCompareDock
      cityA="Cairo"
      cityB="Aswan"
      shared={[{ id: 'p1', title: 'Nadia Fahmy' }]}
      linkingTrips={[trip]}
      corridor={null}
      onClose={() => {}}
      onSelectTrip={() => {}}
      onOpenCorridor={() => {}}
      {...over}
    />,
  );
}

describe('AtlasCompareDock states', () => {
  it('says where the comparison came from before asserting it', () => {
    dock();
    expect(
      screen.getByText('Comparison assembled from trips and place records'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 shared person · 1 linking trip')).toBeInTheDocument();
  });

  it('reports an empty trips half instead of hiding it', () => {
    dock({ linkingTrips: [] });
    expect(
      screen.getByText('No recorded trip connects these two places.'),
    ).toBeInTheDocument();
  });

  it('names every route once, in the list, and nowhere unnamed', async () => {
    const user = userEvent.setup();
    const onSelectTrip = vi.fn();
    dock({ onSelectTrip });
    const trips = screen.getByRole('list', { name: 'Linking trips' });
    const show = within(trips).getByRole('button', { name: 'Show route · Nile winter' });
    await user.click(show);
    expect(onSelectTrip).toHaveBeenCalledWith(trip);
    expect(screen.queryByRole('button', { name: 'Show route' })).not.toBeInTheDocument();
  });

  it('gives the footer dismissal the same meaning as the close control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    dock({ onClose });
    await user.click(screen.getByRole('button', { name: 'Close comparison' }));
    expect(onClose).toHaveBeenCalled();
  });
});
