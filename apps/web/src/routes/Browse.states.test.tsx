/**
 * Browse: the states the three whole-page early returns used to swallow.
 *
 * Loading and failure each rebuilt the page from scratch without the header's
 * `actions` slot, so the New button vanished for the whole wait and stayed
 * gone after a failure that had nothing to do with creating a record.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Browse } from './Browse.js';

function renderBrowse(type = 'skill') {
  return renderWithApp(
    <Routes>
      <Route path="/browse/:type" element={<Browse />} />
    </Routes>,
    { route: `/browse/${type}` },
  );
}

const record = {
  id: 'n1',
  type: 'skill',
  title: 'Rust',
  subtitle: 'Systems',
  source: 'manual',
  confidence: 1,
  pinned: true,
  updated_at: '2026-08-01T00:00:00.000Z',
};
const plain = { ...record, id: 'n2', title: 'Go', subtitle: 'Services', pinned: false };

beforeEach(() => {
  resetMockApi();
});

describe('Browse states', () => {
  it('keeps the create action reachable while the records are still coming', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderBrowse();

    expect(screen.getByLabelText('Loading skill records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New skill' })).toBeInTheDocument();
  });

  it('says nothing about the record count until it has one', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderBrowse();

    // The subtitle used to read "Loading...", which is a count slot reporting a
    // state the skeleton underneath it was already reporting.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('reports a failed list without taking the create action away with it', async () => {
    mockApi.get.mockRejectedValue(new Error('node store unreachable'));
    renderBrowse();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load skill records");
    expect(alert).toHaveTextContent('node store unreachable');
    expect(screen.getByRole('button', { name: 'New skill' })).toBeInTheDocument();
  });

  it('offers a first record action distinct from the header button when there are none', async () => {
    mockApi.get.mockResolvedValue({ nodes: [] });
    renderBrowse();

    expect(await screen.findByText('No skill records yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first skill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New skill' })).toBeInTheDocument();
  });

  it('is a real list, so the records can be counted and skipped', async () => {
    mockApi.get.mockResolvedValue({ nodes: [record, plain] });
    renderBrowse();

    const section = await screen.findByRole('region', { name: /^All skill/ });
    expect(await within(section).findAllByRole('listitem')).toHaveLength(2);
  });

  it('names each row link after the record and leaves its facts beside the link', async () => {
    mockApi.get.mockResolvedValue({ nodes: [record] });
    renderBrowse();

    const link = await screen.findByRole('link', { name: /Rust/ });
    expect(link).toHaveTextContent('Systems');
    // The date and the provenance used to be inside the anchor, so the link
    // was announced as one run of text ending in a timestamp.
    expect(link).not.toHaveTextContent('2026-08-01');
    expect(link).not.toHaveTextContent('Pinned');

    const row = link.closest('li')!;
    expect(within(row).getByText('2026-08-01')).toBeInTheDocument();
  });

  it('says pinned in words, not in an accent nobody can read', async () => {
    mockApi.get.mockResolvedValue({ nodes: [record, plain] });
    renderBrowse();

    const pinned = (await screen.findByRole('link', { name: /Rust/ })).closest('li')!;
    const notPinned = screen.getByRole('link', { name: /Go/ }).closest('li')!;
    expect(within(pinned).getByText('Pinned')).toBeInTheDocument();
    expect(within(notPinned).queryByText('Pinned')).not.toBeInTheDocument();
  });

  it('refuses a type that is not a record type instead of listing nothing', () => {
    renderBrowse('not-a-real-type');

    expect(screen.getByRole('heading', { name: 'Unknown type' })).toBeInTheDocument();
    expect(screen.getByText('Nothing to browse')).toBeInTheDocument();
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
