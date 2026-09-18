import '../test/api-mock.js';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Dossiers } from './Dossiers.js';
import { DossierEditor } from './DossierEditor.js';

const access = vi.hoisted(() => ({ writable: true }));
vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com', via: 'dev' } }),
  useCanWrite: () => access.writable,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
vi.mock('../components/EntityPicker.js', () => ({
  EntityPicker: ({ allowCreate }: { allowCreate?: boolean }) => (
    <button type="button">
      {allowCreate === false ? 'Link existing evidence' : 'Create evidence'}
    </button>
  ),
}));

const grammar = {
  id: 'scope',
  heading: 'Scope',
  purpose: 'The work you owned.',
  admits: ['role'],
  admitsAtoms: false,
  minClaims: 1,
  maxClaims: 6,
  minCitationsPerClaim: 1,
  maxCitationsPerClaim: null,
  required: true,
};
const dossier = {
  id: 'd1',
  subject_node: 'p1',
  title: 'Review packet',
  audience: 'promotion_review',
  sections: [],
  rev: 1,
  tex_key: null,
  pdf_key: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z',
};
const compiled = {
  dossier,
  subject: { id: 'p1', title: 'Ada' },
  sections: [],
  appendix: [],
  violations: [],
  blocking: false,
};
function serve(path: string): unknown {
  if (path.startsWith('/auth/me')) return { self: { id: 'p1', title: 'Ada' } };
  if (path.startsWith('/dossiers/audiences'))
    return { audiences: [{ audience: 'promotion_review', sections: [grammar] }] };
  if (path.endsWith('/compile')) return compiled;
  return { dossiers: [dossier] };
}
function renderRoute(route = '/career/dossiers') {
  return renderWithApp(
    <Routes>
      <Route path="/career/dossiers" element={<Dossiers />} />
      <Route path="/career/dossiers/:id" element={<DossierEditor />} />
    </Routes>,
    { route },
  );
}
beforeEach(() => {
  resetMockApi();
  access.writable = true;
  mockApi.get.mockImplementation(async (path) => serve(path));
});

describe('dossier repair safeguards', () => {
  it('restores URL filters and lets an empty result recover', async () => {
    renderRoute('/career/dossiers?q=missing&audience=promotion_review');
    await screen.findByText('No matching dossiers');
    expect(screen.getByLabelText('Find a dossier')).toHaveValue('missing');
    await userEvent.click(screen.getByRole('button', { name: 'Show all dossiers' }));
    expect(await screen.findByRole('link', { name: 'Review packet' })).toBeVisible();
  });
  it('preserves loaded rows when a refresh fails', async () => {
    renderRoute();
    await screen.findByRole('link', { name: 'Review packet' });
    mockApi.get.mockRejectedValue(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh dossiers' }));
    await screen.findByText('Dossiers could not refresh');
    expect(screen.getByRole('link', { name: 'Review packet' })).toBeVisible();
  });
  it('protects a new dossier draft and validates a reversed window', async () => {
    renderRoute();
    await screen.findByRole('link', { name: 'Review packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft packet');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft packet');
    await userEvent.click(screen.getByRole('radio', { name: 'Promotion review' }));
    await userEvent.type(screen.getByLabelText('Window start'), '2026-09-20');
    await userEvent.type(screen.getByLabelText('Window end'), '2026-09-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create dossier' }));
    await screen.findByText('Window end must be on or after window start.');
    expect(mockApi.post).not.toHaveBeenCalled();
  });
  it('locks creation inputs and cancellation while the request is pending', async () => {
    let reject!: (error: Error) => void;
    mockApi.post.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderRoute();
    await screen.findByRole('link', { name: 'Review packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft packet');
    await userEvent.click(screen.getByRole('radio', { name: 'Promotion review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create dossier' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => reject(new Error('Unavailable')));
    expect(await screen.findByText('Unavailable')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft packet');
  });
  it('keeps editor drafts and the compiled content on a failed refresh', async () => {
    renderRoute('/career/dossiers/d1');
    await screen.findByRole('heading', { name: 'Review packet' });
    const input = await screen.findByLabelText('The sentence this entry asserts');
    await userEvent.type(input, 'My evidence-backed entry.');
    mockApi.get.mockImplementation(async (path) => {
      if (path.endsWith('/compile')) throw new Error('offline');
      return serve(path);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh dossier' }));
    await screen.findByText('Dossier could not refresh');
    expect(input).toHaveValue('My evidence-backed entry.');
    expect(screen.getByRole('heading', { name: /^The compiled document/ })).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Back to dossiers' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
  });
  it('disables all dossier writes in a read-only workspace', async () => {
    access.writable = false;
    const list = renderRoute();
    await screen.findByRole('link', { name: 'Review packet' });
    expect(screen.getByRole('button', { name: 'New dossier' })).toBeDisabled();
    list.unmount();
    renderRoute('/career/dossiers/d1');
    await screen.findByRole('heading', { name: 'Review packet' });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByLabelText('The sentence this entry asserts')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link existing evidence' })).toBeDisabled();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
  it('keeps the delete confirmation open with an actionable failure', async () => {
    mockApi.del.mockRejectedValue(new Error('Delete failed'));
    renderRoute('/career/dossiers/d1');
    await screen.findByRole('heading', { name: 'Review packet' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete this dossier' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Delete failed');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete this dossier' })).toBeEnabled(),
    );
  });
});
