/**
 * Jumping to a page from the keyboard.
 *
 * The palette is the fast path through a corpus too large to scan, so what is
 * under test is that it opens from the keyboard, that arrowing and Enter reach
 * a page, and that a failed index says so instead of looking like a corpus
 * with nothing in it. Its scoring is `docsSearch.test.ts`; its dialog and
 * focus restoration belong to `CommandOverlay` and are tested with it.
 */
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocsApp from './DocsApp.js';
import type { DocsManifest } from './docsModel.js';

const entry = (id: string, route: string, title: string, domain: string) => ({
  id,
  route,
  content: `pages${route.replace('/docs', '')}.json`,
  source: `docs/observatory${route.replace('/docs', '')}.md`,
  title,
  summary: `About ${title.toLowerCase()}.`,
  audience: ['developer'] as const,
  domain,
  section: domain,
  type: 'explanation' as const,
  status: 'verified' as const,
});

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: { developer: { label: 'Developer', note: 'People changing the code.' } },
  domains: [
    { key: 'architecture', title: 'Architecture', summary: 'How it fits.', route: '/docs/architecture', entrance: true, pages: 1 },
    { key: 'operate', title: 'Operate', summary: 'Running it.', route: '/docs/operate', entrance: true, pages: 1 },
  ],
  types: {
    index: { label: 'Section index', note: 'A way in.' },
    explanation: { label: 'Explanation', note: 'Why it is the way it is.' },
  },
  statuses: { verified: { label: 'Verified', tone: 'positive', note: 'Checked.' } },
  pages: [
    entry('ARC-PERSISTENCE', '/docs/architecture/persistence', 'Storage and migrations', 'architecture'),
    entry('OPS-MIGRATE', '/docs/operate/migrations', 'Running database migrations', 'operate'),
  ],
};

const searchText = {
  version: 1,
  pages: [
    { id: 'ARC-PERSISTENCE', headings: [], text: 'A migration is recorded once applied.' },
    { id: 'OPS-MIGRATE', headings: [], text: 'Apply each migration in order.' },
  ],
};

const page = {
  id: 'ARC-PERSISTENCE',
  route: '/docs/architecture/persistence',
  source: 'docs/observatory/architecture/persistence.md',
  title: 'Storage and migrations',
  summary: 'About storage and migrations.',
  audience: ['developer'],
  domain: 'architecture',
  type: 'explanation',
  status: 'verified',
  sources: [],
  requirements: [],
  related: [],
  supersedes: [],
  superseded_by: [],
  headings: [],
  blocks: [{ type: 'paragraph', children: [{ type: 'text', value: 'How storage works.' }] }],
};

const fetchMock = vi.fn();
let failIndex = false;

beforeEach(() => {
  failIndex = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.slice(url.indexOf('docs-content/') + 'docs-content/'.length);
    if (path === 'manifest.json') return { ok: true, status: 200, json: async () => manifest };
    if (path === 'search-text.json') {
      if (failIndex) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => searchText };
    }
    if (path === 'pages/architecture/persistence.json') {
      return { ok: true, status: 200, json: async () => page };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDocs(route = '/docs/operate/migrations') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={[route]}
        >
          <DocsApp />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('jumping to a page', () => {
  it('is not fetched until someone asks for it', async () => {
    renderDocs();
    await screen.findByRole('heading', { level: 1 });
    const asked = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(asked.some((url) => url.includes('search-text.json'))).toBe(false);
  });

  it('opens on a bare slash and lists the corpus before anything is typed', async () => {
    const user = userEvent.setup();
    renderDocs();
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('/');

    expect(await screen.findByRole('combobox', { name: 'Documentation page search' })).toBeInTheDocument();
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
  });

  it('does not open when the slash was typed into a field', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/search');
    const field = await screen.findByLabelText('What are you looking for?');

    await user.click(field);
    await user.keyboard('a/b');

    expect(screen.queryByRole('combobox', { name: 'Documentation page search' })).not.toBeInTheDocument();
    expect(field).toHaveValue('a/b');
  });

  it('narrows to what was typed and opens the highlighted page on Enter', async () => {
    const user = userEvent.setup();
    renderDocs();
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('/');
    await user.type(await screen.findByRole('combobox', { name: 'Documentation page search' }), 'storage');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { level: 1, name: 'Storage and migrations' })).toBeInTheDocument();
  });

  it('moves the highlight with the arrow keys', async () => {
    const user = userEvent.setup();
    renderDocs();
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('/');
    const field = await screen.findByRole('combobox', { name: 'Documentation page search' });
    const [first, second] = await screen.findAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', first!.id);

    await user.keyboard('{ArrowDown}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', second!.id);

    await user.keyboard('{ArrowUp}');
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('says a word matched nothing rather than showing an empty list', async () => {
    const user = userEvent.setup();
    renderDocs();
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('/');
    await user.type(await screen.findByRole('combobox', { name: 'Documentation page search' }), 'kubernetes');

    expect(await screen.findByText(/No page matches/)).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('points at the section list when the index cannot be read', async () => {
    failIndex = true;
    const user = userEvent.setup();
    renderDocs();
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The page index could not be read',
    );
  });
});
