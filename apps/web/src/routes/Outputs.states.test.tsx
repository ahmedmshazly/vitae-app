/**
 * Outputs register: the states this screen used to keep to itself. A failed
 * load read as an empty archive, a failed refresh would have blanked the
 * register, every action reported nothing while it ran, and a row's controls
 * shared two names across the whole list.
 */
import './../test/api-mock.js';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Outputs } from './Outputs.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

const WITH_PDF = {
  id: 'r1',
  name: 'Aurora Staff Engineer',
  target_id: 't1',
  template_key: 'cobalt',
  template_version: '1.2',
  status: 'final',
  pages: 2,
  coverage: { weightedPct: 0.82, gaps: [] },
  created_at: '2026-08-01T09:30:00.000Z',
  updated_at: '2026-08-01T09:30:00.000Z',
  target: { company: 'Northwind', role_title: 'Staff Engineer' },
  artifact_ids: { pdf: 'a1', tex: 'a2' },
  artifacts: [
    { artifact_kind: 'pdf', filename: 'r1.pdf', bytes: 91_000, sha256: 'aa' },
    { artifact_kind: 'tex', filename: 'r1.tex', bytes: 4_000, sha256: 'bb' },
  ],
  selection: { entries: [{ atomId: 'a', text: 'Shipped the ledger', emphasis: 'technical' }] },
};

/** A TeX file and no PDF: the case that used to claim nothing was stored. */
const TEX_ONLY = {
  id: 'r2',
  name: 'Borealis Platform Lead',
  template_key: 'onyx',
  status: 'draft',
  pages: null,
  coverage: null,
  created_at: '2026-07-14T11:05:00.000Z',
  updated_at: '2026-07-14T11:05:00.000Z',
  target: { company: 'Contoso', role_title: 'Platform Lead' },
  artifact_ids: { tex: 'a3' },
  artifacts: [{ artifact_kind: 'tex', filename: 'r2.tex', bytes: 4_096, sha256: 'cc' }],
  selection: { entries: [] },
};

const NO_ARTIFACTS = {
  id: 'r3',
  name: 'Cirrus Data Lead',
  template_key: 'argon',
  status: 'draft',
  pages: null,
  coverage: null,
  created_at: '2026-06-02T08:00:00.000Z',
  updated_at: '2026-06-02T08:00:00.000Z',
  target: { company: 'Fabrikam', role_title: 'Data Lead' },
  artifact_ids: {},
  artifacts: [],
};

const ARCHIVED = {
  ...WITH_PDF,
  id: 'r4',
  name: 'Aurora Staff Engineer, copy',
  deleted_at: '2026-08-05T10:00:00.000Z',
};

const REGISTER = { resumes: [WITH_PDF, TEX_ONLY, NO_ARTIFACTS, ARCHIVED] };

/** Each key may be a value to return or an Error to throw. */
function serve(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/resumes?includeDeleted=true': REGISTER,
    '/resumes/r1': { resume: WITH_PDF },
    '/resumes/r2': { resume: TEX_ONLY },
    '/resumes/r3': { resume: NO_ARTIFACTS },
    '/resumes/r4': { resume: ARCHIVED },
    ...over,
  };
  mockApi.get.mockImplementation(async (path: string) => {
    // Longest key first, so /resumes/r1/artifacts/pdf is not swallowed by
    // /resumes/r1 just because that one was declared earlier.
    const key = Object.keys(table)
      .sort((a, b) => b.length - a.length)
      .find((k) => path.startsWith(k));
    const value = key ? table[key] : {};
    if (value instanceof Error) throw value;
    return value;
  });
}

/** A request that never settles, so a pending state can be read at leisure. */
function hangs() {
  mockApi.post.mockImplementation(() => new Promise(() => {}));
}

function render() {
  return renderWithApp(<Outputs />, { route: '/career/resume/outputs' });
}

beforeEach(() => {
  resetMockApi();
  serve();
});

describe('Outputs states', () => {
  it('reports a failed load instead of offering to tailor a first résumé', async () => {
    serve({ '/resumes?includeDeleted=true': new Error('the output store is unreachable') });
    render();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your outputs");
    expect(alert).toHaveTextContent('the output store is unreachable');
    expect(screen.queryByText('No outputs yet')).not.toBeInTheDocument();
  });

  it('keeps the last register on screen when a refresh fails', async () => {
    const { queryClient } = render();
    await screen.findByRole('list', { name: 'Outputs' });

    serve({ '/resumes?includeDeleted=true': new Error('the output store went away') });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['resumes'] });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't refresh your outputs");
    // The rows that did load are still there, which is the whole point of
    // telling the difference between a first load and a refresh.
    const list = screen.getByRole('list', { name: 'Outputs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the register as a named list, not a run of articles', async () => {
    render();
    const list = await screen.findByRole('list', { name: 'Outputs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps archived outputs out of the live register and counts them anyway', async () => {
    render();
    await screen.findByRole('list', { name: 'Outputs' });

    expect(screen.queryByText('Aurora Staff Engineer, copy')).not.toBeInTheDocument();
    const live = screen.getByRole('status', { name: 'Outputs shown' });
    expect(live).toHaveTextContent('3 of 4 outputs');
  });

  it('announces the count in a live region as the search narrows it', async () => {
    render();
    await screen.findByRole('list', { name: 'Outputs' });

    const live = screen.getByRole('status', { name: 'Outputs shown' });
    expect(live).toHaveAttribute('aria-live', 'polite');

    await userEvent.type(screen.getByLabelText('Search outputs'), 'Aurora');
    expect(live).toHaveTextContent('1 of 4 outputs');
  });

  it('gives every row its own name and drops the duplicate opener', async () => {
    render();
    const openers = await screen.findAllByRole('button', { name: /^Details for / });

    expect(openers).toHaveLength(3);
    const names = openers.map((button) => button.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(3);
    expect(names).toContain('Details for Aurora Staff Engineer, made 2026-08-01 09:30');
  });

  it('says which value each filter is set to, not only which filter it is', async () => {
    render();
    await screen.findByRole('list', { name: 'Outputs' });

    // Radix puts `label` on the trigger as aria-label, which replaces the
    // visible value, so "Filter by status" left the active filter as something
    // only a sighted user could read.
    expect(screen.getByRole('combobox', { name: 'Status: All statuses' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Template: All templates' })).toBeInTheDocument();
  });

  it('marks only the row being rebuilt as busy', async () => {
    hangs();
    render();
    await screen.findByRole('list', { name: 'Outputs' });

    const borealis = screen.getByRole('button', {
      name: 'Rebuild the artifacts for Borealis Platform Lead, made 2026-07-14 11:05',
    });
    await userEvent.click(borealis);

    // The name has to move with the state: an aria-label replaces the visible
    // "Rebuilding...", so without this nothing reached assistive tech.
    const busy = await screen.findByRole('button', {
      name: 'Rebuilding the artifacts for Borealis Platform Lead, made 2026-07-14 11:05',
    });
    expect(busy).toBeDisabled();
    // One shared isPending used to grey out every other row's Rebuild too.
    expect(
      screen.getByRole('button', {
        name: 'Rebuild the artifacts for Cirrus Data Lead, made 2026-06-02 08:00',
      }),
    ).toBeEnabled();
  });

  it('reports the action running in the detail sheet, on the button and in text', async () => {
    hangs();
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Aurora Staff Engineer, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Duplicate' }));

    expect(await within(sheet).findByRole('button', { name: 'Duplicating...' })).toBeDisabled();
    expect(within(sheet).getByRole('status')).toHaveTextContent('Duplicating...');
  });

  it('tells a stored TeX file apart from nothing stored at all', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Borealis Platform Lead, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    // Both facts at once: a TEX button that works, and no PDF behind it. The
    // old copy said "No stored PDF/TeX" beside that very button.
    expect(await within(sheet).findByRole('button', { name: /^TEX/ })).toBeInTheDocument();
    expect(within(sheet).getByText('No stored PDF. Rebuild to compile one.')).toBeInTheDocument();
    expect(within(sheet).queryByText(/Nothing stored yet/)).not.toBeInTheDocument();
  });

  it('says that a stored but empty selection is empty', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Borealis Platform Lead, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    // An empty entries array is not undefined, so `?? fallback` never fired and
    // the group rendered as a heading with nothing under it.
    expect(await within(sheet).findByText('No atom selection stored.')).toBeInTheDocument();
  });

  it('states the absence of a fit loop rather than hiding the group', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Aurora Staff Engineer, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByText('No auto-trim steps. It fit as selected.'),
    ).toBeInTheDocument();
  });

  it('leads the sheet with a definition ledger, not two equal boxes', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Aurora Staff Engineer, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    const target = await within(sheet).findByText('Target role');
    expect(target.tagName).toBe('DT');
    expect(within(sheet).getByText('Company').tagName).toBe('DT');
    expect(within(sheet).getByText('Staff Engineer').tagName).toBe('DD');
  });

  it('does not spin for ever when the detail lookup fails', async () => {
    serve({ '/resumes/r1': new Error('detail unavailable') });
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Details for Aurora Staff Engineer, made/ }),
    );

    const sheet = await screen.findByRole('dialog');
    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this output");
    expect(alert).toHaveTextContent('detail unavailable');
  });

  it('reports a failed artifact fetch once, and lets it be dismissed', async () => {
    render();
    await screen.findByRole('list', { name: 'Outputs' });

    serve({ '/resumes/r1/artifacts/pdf': new Error('artifact store is offline') });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Open the PDF for Aurora Staff Engineer, made 2026-08-01 09:30',
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't open that artifact");
    expect(alert).toHaveTextContent('artifact store is offline');

    await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText("Couldn't open that artifact")).not.toBeInTheDocument();
  });
});
