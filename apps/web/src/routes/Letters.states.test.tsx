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
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
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
      "Couldn't load your cover letters",
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

  it('offers the compile pair from the detail sheet (FR-RES-021)', async () => {
    renderWithApp(<Letters />, { route: '/letters' });
    await userEvent.click(await screen.findByRole('button', { name: /Details of the letter/ }));

    const panel = await screen.findByRole('region', { name: 'Compile this letter' });
    expect(within(panel).getByRole('button', { name: 'Compile preview' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Finalize letter' })).toBeInTheDocument();
  });

  it('says the compiler is unreachable rather than showing a blank preview', async () => {
    mockApi.post.mockResolvedValue({
      ok: false,
      pages: null,
      offline: true,
      error: { code: 'BUILDSVC_OFFLINE', message: 'unreachable' },
      logTail: null,
      pdfBase64: null,
      tex: '\\documentclass{article}',
      template: 'letter-classic@1.0.0',
    });
    renderWithApp(<Letters />, { route: '/letters' });
    await userEvent.click(await screen.findByRole('button', { name: /Details of the letter/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Compile preview' }));

    expect(await screen.findByText('Build service offline')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download .tex' })).toBeInTheDocument();
  });

  it('sends only the recipient fields that were filled in', async () => {
    mockApi.patch.mockResolvedValue({ letter: { ...LETTER, rev: 2 } });
    renderWithApp(<Letters />, { route: '/letters' });
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit the letter to Northwind/ }),
    );

    await userEvent.type(await screen.findByLabelText('Name'), 'Marie Uwase');
    await userEvent.click(screen.getByRole('button', { name: 'Save letter' }));

    const body = mockApi.patch.mock.calls[0]![1] as { recipient?: Record<string, string> };
    // An empty string would be stored as a recipient nobody wrote down, and
    // the letter would then address a blank line.
    expect(body.recipient).toEqual({ name: 'Marie Uwase' });
  });

  it('omits the recipient entirely when none was recorded', async () => {
    mockApi.patch.mockResolvedValue({ letter: { ...LETTER, rev: 2 } });
    renderWithApp(<Letters />, { route: '/letters' });
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit the letter to Northwind/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save letter' }));

    const body = mockApi.patch.mock.calls[0]![1] as { recipient?: Record<string, string> };
    expect(body.recipient).toBeUndefined();
  });
});
