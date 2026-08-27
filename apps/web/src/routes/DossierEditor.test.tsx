/**
 * The dossier editor and the document it compiles to. The form is grammar
 * driven, and the grammar comes from the server, so what matters here is that
 * every heading, purpose and limit on screen is one the server sent, that a
 * citation in the document leads to the appendix entry behind it, and that an
 * edit stores the whole selection against the revision it was based on.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { runAxe } from '../test/a11y.js';
import { renderWithApp } from '../test/render.js';
import { DossierEditor } from './DossierEditor.js';

vi.mock('../components/EntityPicker.js', () => ({
  EntityPicker: ({ types, onPick }: { types: string[]; onPick: (entity: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onPick({ id: `n-${types[0]}`, type: types[0], title: `A ${types[0]} record` })
      }
    >
      Pick from {types.join(', ')}
    </button>
  ),
}));

const AUDIENCES = {
  audiences: [
    {
      audience: 'promotion_review',
      sections: [
        {
          id: 'scope',
          heading: 'Scope',
          purpose: 'What you were responsible for, and how far it reached.',
          admits: ['role', 'project'],
          admitsAtoms: false,
          minClaims: 1,
          maxClaims: 6,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: null,
          required: true,
        },
        {
          id: 'recognition',
          heading: 'Recognition',
          purpose: 'What people outside your reporting line said, on the record.',
          admits: ['award'],
          admitsAtoms: false,
          minClaims: 0,
          maxClaims: 8,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: null,
          required: false,
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
  revisions: [
    { rev: 1, at: '2025-01-02T00:00:00.000Z', op: 'create', source: 'manual', actor: 'owner' },
  ],
};

const GONE = {
  kind: 'node',
  id: 'n2',
  presence: 'deleted',
  type: 'role',
  label: 'Staff Engineer',
  source: 'manual',
  confidence: 0.6,
  revisions: [],
};

const SCOPE_SECTION = {
  grammar_id: 'scope',
  claims: [
    {
      id: 'c1',
      text: 'I owned the Atlas rewrite.',
      cites: [
        { kind: 'node', id: 'n1' },
        { kind: 'node', id: 'n2' },
      ],
    },
  ],
};

const COMPILED = {
  dossier: {
    id: 'd1',
    subject_node: 'p1',
    audience: 'promotion_review',
    title: '2026 promotion packet',
    window: { from: '2025-01-01', to: '2025-12-31' },
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
      purpose: 'What you were responsible for, and how far it reached.',
      claims: [{ id: 'c1', text: 'I owned the Atlas rewrite.', cites: [LIVE, GONE] }],
    },
  ],
  appendix: [LIVE, GONE],
  violations: [
    {
      rule: 'citation_missing',
      section: 'scope',
      claim: 'c1',
      message: 'A cited record no longer exists, so this entry rests on evidence a reader cannot follow.',
    },
  ],
  blocking: false,
};

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
  mockApi.get.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/dossiers/audiences') ? AUDIENCES : COMPILED),
  );
  mockApi.patch.mockResolvedValue({ dossier: COMPILED.dossier });
});

describe('DossierEditor', () => {
  it('takes every heading, purpose and limit from the published grammar', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    // Twice on purpose: once over the form, telling the author what belongs in
    // the section, and once over the compiled section, telling a reader what
    // the section is for.
    expect(
      screen.getAllByText('What you were responsible for, and how far it reached.'),
    ).toHaveLength(2);
    expect(
      screen.getByText('What people outside your reporting line said, on the record.'),
    ).toBeVisible();
    // Both sections are offered, including the optional one this dossier has
    // nothing in, because an empty section is a thing you can still fill.
    expect(screen.getByText(/Takes role or project records as evidence./)).toBeVisible();
    expect(screen.getByText(/Between 1 and 6 entries./)).toBeVisible();
    expect(screen.getByText(/Up to 8 entries./)).toBeVisible();
    expect(screen.getByText('Nothing in this section yet.')).toBeVisible();
  });

  it('names the subject and the period the dossier speaks to', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/network/people/p1',
    );
    expect(screen.getByText('2025-01-01')).toBeVisible();
    expect(screen.getByText('Promotion review', { exact: false })).toBeVisible();
  });

  it('numbers each citation in the document and points it at the appendix entry', async () => {
    const { container } = renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    const document = screen.getByRole('list', { name: 'Scope, as compiled' });
    const first = within(document).getByRole('link', { name: 'Appendix entry 1, Atlas rewrite' });
    expect(first).toHaveAttribute('href', '#dossier-appendix-1');
    expect(
      within(document).getByRole('link', { name: 'Appendix entry 2, Staff Engineer' }),
    ).toHaveAttribute('href', '#dossier-appendix-2');

    expect(container.querySelector('#dossier-appendix-1')).not.toBeNull();
    expect(container.querySelector('#dossier-appendix-2')).not.toBeNull();
  });

  it('says in the selection that a piece of evidence was withdrawn', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    const entries = screen.getByRole('list', { name: 'Entries under Scope' });
    expect(within(entries).getByText('Atlas rewrite')).toBeVisible();
    expect(within(entries).getByText('Staff Engineer (withdrawn)')).toBeVisible();
    expect(within(entries).getByText(/A cited record no longer exists/)).toBeVisible();
  });

  it('stores a new entry under its section, against the revision it was based on', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    const form = screen.getByRole('group', { name: 'Add an entry to Recognition' });
    await userEvent.type(
      within(form).getByLabelText('The sentence this entry asserts'),
      'The board named the rewrite.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Pick from award' }));
    await userEvent.click(
      within(form).getByRole('button', { name: 'Add this entry to Recognition' }),
    );

    expect(mockApi.patch).toHaveBeenCalledWith('/dossiers/d1', {
      expected_rev: 3,
      sections: [
        SCOPE_SECTION,
        {
          grammar_id: 'recognition',
          claims: [
            {
              id: expect.any(String),
              text: 'The board named the rewrite.',
              cites: [{ kind: 'node', id: 'n-award' }],
            },
          ],
        },
      ],
    });
  });

  it('drops a section the last removal emptied', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove entry 1 from Scope' }));

    expect(mockApi.patch).toHaveBeenCalledWith('/dossiers/d1', {
      expected_rev: 3,
      sections: [],
    });
  });

  it('has no axe violations with a form, a document and an appendix on one page', async () => {
    const { container } = renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('deletes only after the choice is confirmed', async () => {
    mockApi.del.mockResolvedValue({ dossier: COMPILED.dossier });
    renderEditor();
    await screen.findByRole('heading', { name: '2026 promotion packet' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockApi.del).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete this dossier' }));
    expect(mockApi.del).toHaveBeenCalledWith('/dossiers/d1');
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
