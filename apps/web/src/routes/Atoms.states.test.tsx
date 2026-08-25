/**
 * Atom library: the states the screen used to keep to itself. A failed load
 * read as an empty library, a failed refresh wiped rows that were still true,
 * Duplicate looked like a dropped click, and the filters and the editor's
 * controls reached the browser without names.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Atoms } from './Atoms.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

const ROUTE = '/career/resume/evidence';

const ATOM = {
  id: 'a1',
  rev: 1,
  kind: 'achievement',
  owner_node: 'n1',
  owner_title: 'Staff Engineer',
  owner_type: 'role',
  metrics: [{ value: '38', unit: '%' }],
  evidence: [],
  pinned: false,
  blocked: false,
  deleted_at: null,
  variants: [{ emphasis: 'technical', text: 'Cut deploy time by 38 percent', is_default: true }],
  skill_ids: ['s1'],
  skills: [{ id: 's1', name: 'Python' }],
};
const SECOND = {
  ...ATOM,
  id: 'a2',
  kind: 'responsibility',
  variants: [{ emphasis: 'technical', text: 'Ran the on call rotation', is_default: true }],
  skill_ids: [],
  skills: [],
};
const OWNER = { id: 'n1', title: 'Staff Engineer', type: 'role' };

/** Each key may be a value to return or an Error to throw. */
function serve(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/atoms': { atoms: [ATOM, SECOND], owners: [OWNER] },
    '/nodes': {
      nodes: [
        { id: 's1', title: 'Python', type: 'skill' },
        { id: 's2', title: 'Kubernetes', type: 'skill' },
      ],
    },
    ...over,
  };
  mockApi.get.mockImplementation(async (path: string) => {
    const key = Object.keys(table).find((k) => path.startsWith(k));
    const value = key ? table[key] : {};
    if (value instanceof Error) throw value;
    return value;
  });
}

/** Open the editor over the first atom. */
async function openFirstAtom() {
  const card = await screen.findByRole('button', { name: /Edit atom: Cut deploy time/ });
  await userEvent.click(card);
  return screen.findByRole('dialog');
}

beforeEach(() => {
  resetMockApi();
  serve();
});

describe('Atoms states', () => {
  it('renders the library as a named list of records', async () => {
    renderWithApp(<Atoms />, { route: ROUTE });
    const list = await screen.findByRole('list', { name: 'Atoms' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    // One name for the card, not its whole contents read out as a sentence.
    expect(
      within(list).getByRole('button', { name: 'Edit atom: Cut deploy time by 38 percent' }),
    ).toBeInTheDocument();
  });

  it('says the library is loading while it loads', async () => {
    serve({ '/atoms': new Promise(() => {}) });
    renderWithApp(<Atoms />, { route: ROUTE });
    expect(await screen.findByRole('status', { name: 'Loading your atoms' })).toBeInTheDocument();
  });

  it('reports a failed load instead of inviting a first atom', async () => {
    serve({ '/atoms': new Error('gateway down') });
    renderWithApp(<Atoms />, { route: ROUTE });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load your atom library');
    expect(alert).toHaveTextContent('gateway down');
    expect(screen.queryByText('No atoms yet')).not.toBeInTheDocument();
  });

  it('keeps rows that are still true when a refresh fails', async () => {
    const { queryClient } = renderWithApp(<Atoms />, { route: ROUTE });
    await screen.findByRole('list', { name: 'Atoms' });

    serve({ '/atoms': new Error('network offline') });
    void queryClient.refetchQueries({ queryKey: ['atoms'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t refresh your atom library',
    );
    expect(screen.getByRole('list', { name: 'Atoms' })).toBeInTheDocument();
  });

  it('carries the chosen filter in the name of each dropdown', async () => {
    renderWithApp(<Atoms />, { route: `${ROUTE}?kind=achievement` });
    // Radix puts `label` on the trigger as aria-label, and an aria-label wins
    // over the trigger's own text, so the value has to be in the name.
    expect(await screen.findByRole('combobox', { name: 'Kind: Achievements' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'State: All states' })).toBeInTheDocument();
  });

  it('announces how many atoms are shown of how many there are', async () => {
    renderWithApp(<Atoms />, { route: `${ROUTE}?kind=achievement` });
    await screen.findByRole('list', { name: 'Atoms' });
    expect(screen.getByRole('status', { name: 'Atoms shown' })).toHaveTextContent('1 of 2 shown');
  });

  it('separates a filter that matched nothing from an empty library', async () => {
    renderWithApp(<Atoms />, { route: `${ROUTE}?state=pinned` });
    expect(await screen.findByText('No atoms match these filters')).toBeInTheDocument();
    expect(screen.getByText(/All 2 of your atoms are hidden/)).toBeInTheDocument();
    expect(screen.queryByText('No atoms yet')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear the filters' }));
    const list = await screen.findByRole('list', { name: 'Atoms' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers the first atom when the library is genuinely empty', async () => {
    serve({ '/atoms': { atoms: [], owners: [] } });
    renderWithApp(<Atoms />, { route: ROUTE });
    expect(await screen.findByText('No atoms yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create atom' })).toBeInTheDocument();
  });

  it('shows Duplicate working instead of leaving the click unanswered', async () => {
    mockApi.post.mockImplementation(() => new Promise(() => {}));
    renderWithApp(<Atoms />, { route: ROUTE });
    const sheet = await openFirstAtom();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Duplicate' }));

    const busy = await within(sheet).findByRole('button', { name: 'Duplicating…' });
    expect(busy).toBeDisabled();
  });

  it('names every control in the editor', async () => {
    renderWithApp(<Atoms />, { route: ROUTE });
    const sheet = await openFirstAtom();

    // A <label> beside a Radix select names nothing: the trigger is a button.
    expect(
      await within(sheet).findByRole('combobox', { name: 'Owned by: Staff Engineer, role' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('combobox', { name: 'Kind: Achievement' })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('combobox', { name: 'Variant 1 emphasis: Technical' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('textbox', { name: 'Technical wording, variant 1 of 1' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('textbox', { name: 'Metric' })).toBeInTheDocument();
    expect(within(sheet).getByRole('textbox', { name: 'Metric unit' })).toBeInTheDocument();
    expect(within(sheet).getByRole('textbox', { name: 'Evidence URL' })).toBeInTheDocument();
  });

  it('reports a skill catalogue that did not load, rather than showing no tags', async () => {
    serve({ '/nodes': new Error('search offline') });
    renderWithApp(<Atoms />, { route: ROUTE });
    const sheet = await openFirstAtom();

    expect(await within(sheet).findByText('Couldn’t load your skill catalogue')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('reports a save that failed, where the Save button is', async () => {
    mockApi.patch.mockRejectedValue(new Error('this atom changed elsewhere'));
    renderWithApp(<Atoms />, { route: ROUTE });
    const sheet = await openFirstAtom();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Save atom' }));

    expect(await within(sheet).findByText('Couldn’t save this atom')).toBeInTheDocument();
    expect(within(sheet).getByText(/this atom changed elsewhere/)).toBeInTheDocument();
  });
});
