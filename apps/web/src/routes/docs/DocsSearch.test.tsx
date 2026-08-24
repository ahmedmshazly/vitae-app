/**
 * Searching, as a reader experiences it.
 *
 * The scoring is tested on its own in `docsSearch.test.ts`. What is under test
 * here is the surface around it: that the whole query lives in the address, so
 * a search can be sent to someone; that narrowing says what it did; and that
 * an index that will not load is reported rather than shown as no results,
 * which is the failure a reader would otherwise read as an answer.
 */
import { StrictMode, useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocsApp from './DocsApp.js';
import type { DocsManifest } from './docsModel.js';

const page = (
  id: string,
  route: string,
  title: string,
  domain: string,
  over: Partial<DocsManifest['pages'][number]> = {},
) => ({
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
  ...over,
});

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: {
    developer: { label: 'Developer', note: 'People changing the code.' },
    operator: { label: 'Operator', note: 'People running it.' },
  },
  domains: [
    { key: 'architecture', title: 'Architecture', summary: 'How it fits together.', route: '/docs/architecture', entrance: true, pages: 2 },
    { key: 'operate', title: 'Operate', summary: 'Running it.', route: '/docs/operate', entrance: true, pages: 1 },
  ],
  types: {
    index: { label: 'Section index', note: 'A way in.' },
    explanation: { label: 'Explanation', note: 'Why it is the way it is.' },
  },
  statuses: {
    verified: { label: 'Verified', tone: 'positive', note: 'Checked against source.' },
  },
  pages: [
    page('ARC', '/docs/architecture', 'Architecture', 'architecture', { type: 'index' }),
    page('ARC-PERSISTENCE', '/docs/architecture/persistence', 'Storage and migrations', 'architecture'),
    page('OPS-MIGRATE', '/docs/operate/migrations', 'Running database migrations', 'operate', {
      audience: ['operator'],
    }),
  ],
};

const searchText = {
  version: 1,
  pages: [
    { id: 'ARC', headings: [], text: 'The system in one view.' },
    {
      id: 'ARC-PERSISTENCE',
      headings: [{ level: 2, id: 'versioning', text: 'Versioning' }],
      text: 'A migration is recorded once it has been applied.',
    },
    { id: 'OPS-MIGRATE', headings: [], text: 'Apply each migration in order and verify it.' },
  ],
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
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let address = '';

function Address() {
  const location = useLocation();
  // In an effect, not during render: the address is read by assertions after
  // the commit, and writing it during render would record a route the reader
  // never actually reached if React discarded the attempt.
  useEffect(() => {
    address = `${location.pathname}${location.search}`;
  }, [location]);
  return null;
}

function renderSearch(route = '/docs/search') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={[route]}
        >
          <Address />
          <DocsApp />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('searching the corpus', () => {
  it('waits for a query rather than listing everything', async () => {
    renderSearch();
    expect(await screen.findByText('Type to search the corpus.')).toBeInTheDocument();
    expect(screen.getByText(/3 pages are indexed/)).toBeInTheDocument();
  });

  it('puts the query in the address, so a search can be sent to someone', async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.type(await screen.findByLabelText('What are you looking for?'), 'migration');

    await waitFor(() => expect(address).toBe('/docs/search?q=migration'));
    expect(await screen.findByRole('link', { name: /Running database migrations/ })).toBeInTheDocument();
  });

  it('answers a query it was opened with', async () => {
    renderSearch('/docs/search?q=migration');
    const results = await screen.findByRole('link', { name: /Running database migrations/ });
    expect(results).toHaveAttribute('href', '/docs/operate/migrations');
    expect(screen.getByRole('status')).toHaveTextContent('2 pages');
  });

  it('narrows by facet and records the narrowing in the address', async () => {
    const user = userEvent.setup();
    renderSearch('/docs/search?q=migration');
    await screen.findByRole('link', { name: /Running database migrations/ });

    await user.click(screen.getByRole('checkbox', { name: /Operate/ }));

    await waitFor(() => expect(address).toBe('/docs/search?q=migration&domain=operate'));
    expect(screen.getByRole('status')).toHaveTextContent('1 page after filtering');
    expect(screen.queryByRole('link', { name: /Storage and migrations/ })).not.toBeInTheDocument();
  });

  it('counts what a facet would give, not what is showing', async () => {
    renderSearch('/docs/search?q=migration&domain=operate');
    await screen.findByRole('link', { name: /Running database migrations/ });
    // One result is displayed, and the panel still says the other section has
    // a page in it, so the reader can see what the filter is excluding.
    expect(screen.getByRole('checkbox', { name: /Architecture/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Storage and migrations/ })).not.toBeInTheDocument();
  });

  it('offers to clear the filters when they are what emptied the results', async () => {
    const user = userEvent.setup();
    renderSearch('/docs/search?q=migration&audience=operator&domain=architecture');
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await waitFor(() => expect(address).toBe('/docs/search?q=migration'));
  });

  it('names the words it could not find', async () => {
    renderSearch('/docs/search?q=migration kubernetes');
    expect(await screen.findByText(/No page contains “kubernetes”/)).toBeInTheDocument();
  });

  it('says the index could not be read rather than showing no results', async () => {
    failIndex = true;
    renderSearch('/docs/search?q=migration');
    expect(await screen.findByText('Couldn’t load the search index')).toBeInTheDocument();
  });

  it('reads the index without a session', async () => {
    renderSearch('/docs/search?q=migration');
    await screen.findByRole('link', { name: /Running database migrations/ });
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual({ credentials: 'omit' });
    }
  });
});
