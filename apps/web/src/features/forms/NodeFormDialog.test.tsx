/**
 * The dialog around EntityForm: what it does while an edit loads, and what it
 * says when a save is rejected.
 *
 * The loading state is deliberately hard to reach in the running app, every
 * caller (Person, Record, Org) fetches the same `['node', id]` key before it
 * renders an Edit button, so the cache is warm by the time the dialog opens.
 * That is the right behaviour and the reason this lives here rather than in
 * Playwright: a cold cache is only controllable from inside.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeFormDialog } from './NodeFormDialog.js';
import { ToastProvider } from '../Toast.js';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();
vi.mock('../../lib/api.js', () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    del: (...a: unknown[]) => del(...a),
  },
}));

function Harness({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  // The duplicate check and the self lookup both go through `get`; default
  // them to something harmless so each test only stubs what it cares about.
  get.mockResolvedValue({ user: null, node: null, edges: [], neighbors: {} });
  post.mockResolvedValue({ fingerprint: 'f', candidates: [] });
});

describe('NodeFormDialog, loading an edit', () => {
  it('shows skeletons in the shape of the form, and no footer to press yet', async () => {
    get.mockReturnValue(new Promise(() => {}));
    render(
      <Harness>
        <NodeFormDialog open onOpenChange={vi.fn()} type="person" nodeId="p1" />
      </Harness>,
    );

    // A centred spinner on a full panel is what this replaced.
    expect(await screen.findByRole('status', { name: 'Loading record' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes/ })).not.toBeInTheDocument();
  });
});

describe('NodeFormDialog, a rejected save', () => {
  it('explains the failure and leaves the dialog open with the values intact', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    post.mockImplementation((path: string) =>
      path === '/nodes'
        ? Promise.reject(new Error('The graph is read-only right now.'))
        : Promise.resolve({ fingerprint: 'f', candidates: [] }),
    );

    render(
      <Harness>
        <NodeFormDialog open onOpenChange={onOpenChange} type="person" />
      </Harness>,
    );

    const title = document.querySelector('#ef-title') as HTMLElement;
    await user.type(title, 'A rejected idea');
    await user.click(screen.getByRole('button', { name: /^Create person/ }));

    // There was no catch at all, the rejection escaped as an unhandled
    // promise and the dialog sat there looking idle.
    // Scoped by text: a field error is also role="alert", so "the first
    // alert" would silently pass on a validation message instead.
    const alert = (await screen.findByText(/Couldn’t save\./)).closest('[role="alert"]')!;
    expect(alert).toHaveTextContent('The graph is read-only right now.');
    expect(post).toHaveBeenCalledWith('/nodes', expect.objectContaining({ type: 'person' }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(title).toHaveValue('A rejected idea');
  });

  it('re-enables the control so the same save can be retried', async () => {
    const user = userEvent.setup();
    post.mockImplementation((path: string) =>
      path === '/nodes'
        ? Promise.reject(new Error('nope'))
        : Promise.resolve({ fingerprint: 'f', candidates: [] }),
    );
    render(
      <Harness>
        <NodeFormDialog open onOpenChange={vi.fn()} type="person" />
      </Harness>,
    );

    await user.type(document.querySelector('#ef-title') as HTMLElement, 'Retry me');
    const submit = screen.getByRole('button', { name: /^Create person/ });
    await user.click(submit);
    await screen.findByText(/Couldn’t save\./);
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('NodeFormDialog, the actions live in the footer', () => {
  it('puts them outside the scrolling body and wires them back with form=', async () => {
    render(
      <Harness>
        <NodeFormDialog open onOpenChange={vi.fn()} type="person" />
      </Harness>,
    );

    const submit = await screen.findByRole('button', { name: /^Create person/ });
    const form = document.querySelector('form.entity-form')!;
    expect(submit.closest('.vt-modal__body')).toBeNull();
    expect(submit.closest('.vt-modal__foot')).not.toBeNull();
    expect(submit.getAttribute('form')).toBe(form.id);
    expect(form.id).toBeTruthy();
  });
});
