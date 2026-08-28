/**
 * The place and route dossiers: sets of records announced as sets, and
 * navigation that stays inside the app instead of reloading the document.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { AtlasDossier } from './AtlasDossier.js';
import type { MapCity, MapTrip } from './types.js';

const city: MapCity = {
  city: 'Cairo',
  count: 2,
  types: { person: 1, event: 1 },
  records: [
    { id: 'p1', type: 'person', title: 'Nadia Fahmy', link: 'LOCATED_IN' },
    { id: 'e1', type: 'event', title: 'DevFest Cairo', date: '2025-11-02', link: 'city' },
  ],
};

const trip: MapTrip = {
  id: 't1',
  title: 'Nile winter',
  stops: [{ city: 'Cairo', nights: 3, date: '2025-12-01' }],
  companionIds: ['p1'],
  start: '2025-12-01',
  end: '2025-12-09',
};

function dossier(over: Partial<Parameters<typeof AtlasDossier>[0]> = {}) {
  return renderWithApp(
    <AtlasDossier
      city={city}
      trip={null}
      tripsHere={[trip]}
      companionTitles={new Map([['p1', 'Nadia Fahmy']])}
      onClose={() => {}}
      onSelectTrip={() => {}}
      onCopyLink={() => {}}
      {...over}
    />,
  );
}

describe('AtlasDossier states', () => {
  it('announces the records at a place as a set, not loose links', () => {
    dossier();
    const list = screen.getByRole('list', { name: 'Records at Cairo' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByRole('link', { name: /Nadia Fahmy/ })).toBeInTheDocument();
  });

  it('names each trip through a place by the route it will draw', () => {
    dossier();
    expect(screen.getByRole('button', { name: 'Show route · Nile winter' })).toBeInTheDocument();
  });

  it('keeps the two cross-instrument moves as links', () => {
    dossier();
    expect(screen.getByRole('link', { name: 'Life map' })).toHaveAttribute(
      'href',
      expect.stringContaining('/explore/graph'),
    );
    expect(screen.getByRole('link', { name: 'Chronograph' })).toHaveAttribute(
      'href',
      expect.stringContaining('/explore/timeline'),
    );
  });

  it('opens a trip through the router rather than reloading the document', () => {
    dossier({ trip });
    const open = screen.getByRole('link', { name: 'Open trip' });
    expect(open.getAttribute('href')).toMatch(/^\//);
  });

  it("announces a route's companions as a set", () => {
    dossier({ trip });
    const companions = screen.getByRole('list', { name: 'Companions' });
    expect(within(companions).getAllByRole('listitem')).toHaveLength(1);
    expect(within(companions).getByRole('link', { name: 'Nadia Fahmy' })).toBeInTheDocument();
  });
});
