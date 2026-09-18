/**
 * Person dossier: the states a reader causes or waits on. Three supporting
 * queries can each fail on their own here, a settle can be in flight on one
 * favor row while the others stay live, and the most actionable fact on the
 * page used to be a warning hue and nothing else.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Person } from './Person.js';
import type * as AuthModule from '../lib/auth.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));

const record = {
  node: {
    id: 'person-1',
    title: 'Ada Lovelace',
    subtitle: 'Mathematician',
    source: 'manual',
    props: { headline: 'Analytical engine pioneer', city: 'London' },
  },
  edges: [],
  neighbors: {},
};

const strength = {
  strength: 0.72,
  intensity: 0.35,
  status: 'active',
  daysSinceLast: 12,
  medianGapDays: 30,
  factors: { closeness: 0.45, intensity: 0.27 },
};

const relationship = {
  relation: 'colleague',
  closeness: 4,
  cadenceTargetDays: 60,
  metVia: 'Babbage',
  topics: ['mathematics'],
  edgeId: 'edge-1',
  doNotPing: false,
  metOn: null,
  knowsProps: {},
};

const profile = {
  person: { id: 'person-1', title: 'Ada Lovelace', isSelf: false, isPlaceholder: false },
  sections: [],
  skills: [],
  counts: { records: 0, skills: 0 },
};

/** Each key may be a value to return or an Error to throw. */
function serve(over: { summary?: unknown; profile?: unknown; record?: unknown } = {}) {
  const summary = 'summary' in over ? over.summary : { strength, relationship, favors: [] };
  const prof = 'profile' in over ? over.profile : profile;
  const rec = 'record' in over ? over.record : record;
  mockApi.get.mockImplementation(async (path: string) => {
    const value = path.endsWith('/summary')
      ? summary
      : path.endsWith('/profile')
        ? prof
        : path.endsWith('/correspondence')
          ? { profile: { coverage: { withDirection: 0, total: 0 } } }
          : rec;
    if (value instanceof Error) throw value;
    return value;
  });
}

/** Renders the dossier and waits for the record query to land. */
async function renderPerson() {
  const result = renderWithApp(
    <Routes>
      <Route path="/network/people/:id" element={<Person />} />
    </Routes>,
    { route: '/network/people/person-1' },
  );
  // Three queries settle here; the default one second is tight under load.
  await screen.findByRole('heading', { name: 'Ada Lovelace' }, { timeout: 5000 });
  return result;
}

beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
  serve();
});

describe('Person states', () => {
  it('distinguishes undated contact history from having no interactions', async () => {
    serve({
      record: {
        ...record,
        edges: [{ id: 'e1', type: 'WITH', src: 'i1', dst: 'person-1', props: {} }],
        neighbors: {
          i1: {
            id: 'i1',
            type: 'interaction',
            title: 'Imported conversation',
            props: { occurred_at: 'invalid' },
          },
        },
      },
    });
    await renderPerson();
    expect(screen.getByText('Date not recorded')).toBeVisible();
    expect(screen.queryByText('No interaction yet')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Logged interactions' })).toHaveTextContent(
      'Imported conversation',
    );
  });
  it('disables write entry points in a read-only workspace while preserving details', async () => {
    permissions.canWrite = false;
    await renderPerson();
    for (const name of [
      'Edit record',
      'Delete',
      'Edit relationship',
      'Log introduction',
      'Add connection',
      'Add first connection',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', { name: 'Log interaction' }))
      expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: /Edit closeness/ })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Details' })).toBeVisible();
  });

  it('blocks duplicate deletion and dismissal while pending, then retains a retryable failure', async () => {
    let reject!: (error: Error) => void;
    mockApi.delete.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const user = userEvent.setup();
    await renderPerson();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.dblClick(screen.getByRole('button', { name: 'Move to trash' }));
    expect(mockApi.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    reject(new Error('Offline'));
    expect(await screen.findByText('Couldn’t move this person to Trash')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move to trash' })).toBeEnabled();
  });

  it('keeps an open deletion confirmation dismissible after write permission is revoked', async () => {
    const user = userEvent.setup();
    const { queryClient } = await renderPerson();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    permissions.canWrite = false;
    queryClient.setQueryData(['node', 'person-1'], {
      ...record,
      node: { ...record.node, title: 'Ada updated' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move to trash' })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });
  it('names the favor ledger unavailable rather than calling it balanced', async () => {
    serve({ summary: new Error('strength service unavailable') });
    await renderPerson();

    const ledger = screen.getByRole('region', { name: /^Favor ledger/ });
    const alert = within(ledger).getByRole('alert');
    expect(alert).toHaveTextContent('The favor ledger could not be verified');
    expect(within(ledger).getByRole('button', { name: 'Retry favors' })).toBeInTheDocument();
    // The old header read "balanced" off an empty array it never received.
    expect(within(ledger).queryByText('balanced')).not.toBeInTheDocument();
    expect(within(ledger).getByText('unavailable')).toBeInTheDocument();
  });

  it('raises one banner for two supporting queries that failed together', async () => {
    // Both queries answer once, so the dossier holds usable data, then both
    // fail on refetch. Two banners meant two assertive announcements at once.
    serve();
    const { queryClient } = await renderPerson();

    serve({ summary: new Error('offline'), profile: new Error('offline') });
    await queryClient.refetchQueries({ queryKey: ['person-summary', 'person-1'] });
    await queryClient.refetchQueries({ queryKey: ['person-profile', 'person-1'] });

    const banner = await screen.findByText(
      /Couldn't refresh relationship intelligence and profile evidence/,
    );
    expect(banner).toBeInTheDocument();
    expect(screen.getAllByText(/Couldn't refresh/)).toHaveLength(1);
  });

  it('says a person is overdue in words, not only in the warning hue', async () => {
    serve({
      summary: {
        strength: { ...strength, daysSinceLast: 200 },
        relationship,
        favors: [],
      },
    });
    await renderPerson();

    const region = screen.getByRole('region', { name: 'Relationship strength' });
    expect(within(region).getByText('overdue')).toBeInTheDocument();
  });

  it('leaves the cadence unmarked when contact is inside the target', async () => {
    await renderPerson();

    const region = screen.getByRole('region', { name: 'Relationship strength' });
    expect(within(region).queryByText('overdue')).not.toBeInTheDocument();
  });

  it('names the closeness control with the rating it would edit', async () => {
    await renderPerson();

    expect(
      screen.getByRole('button', { name: 'Edit closeness, currently 4 of 5' }),
    ).toBeInTheDocument();
  });

  it('marks only the favor row being settled as busy', async () => {
    let finish!: () => void;
    serve({
      summary: {
        strength,
        relationship,
        favors: [
          { id: 'f1', direction: 'owed_to_me', what: 'Intro to Yara', settled: false },
          { id: 'f2', direction: 'owed_by_me', what: 'Review the draft', settled: false },
        ],
      },
    });
    mockApi.patch.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderPerson();

    const favors = screen.getByRole('list', { name: 'Favors' });
    const rows = within(favors).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    await user.click(within(rows[0]!).getByRole('button', { name: 'Settle' }));

    expect(within(rows[0]!).getByRole('button', { name: 'Settling...' })).toBeDisabled();
    // The shared pending flag used to disable this one too.
    expect(within(rows[1]!).getByRole('button', { name: 'Settle' })).toBeEnabled();

    finish();
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledOnce());
  });

  it('states a settled favor in text, not only with a strike-through', async () => {
    serve({
      summary: {
        strength,
        relationship,
        favors: [{ id: 'f1', direction: 'owed_to_me', what: 'Intro to Yara', settled: true }],
      },
    });
    await renderPerson();

    const favors = screen.getByRole('list', { name: 'Favors' });
    expect(within(favors).getByText('settled')).toBeInTheDocument();
    expect(within(favors).queryByRole('button', { name: 'Settle' })).not.toBeInTheDocument();
  });

  it('explains on the row why an id-less favor cannot be settled', async () => {
    serve({
      summary: {
        strength,
        relationship,
        favors: [{ id: null, direction: 'owed_by_me', what: 'Old commitment', settled: false }],
      },
    });
    await renderPerson();

    const favors = screen.getByRole('list', { name: 'Favors' });
    expect(within(favors).getByText('not settleable')).toBeInTheDocument();
    // Was a title attribute, which keyboard and screen-reader users never see.
    expect(
      within(favors).getByText(/Adding it again would create a separate commitment/),
    ).toBeInTheDocument();
  });

  it('folds a long profile group behind a disclosure that says how many there are', async () => {
    serve({
      profile: {
        ...profile,
        sections: [
          {
            type: 'role',
            label: 'Career',
            entries: Array.from({ length: 11 }, (_, i) => ({
              id: `role-${i}`,
              title: `Role ${i}`,
              org: 'Nile Robotics',
              start_date: '2020-01-01',
              end_date: null,
            })),
          },
        ],
        counts: { records: 11, skills: 0 },
      },
    });
    const user = userEvent.setup();
    await renderPerson();

    const evidence = screen.getByRole('region', { name: /^Profile 11 records$/ });
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(8);
    const more = within(evidence).getByRole('button', { name: 'Show all 11 of career' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(11);
    expect(
      within(evidence).getByRole('button', { name: 'Show first 8 of career' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists logged interactions rather than stacking bare links', async () => {
    serve({
      record: {
        ...record,
        edges: [{ id: 'e1', src: 'i1', dst: 'person-1', type: 'WITH', props: {} }],
        neighbors: {
          i1: {
            id: 'i1',
            type: 'interaction',
            title: 'Coffee',
            props: { kind: 'coffee', occurred_at: '2026-08-01T00:00:00.000Z' },
          },
        },
      },
    });
    await renderPerson();

    const list = screen.getByRole('list', { name: 'Logged interactions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps deletion recovery in the confirmation when moving to Trash fails', async () => {
    mockApi.delete.mockRejectedValue(new Error('Trash is temporarily unavailable'));
    const user = userEvent.setup();
    await renderPerson();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Move to trash' }));

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Couldn’t move this person to Trash')).toBeVisible();
    expect(within(dialog).getByText(/Trash is temporarily unavailable/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Move to trash' })).toBeEnabled();
  });
});
