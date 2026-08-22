/**
 * Library: the states this register used to leave unreported.
 *
 * Three of its four requests reported nothing. A failed tally replaced every
 * route into the user's own records with an error panel, a failed or pending
 * saved views list read as "you have none", and both view mutations ran
 * outside useMutation, so a rejected save or delete resolved into silence with
 * the dialog still open.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Collections } from './Collections.js';

type Reply = unknown | Error | Promise<unknown>;

/** One reply per endpoint. A Promise that never settles holds the request open. */
function serveLibrary(replies: { counts?: Reply; views?: Reply; nodes?: Reply }) {
  const answer = (reply: Reply) =>
    reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/nodes/counts') return answer(replies.counts ?? { counts: {}, total: 0 });
    if (path === '/views') return answer(replies.views ?? { views: [] });
    if (path.startsWith('/nodes?q=')) return answer(replies.nodes ?? { nodes: [] });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

const SAVED_VIEWS = {
  views: [
    { id: 'v1', name: 'Recruiters', query: 'type:person tag:recruiter' },
    { id: 'v2', name: 'Open roles', query: 'type:job_posting' },
  ],
};

/** A toast, with the word an error toast carries and a neutral one does not. */
function toastAround(text: string | RegExp): HTMLElement {
  const node = screen.getByText(text).closest('li');
  if (!node) throw new Error('That message is not in a toast');
  return node as HTMLElement;
}

beforeEach(() => {
  resetMockApi();
});

describe('Library states', () => {
  it('keeps every register open when the tally fails', async () => {
    serveLibrary({ counts: new Error('counts index is rebuilding') });
    renderWithApp(<Collections />, { route: '/explore/library' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t count your records')).toBeInTheDocument();
    expect(within(alert).getByText(/counts index is rebuilding/)).toBeInTheDocument();

    // The failure used to take the only route into each record type with it.
    const people = screen.getByRole('link', { name: 'Open person records, count unavailable' });
    expect(people).toHaveAttribute('href', '/network/people');
    expect(
      screen.getByRole('link', { name: 'Open application records, count unavailable' }),
    ).toHaveAttribute('href', '/career/applications');
  });

  it('counts the registers again from the failure banner', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/nodes/counts') {
        return attempt++ === 0
          ? Promise.reject(new Error('counts index is rebuilding'))
          : Promise.resolve({ counts: { person: 12 }, total: 12 });
      }
      if (path === '/views') return Promise.resolve({ views: [] });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    renderWithApp(<Collections />, { route: '/explore/library' });

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Open person records, 12' })).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t count your records')).not.toBeInTheDocument();
  });

  it('says the saved views are still loading rather than counting none', async () => {
    serveLibrary({ counts: { counts: {}, total: 4 }, views: new Promise(() => {}) });
    renderWithApp(<Collections />, { route: '/explore/library' });

    // The trace coalesced a pending list to zero and asserted "0 saved views"
    // for the whole wait.
    expect(await screen.findByText('saved views loading')).toBeInTheDocument();
    expect(screen.queryByText(/0 saved views/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Saved views/ })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Reading your saved views' })).toBeInTheDocument();
  });

  it('names the saved views feature before the user has one', async () => {
    serveLibrary({ views: { views: [] } });
    renderWithApp(<Collections />, { route: '/explore/library' });

    // The section used to exist only once it already had content, so the
    // feature was invisible to exactly the person who had never used it.
    expect(await screen.findByText('No saved views yet')).toBeInTheDocument();
    expect(
      screen.getByText('Build a query above, then press Save view to pin it here.'),
    ).toBeInTheDocument();
  });

  it('reports a failed saved views load instead of showing an empty shelf', async () => {
    serveLibrary({ views: new Error('views service is down') });
    renderWithApp(<Collections />, { route: '/explore/library' });

    expect(await screen.findByText('Couldn’t load saved views')).toBeInTheDocument();
    expect(screen.getByText('saved views unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No saved views yet')).not.toBeInTheDocument();
  });

  it('reports a failed query once, not twice', async () => {
    serveLibrary({ nodes: new Error('the parser rejected that clause') });
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson' });

    expect(await screen.findByText('Couldn’t run that query')).toBeInTheDocument();
    expect(screen.getByText(/the parser rejected that clause/)).toBeInTheDocument();

    // The trace above still says it on screen, but the boundary owns the
    // announcement: two live regions for one failure interrupt twice.
    const trace = screen.getByText('Query unavailable');
    expect(trace.closest('[aria-live]')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('offers Trash rather than reading as broken when a query matches nothing', async () => {
    serveLibrary({ nodes: { nodes: [] } });
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson' });

    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check Trash' })).toHaveAttribute('href', '/data/trash');
  });

  it('names the button that removes a clause, and removes only that clause', async () => {
    const user = userEvent.setup();
    serveLibrary({ nodes: { nodes: [] } });
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson%20city%3ACairo' });

    // Was a bare multiplication sign with no accessible name at all.
    await user.click(await screen.findByRole('button', { name: 'Remove filter city:Cairo' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove filter city:Cairo' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Remove filter type:person' })).toBeInTheDocument();
  });

  it('holds the delete dialog open with a pending trace until the request settles', async () => {
    const user = userEvent.setup();
    serveLibrary({ views: SAVED_VIEWS });
    let release: () => void = () => {};
    mockApi.del.mockReturnValue(
      new Promise<void>((resolve) => {
        release = () => resolve();
      }),
    );
    renderWithApp(<Collections />, { route: '/explore/library' });

    await user.click(await screen.findByRole('button', { name: 'Delete view Recruiters' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete the view/ });
    await user.click(within(dialog).getByRole('button', { name: 'Delete view' }));

    // The dialog used to close in the same tick the request started, so its
    // busy state could never render.
    const trace = await within(dialog).findByText('Deleting the view');
    expect(trace.closest('[role="status"]')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Delete view' })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Deleted')).toBeInTheDocument();
  });

  it('takes only the row that is going out of service', async () => {
    const user = userEvent.setup();
    serveLibrary({ views: SAVED_VIEWS });
    mockApi.del.mockReturnValue(new Promise(() => {}));
    renderWithApp(<Collections />, { route: '/explore/library' });

    await user.click(await screen.findByRole('button', { name: 'Delete view Recruiters' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete the view/ });
    await user.click(within(dialog).getByRole('button', { name: 'Delete view' }));

    // One shared isPending disabled every Delete on the screen, so the list
    // claimed two records were going when one was.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Deleting view Recruiters', hidden: true }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole('button', { name: 'Delete view Open roles', hidden: true }),
    ).toBeEnabled();
  });

  it('leaves the view in place and says why when the delete fails', async () => {
    const user = userEvent.setup();
    serveLibrary({ views: SAVED_VIEWS });
    mockApi.del.mockRejectedValue(new Error('the view is locked by a sync'));
    renderWithApp(<Collections />, { route: '/explore/library' });

    await user.click(await screen.findByRole('button', { name: 'Delete view Recruiters' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete the view/ });
    await user.click(within(dialog).getByRole('button', { name: 'Delete view' }));

    // The bare api.del call rejected into nothing at all.
    const toast = toastAround(/the view is locked by a sync/);
    expect(within(toast).getByText('Error')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Delete view Recruiters' }),
    ).toBeInTheDocument();
  });

  it('keeps the name the user typed when saving a view fails', async () => {
    const user = userEvent.setup();
    serveLibrary({ nodes: { nodes: [] } });
    mockApi.post.mockRejectedValue(new Error('a view by that name exists'));
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson' });

    await user.click(await screen.findByRole('button', { name: 'Save view' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this view' });
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'People I owe a reply');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const toast = toastAround(/a view by that name exists/);
    expect(within(toast).getByText('Error')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('People I owe a reply');
  });

  it('reports the save it received while the request is out', async () => {
    const user = userEvent.setup();
    serveLibrary({ nodes: { nodes: [] } });
    let release: () => void = () => {};
    mockApi.post.mockReturnValue(
      new Promise<void>((resolve) => {
        release = () => resolve();
      }),
    );
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson' });

    await user.click(await screen.findByRole('button', { name: 'Save view' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this view' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const busy = await within(dialog).findByRole('button', { name: 'Saving…' });
    expect(busy).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
