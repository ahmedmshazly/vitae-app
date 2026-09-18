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
import * as connectionSaves from './save-connections.js';

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
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {children}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  // The duplicate check and the self lookup both go through `get`; default
  // them to something harmless so each test only stubs what it cares about.
  get.mockResolvedValue({ user: null, node: null, edges: [], neighbors: {} });
  post.mockResolvedValue({ fingerprint: 'f', candidates: [] });
});

it('qualifies a placeholder birthday year and preserves its unknown-year status on save', async () => {
  get.mockImplementation(async (path: string) =>
    path === '/nodes/p1'
      ? {
          node: {
            id: 'p1',
            type: 'person',
            title: 'Fictional person',
            props: { birthday: '2000-02-29', year_known: false },
            notes_md: '',
          },
          edges: [],
          neighbors: {},
        }
      : { values: [], nodes: [] },
  );
  patch.mockResolvedValue({});
  const user = userEvent.setup();
  render(
    <Harness>
      <NodeFormDialog open onOpenChange={() => {}} type="person" nodeId="p1" />
    </Harness>,
  );
  expect(await screen.findByText(/Birth year is not recorded/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/nodes/p1',
      expect.objectContaining({
        props: expect.objectContaining({ birthday: '2000-02-29', year_known: false }),
      }),
    ),
  );
});

it('does not warn when an untouched form is dismissed after field focus', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(
    <Harness>
      <NodeFormDialog open onOpenChange={onOpenChange} type="person" />
    </Harness>,
  );
  await user.tab();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
});

it('protects a changed draft and returns focus to the form after keeping it', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(
    <Harness>
      <NodeFormDialog open onOpenChange={onOpenChange} type="person" />
    </Harness>,
  );
  await user.type(screen.getByLabelText(/Full name/), 'Draft person');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Keep editing/ }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText(/Full name/)).toHaveValue('Draft person');
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

it('locks the submitted draft while saving and retries the same partially saved node', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  let rejectConnections!: (error: Error) => void;
  vi.spyOn(connectionSaves, 'saveConnections')
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectConnections = reject;
        }),
    )
    .mockResolvedValueOnce();
  post.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/nodes' ? { node: { id: 'created-once' } } : { fingerprint: 'f', candidates: [] },
    ),
  );
  render(
    <Harness>
      <NodeFormDialog open onOpenChange={onOpenChange} type="person" onSaved={vi.fn()} />
    </Harness>,
  );
  const title = screen.getByLabelText(/Full name/);
  await user.type(title, 'One record');
  await user.click(screen.getByRole('button', { name: /^Create person/ }));
  await waitFor(() => expect(title).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  rejectConnections(new Error('Connection service unavailable'));
  await screen.findByText(/Retry to finish this same record/);
  await user.click(screen.getByRole('button', { name: /^Create person/ }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(post.mock.calls.filter(([path]) => path === '/nodes')).toHaveLength(1);
  expect(patch).toHaveBeenCalledWith(
    '/nodes/created-once',
    expect.objectContaining({ title: 'One record' }),
  );
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
    const alert = (await screen.findByText(/Couldn't save\./)).closest('[role="alert"]')!;
    expect(alert).toHaveTextContent('The graph is read-only right now.');
    await waitFor(() => expect(alert).toHaveFocus());
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
    await screen.findByText(/Couldn't save\./);
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('clears a stale save failure when the draft changes', async () => {
    const user = userEvent.setup();
    post.mockImplementation((path: string) =>
      path === '/nodes'
        ? Promise.reject(new Error('The graph is read-only right now.'))
        : Promise.resolve({ fingerprint: 'f', candidates: [] }),
    );
    render(
      <Harness>
        <NodeFormDialog open onOpenChange={vi.fn()} type="person" />
      </Harness>,
    );

    const title = document.querySelector('#ef-title') as HTMLElement;
    await user.type(title, 'Retry me');
    await user.click(screen.getByRole('button', { name: /^Create person/ }));
    expect(await screen.findByText(/Couldn't save\./)).toBeInTheDocument();

    await user.type(title, '!');
    await waitFor(() => expect(screen.queryByText(/Couldn't save\./)).not.toBeInTheDocument());
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

describe('NodeFormDialog, editing an application', () => {
  it('does not offer illegal statuses from the current stage', async () => {
    const user = userEvent.setup();
    get.mockImplementation((path: string) => {
      if (path === '/nodes/app-interview') {
        return Promise.resolve({
          node: {
            id: 'app-interview',
            type: 'application',
            title: 'Staff engineer',
            notes_md: '',
            props: { role_title: 'Staff engineer', status: 'interview' },
          },
          edges: [],
          neighbors: {},
        });
      }
      return Promise.resolve({ user: null, node: null, edges: [], neighbors: {} });
    });

    render(
      <Harness>
        <NodeFormDialog open onOpenChange={vi.fn()} type="application" nodeId="app-interview" />
      </Harness>,
    );

    const status = await screen.findByRole('combobox', { name: 'Status' });
    await user.click(status);
    expect(screen.getByRole('option', { name: 'Interview' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Offer' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument();
    expect(screen.getByText(/Correct status on the dossier/)).toBeInTheDocument();
  });
});

describe('NodeFormDialog, creating a job posting', () => {
  it('serializes the posting fields and keeps the posting URL distinct from an application URL', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    post.mockImplementation((path: string) => {
      if (path === '/nodes') return Promise.resolve({ node: { id: 'posting-1' } });
      return Promise.resolve({ fingerprint: 'posting-fingerprint', candidates: [] });
    });

    render(
      <Harness>
        <NodeFormDialog open onOpenChange={onOpenChange} type="job_posting" />
      </Harness>,
    );

    await user.type(
      document.querySelector('#ef-title') as HTMLElement,
      'Staff engineer @ Northstar',
    );
    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'Northstar');
    await user.type(screen.getByRole('combobox', { name: 'Role title' }), 'Staff engineer');
    await user.type(
      screen.getByRole('textbox', { name: 'Posting URL' }),
      'https://northstar.example/careers/staff-engineer',
    );
    await user.click(screen.getByRole('button', { name: /^Create job posting/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/nodes', {
        type: 'job_posting',
        title: 'Staff engineer @ Northstar',
        props: {
          company: 'Northstar',
          role_title: 'Staff engineer',
          url: 'https://northstar.example/careers/staff-engineer',
        },
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
