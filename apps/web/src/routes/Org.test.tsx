import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { contactLensHrefForOrg, reachLensHrefForOrg } from './Org.js';
import { Org } from './Org.js';

const organization = {
  id: 'org-1',
  title: 'Nile Robotics',
  kind: 'company',
  domain: 'nile.example',
  city: 'Cairo',
  peopleCount: 3,
  affinity: 0.72,
  openRoles: 1,
  inroads: [],
  roles: [],
  relatedOrgs: [],
};

function renderOrg() {
  return renderWithApp(
    <Routes>
      <Route path="/network/organizations/:id" element={<Org />} />
      <Route path="/data/trash" element={<div>Trash</div>} />
    </Routes>,
    { route: '/network/organizations/org-1' },
  );
}

describe('organization dossier intelligence links', () => {
  it('opens the canonical contact lens with an explicit organization ask', () => {
    const url = new URL(contactLensHrefForOrg('Nile Robotics'), 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('contact');
    expect(url.searchParams.get('need')).toBe('intro');
    expect(url.searchParams.get('org')).toBe('Nile Robotics');
    expect(url.searchParams.get('run')).toBe('1');
  });

  it('opens the canonical reach lens with the organization id', () => {
    const url = new URL(reachLensHrefForOrg('org-1'), 'https://vitae.local');
    expect(url.pathname).toBe('/network/intelligence');
    expect(url.searchParams.get('lens')).toBe('reach');
    expect(url.searchParams.get('org')).toBe('org-1');
  });
});

describe('organization dossier screen', () => {
  it('shows relationship facts and canonical next-decision links', async () => {
    resetMockApi();
    mockApi.get.mockResolvedValue({ org: organization });
    renderOrg();

    expect(await screen.findByRole('heading', { name: 'Nile Robotics' })).toBeInTheDocument();
    expect(screen.getByText('Affinity')).toBeInTheDocument();
    expect(screen.getByText('0.72')).toBeInTheDocument();

    const contacts = screen.getByRole('link', { name: 'Rank contacts' });
    const paths = screen.getByRole('link', { name: 'Trace warm paths' });
    expect(contacts).toHaveAttribute('href', contactLensHrefForOrg('Nile Robotics'));
    expect(paths).toHaveAttribute('href', reachLensHrefForOrg('org-1'));
  });

  it('keeps the delete dialog open and reports progress until deletion settles', async () => {
    resetMockApi();
    mockApi.get.mockResolvedValue({ org: organization });
    let finish!: () => void;
    mockApi.delete.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderOrg();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(screen.getByRole('button', { name: 'Moving...' })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
