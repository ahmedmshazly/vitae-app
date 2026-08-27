/**
 * Four states are four screens (NFR-REL-004), and this one has a distinction
 * the rest of the app does not: a dossier that breaks its grammar is not a
 * failed load. The compiled view is offered either way, the violations are
 * named work rather than an error, and the two kinds of trouble are told apart
 * exactly as the server tells them apart.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api.js';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { DossierEditor } from './DossierEditor.js';

vi.mock('../components/EntityPicker.js', () => ({
  EntityPicker: () => <button type="button">Pick a record</button>,
}));

const AUDIENCES = {
  audiences: [
    {
      audience: 'promotion_review',
      sections: [
        {
          id: 'scope',
          heading: 'Scope',
          purpose: 'What you were responsible for.',
          admits: ['role'],
          admitsAtoms: false,
          minClaims: 1,
          maxClaims: 6,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: null,
          required: true,
        },
        {
          id: 'impact',
          heading: 'Impact',
          purpose: 'What changed because of the work.',
          admits: ['project'],
          admitsAtoms: false,
          minClaims: 2,
          maxClaims: 12,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: null,
          required: true,
        },
      ],
    },
  ],
};

const LIVE = {
  kind: 'node',
  id: 'n1',
  presence: 'live',
  type: 'project',
  label: 'Atlas rewrite',
  source: 'manual',
  confidence: 0.9,
  revisions: [],
};

const SCOPE_SECTION = {
  grammar_id: 'scope',
  claims: [{ id: 'c1', text: 'I owned the Atlas rewrite.', cites: [{ kind: 'node', id: 'n1' }] }],
};

function compiled(over: Record<string, unknown> = {}) {
  return {
    dossier: {
      id: 'd1',
      subject_node: 'p1',
      audience: 'promotion_review',
      title: '2026 promotion packet',
      sections: [SCOPE_SECTION],
      tex_key: null,
      pdf_key: null,
      rev: 3,
      deleted_at: null,
      created_at: '2026-01-04T09:00:00.000Z',
      updated_at: '2026-05-19T09:00:00.000Z',
    },
    subject: { id: 'p1', title: 'Ada Lovelace' },
    sections: [
      {
        grammar_id: 'scope',
        heading: 'Scope',
        purpose: 'What you were responsible for.',
        claims: [{ id: 'c1', text: 'I owned the Atlas rewrite.', cites: [LIVE] }],
      },
    ],
    appendix: [LIVE],
    violations: [],
    blocking: false,
    ...over,
  };
}

/** Answer the grammar one way and the compile another. */
function answers(audiences: unknown, compile: unknown) {
  mockApi.get.mockImplementation((path: string) => {
    const value = path.startsWith('/dossiers/audiences') ? audiences : compile;
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

function renderEditor() {
  return renderWithApp(
    <Routes>
      <Route path="/career/dossiers/:id" element={<DossierEditor />} />
    </Routes>,
    { route: '/career/dossiers/d1' },
  );
}

beforeEach(() => {
  resetMockApi();
});

describe('DossierEditor states', () => {
  it('keeps a loading frame while the dossier is on its way', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderEditor();

    expect(screen.getByLabelText('Loading this dossier')).toBeInTheDocument();
    expect(screen.queryByText('No records cited yet')).not.toBeInTheDocument();
  });

  it('reports a failed compile instead of an empty document', async () => {
    answers(AUDIENCES, new Error('compile service unavailable'));
    renderEditor();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t compile this dossier');
    expect(alert).toHaveTextContent('compile service unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No records cited yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing to compile yet')).not.toBeInTheDocument();
  });

  it('says a deleted dossier is gone rather than offering to retry it', async () => {
    answers(AUDIENCES, new ApiError(404, 'NOT_FOUND', 'dossier not found'));
    renderEditor();

    expect(await screen.findByText('This dossier no longer exists')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dossiers' })).toHaveAttribute(
      'href',
      '/career/dossiers',
    );
  });

  it('offers the compiled view even when the packet is not yet a document', async () => {
    answers(
      AUDIENCES,
      compiled({
        blocking: true,
        violations: [
          {
            rule: 'missing_required_section',
            section: 'impact',
            message: 'Impact is required and is not in this dossier.',
          },
        ],
      }),
    );
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    expect(screen.getByText('This is a selection, not yet a document')).toBeInTheDocument();
    // Named work, with the section it belongs to, not a wall of red.
    const work = screen.getByRole('list', { name: 'Outstanding work on this dossier' });
    const rows = within(work).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('missing required section');
    expect(rows[0]).toHaveTextContent('Impact');
    expect(rows[0]).toHaveTextContent('Impact is required and is not in this dossier.');

    // The half that is already right is still on screen.
    expect(screen.getByRole('list', { name: 'Scope, as compiled' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Provenance appendix' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tells a withdrawn record apart from a packet that will not compile', async () => {
    answers(
      AUDIENCES,
      compiled({
        blocking: false,
        violations: [
          {
            rule: 'citation_missing',
            section: 'scope',
            claim: 'c1',
            message: 'A cited record no longer exists.',
          },
        ],
      }),
    );
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    expect(
      screen.getByText('The document compiles, with evidence a reader cannot follow'),
    ).toBeInTheDocument();
    expect(screen.queryByText('This is a selection, not yet a document')).not.toBeInTheDocument();
  });

  it('says so when nothing is outstanding', async () => {
    answers(AUDIENCES, compiled());
    renderEditor();

    expect(await screen.findByText('This dossier satisfies its grammar')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Outstanding work on this dossier' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the compiled document readable when the grammar could not be loaded', async () => {
    answers(new Error('grammar unavailable'), compiled());
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    expect(screen.getByText(/Couldn’t load this audience/)).toBeInTheDocument();
    expect(screen.getByText('grammar unavailable')).toBeInTheDocument();
    // No local copy stands in for the grammar, and the form is gone with it.
    expect(screen.queryByRole('group', { name: 'Add an entry to Scope' })).not.toBeInTheDocument();
    // The document carries its own headings, so it survives.
    expect(screen.getByRole('list', { name: 'Scope, as compiled' })).toBeInTheDocument();
  });

  it('refuses a stale edit and says the other change was kept', async () => {
    answers(AUDIENCES, compiled());
    mockApi.patch.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'dossier was modified elsewhere, reload and retry'),
    );
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove entry 1 from Scope' }));

    expect(
      await screen.findByText('This dossier was changed somewhere else'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/dossier was modified elsewhere, reload and retry/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload it' })).toBeInTheDocument();
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
