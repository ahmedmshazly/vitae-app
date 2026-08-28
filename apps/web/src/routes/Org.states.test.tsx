/**
 * Organization dossier: the states the screen used to pass over in silence.
 * A refresh that failed while a cached dossier was on screen said nothing, and
 * the three record lists were runs of sibling links with no list semantics, so
 * the ranking that is the whole point of Inroads was a visual string.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Org } from './Org.js';

const org = {
  id: 'org-1',
  title: 'Nile Robotics',
  kind: 'company',
  domain: 'nile.example',
  city: 'Cairo',
  peopleCount: 3,
  affinity: 0.72,
  openRoles: 1,
  inroads: [
    {
      rank: 1,
      reason: 'worked together for two years',
      person: { id: 'p1', title: 'Ada Lovelace', headline: 'Robotics lead', strength: 0.81 },
    },
    {
      rank: 2,
      reason: 'met at a conference',
      person: { id: 'p2', title: 'Yara Fahmy', headline: null, strength: 0.4 },
    },
  ],
  roles: [
    { id: 'r1', title: 'Staff Engineer', open: true, holder: null },
    { id: 'r2', title: 'Design Lead', open: false, holder: 'Ada Lovelace' },
  ],
  relatedOrgs: [
    { id: 'o2', title: 'Delta Labs', kind: 'partner', direction: 'out', edgeId: 'e1', note: null },
    {
      id: 'o3',
      title: 'Cairo Holdings',
      kind: 'parent',
      direction: 'in',
      edgeId: 'e2',
      note: null,
    },
  ],
};

function renderOrg() {
  return renderWithApp(
    <Routes>
      <Route path="/network/organizations/:id" element={<Org />} />
    </Routes>,
    { route: '/network/organizations/org-1' },
  );
}

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ org });
});

describe('Org states', () => {
  it('reports a failed load instead of an organization with nothing in it', async () => {
    mockApi.get.mockRejectedValue(new Error('org service unavailable'));
    renderOrg();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this organization");
    expect(alert).toHaveTextContent('org service unavailable');
    expect(screen.queryByText('No inroads yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No linked roles')).not.toBeInTheDocument();
  });

  it('keeps the loading frame the shape of the dossier that arrives', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderOrg();

    expect(screen.getByLabelText('Loading organization dossier')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organization' })).toBeInTheDocument();
  });

  it('names the three record lists so each one can be counted and skipped', async () => {
    renderOrg();
    await screen.findByRole('heading', { name: 'Nile Robotics' });

    const related = screen.getByRole('list', { name: 'Related organizations' });
    expect(within(related).getAllByRole('listitem')).toHaveLength(2);
    const roles = screen.getByRole('list', { name: 'Roles' });
    expect(within(roles).getAllByRole('listitem')).toHaveLength(2);
  });

  it('states each inroad rank in text, not only as a drawn marker', async () => {
    renderOrg();
    await screen.findByRole('heading', { name: 'Nile Robotics' });

    const inroads = screen.getByRole('list', { name: 'Inroads, strongest first' });
    expect(inroads.tagName).toBe('OL');
    const items = within(inroads).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[0]!).getByRole('link', { name: /Ada Lovelace\s*, rank 1 of 2/ }),
    ).toBeVisible();
    expect(
      within(items[1]!).getByRole('link', { name: /Yara Fahmy\s*, rank 2 of 2/ }),
    ).toBeVisible();
  });

  it('gives each related organization a chip that says something the row has not', async () => {
    renderOrg();
    await screen.findByRole('heading', { name: 'Nile Robotics' });

    const related = screen.getByRole('list', { name: 'Related organizations' });
    const rows = within(related).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('outbound');
    expect(rows[1]).toHaveTextContent('inbound');
    // The subtitle keeps the kind, so the chip is no longer a second copy of it.
    expect(rows[1]).toHaveTextContent(/of this org/);
  });
});
