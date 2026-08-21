/**
 * Letters route: the four loads it depends on, and the editor's own names.
 * Three of those loads only fill pickers, so their failures used to look like
 * empty pickers, and the editor's selects reached the browser unnamed.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Letters } from './Letters.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
}));

const TARGET = { id: 't1', role_title: 'Staff Engineer', company: 'Northwind' };
const LETTER = {
  id: 'l1',
  target_id: 't1',
  blocks: [{ kind: 'hook', text: 'Hello' }],
  status: 'draft',
  rev: 1,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
};

/** Each key may be a value to return or an Error to throw. */
function serve(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/letters': { letters: [LETTER] },
    '/targets': { targets: [TARGET] },
    '/resumes': { resumes: [{ id: 'r1', name: 'Baseline' }] },
    '/atoms': { atoms: [] },
    ...over,
  };
  mockApi.get.mockImplementation(async (path: string) => {
    const key = Object.keys(table).find((k) => path.startsWith(k));
    const value = key ? table[key] : {};
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  resetMockApi();
  serve();
});

describe('Letters states', () => {
  it('lists letters as a named list, not a stack of divs', async () => {
    renderWithApp(<Letters />, { route: '/letters' });
    const list = await screen.findByRole('list', { name: 'Cover letters' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('reports a failed load instead of inviting a first letter', async () => {
    serve({ '/letters': new Error('gateway down') });
    renderWithApp(<Letters />, { route: '/letters' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load your cover letters',
    );
    expect(screen.queryByText(/No cover letters yet/)).not.toBeInTheDocument();
  });

  it('says in text why New letter is unavailable when targets fail to load', async () => {
    serve({ '/targets': new Error('offline') });
    renderWithApp(<Letters />, { route: '/letters' });
    // Not a title on the disabled button: keyboard users never reach that.
    expect(await screen.findByText('Job targets could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New letter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('points at Tailor when there are simply no targets yet', async () => {
    serve({ '/targets': { targets: [] } });
    renderWithApp(<Letters />, { route: '/letters' });
    expect(await screen.findByText('Add a job target first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Tailor' })).toHaveAttribute(
      'href',
      '/career/resume/tailor',
    );
  });

  it('names every editor control, and warns which pickers came back empty', async () => {
    serve({ '/atoms': new Error('offline') });
    renderWithApp(<Letters />, { route: '/letters' });
    const row = await screen.findByRole('button', { name: /Edit the letter to Northwind/ });
    await userEvent.click(row);

    // A <label> around a Radix select names nothing: the trigger is a button.
    expect(await screen.findByRole('combobox', { name: 'Target' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Linked output' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();

    expect(screen.getByText('Some choices could not be loaded')).toBeInTheDocument();
    expect(screen.getByText(/atoms/)).toBeInTheDocument();
  });
});
