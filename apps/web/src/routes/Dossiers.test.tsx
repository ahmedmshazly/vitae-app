/**
 * The dossier list and the door to a new one. The audience decides the shape of
 * the document that follows, so the choice is made with the sections and their
 * purposes in view, and those come from the server rather than from a copy in
 * the browser.
 */
import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { runAxe } from '../test/a11y.js';
import { renderWithApp } from '../test/render.js';
import { Dossiers } from './Dossiers.js';

const SELF = { self: { id: 'p1', title: 'Ada Lovelace' } };

const AUDIENCES = {
  audiences: [
    {
      audience: 'promotion_review',
      sections: [
        {
          id: 'scope',
          heading: 'Scope',
          purpose: 'What you were responsible for, and how far it reached.',
          admits: ['role'],
          admitsAtoms: false,
          minClaims: 1,
          maxClaims: 6,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: null,
          required: true,
        },
      ],
    },
    {
      audience: 'petition_exhibits',
      sections: [
        {
          id: 'exhibits',
          heading: 'Exhibits',
          purpose: 'One numbered entry per document.',
          admits: 'any',
          admitsAtoms: false,
          minClaims: 3,
          maxClaims: 40,
          minCitationsPerClaim: 1,
          maxCitationsPerClaim: 1,
          required: true,
        },
      ],
    },
  ],
};

const DOSSIERS = {
  dossiers: [
    {
      id: 'd1',
      subject_node: 'p1',
      audience: 'promotion_review',
      title: '2026 promotion packet',
      sections: [{ grammar_id: 'scope', claims: [{ id: 'c1', text: 'One.', cites: [] }] }],
      tex_key: null,
      pdf_key: null,
      rev: 2,
      deleted_at: null,
      created_at: '2026-01-04T09:00:00.000Z',
      updated_at: '2026-05-19T09:00:00.000Z',
    },
    {
      id: 'd2',
      subject_node: 'p1',
      audience: 'petition_exhibits',
      title: 'Exhibit bundle',
      sections: [],
      tex_key: null,
      pdf_key: null,
      rev: 1,
      deleted_at: null,
      created_at: '2026-01-02T09:00:00.000Z',
      updated_at: '2026-02-02T09:00:00.000Z',
    },
  ],
};

function route(path: string): unknown {
  if (path.startsWith('/auth/me')) return SELF;
  if (path.startsWith('/dossiers/audiences')) return AUDIENCES;
  if (path.startsWith('/dossiers')) return DOSSIERS;
  throw new Error(`unexpected GET ${path}`);
}

function renderList() {
  return renderWithApp(
    <Routes>
      <Route path="/career/dossiers" element={<Dossiers />} />
      <Route path="/career/dossiers/:id" element={<h1>Dossier editor</h1>} />
    </Routes>,
    { route: '/career/dossiers' },
  );
}

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockImplementation((path: string) => Promise.resolve(route(path)));
});

describe('Dossiers', () => {
  it('asks only for the dossiers whose subject is the self record', async () => {
    renderList();
    await screen.findByRole('link', { name: '2026 promotion packet' });

    expect(mockApi.get).toHaveBeenCalledWith('/dossiers?subjectNode=p1');
  });

  it('names each dossier, its audience in words, and how much is in it', async () => {
    renderList();

    const list = await screen.findByRole('list', {
      name: 'Dossiers, most recently changed first',
    });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    expect(within(rows[0]!).getByRole('link', { name: '2026 promotion packet' })).toHaveAttribute(
      'href',
      '/career/dossiers/d1',
    );
    expect(rows[0]).toHaveTextContent('Promotion review');
    expect(rows[0]).toHaveTextContent('about Ada Lovelace');
    expect(rows[0]).toHaveTextContent('1 section');
    expect(rows[0]).toHaveTextContent('1 entry');
    expect(rows[0]).toHaveTextContent('2026-05-19');

    // Never the raw audience key, which is what a reader would have to decode.
    expect(rows[1]).toHaveTextContent('Petition exhibits');
    expect(screen.queryByText('petition_exhibits')).not.toBeInTheDocument();
  });

  it('shows what each audience would ask for before the choice is made', async () => {
    renderList();
    await screen.findByRole('link', { name: '2026 promotion packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));

    const sections = await screen.findByRole('list', {
      name: 'Sections of a Promotion review dossier',
    });
    expect(within(sections).getByText('Scope')).toBeInTheDocument();
    expect(
      within(sections).getByText('What you were responsible for, and how far it reached.'),
    ).toBeInTheDocument();
    expect(within(sections).getByText('required')).toBeInTheDocument();

    expect(
      screen.getByRole('list', { name: 'Sections of a Petition exhibits dossier' }),
    ).toBeInTheDocument();
  });

  it('has no axe violations with the audience chooser open', async () => {
    const { container } = renderList();
    await screen.findByRole('link', { name: '2026 promotion packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));
    await screen.findByRole('textbox', { name: 'Title' });

    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('creates the dossier the operator described and opens it', async () => {
    mockApi.post.mockResolvedValue({ dossier: { id: 'd9' } });
    renderList();
    await screen.findByRole('link', { name: '2026 promotion packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));

    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'Green card exhibits');
    await userEvent.click(screen.getByLabelText('Petition exhibits'));
    await userEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

    expect(mockApi.post).toHaveBeenCalledWith('/dossiers', {
      subject_node: 'p1',
      audience: 'petition_exhibits',
      title: 'Green card exhibits',
      sections: [],
    });
    expect(await screen.findByRole('heading', { name: 'Dossier editor' })).toBeInTheDocument();
  });

  it('sends a window only when both of its dates were given', async () => {
    mockApi.post.mockResolvedValue({ dossier: { id: 'd9' } });
    renderList();
    await screen.findByRole('link', { name: '2026 promotion packet' });
    await userEvent.click(screen.getByRole('button', { name: 'New dossier' }));

    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'Review cycle');
    await userEvent.click(screen.getByLabelText('Promotion review'));
    await userEvent.type(screen.getByLabelText('Window start'), '2025-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

    expect(mockApi.post).not.toHaveBeenCalled();
    expect(
      await screen.findByText('A window needs both a start and an end, or neither.'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Window end'), '2025-12-31');
    await userEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

    expect(mockApi.post).toHaveBeenCalledWith(
      '/dossiers',
      expect.objectContaining({ window: { from: '2025-01-01', to: '2025-12-31' } }),
    );
  });
});

vi.mock('../lib/auth.js', () => ({
  useAuth: () => ({ user: { email: 'o@example.com', via: 'dev' } }),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
