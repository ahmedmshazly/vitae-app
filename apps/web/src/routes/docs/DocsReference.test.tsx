/**
 * Browsing a generated catalog.
 *
 * Two things matter beyond the filtering, which is tested on its own in
 * `docsReference.test.ts`. The first is that the whole query lives in the
 * address, so a filtered catalog is a link. The second is what happens when an
 * artifact is missing or has changed shape: a table that renders empty says the
 * codebase has no routes, which is a lie a reader has no way to detect. It must
 * report that it could not read the file instead.
 */
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocsApp from './DocsApp.js';
import type { DocsManifest } from './docsModel.js';

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: { developer: { label: 'Developer', note: 'People changing the code.' } },
  domains: [
    { key: 'use', title: 'Use', summary: 'Working the product.', route: '/docs/use', entrance: true, pages: 1 },
  ],
  types: { index: { label: 'Section index', note: 'A way in.' } },
  statuses: { verified: { label: 'Verified', tone: 'positive', note: 'Checked.' } },
  pages: [
    {
      id: 'USE',
      route: '/docs/use',
      content: 'pages/use/index.json',
      source: 'docs/observatory/use/index.md',
      title: 'Use',
      summary: 'Working the product.',
      audience: ['developer'],
      domain: 'use',
      section: 'use',
      type: 'index',
      status: 'verified',
    },
  ],
};

const routes = {
  routes: [
    { path: '/career', access: 'private', element: 'Career', lazy: true, block: 'AuthedApp', note: 'The runway.' },
    { path: '/pricing', access: 'public', element: 'Pricing', lazy: false, block: 'App', note: null },
    { path: '/tour', access: 'public', element: 'Tour', lazy: true, block: 'App', note: null },
  ],
};

const fetchMock = vi.fn();
let routesBody: unknown = routes;
let routesOk = true;

beforeEach(() => {
  routesBody = routes;
  routesOk = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.slice(url.indexOf('docs-content/') + 'docs-content/'.length);
    if (path === 'manifest.json') return { ok: true, status: 200, json: async () => manifest };
    if (path === 'reference/routes.json') {
      if (!routesOk) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => routesBody };
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
  useEffect(() => {
    address = `${location.pathname}${location.search}`;
  }, [location]);
  return null;
}

function renderDocs(route: string) {
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

describe('the reference entrance', () => {
  it('lists every catalog and says none of it is written by hand', async () => {
    renderDocs('/docs/reference');
    expect(await screen.findByRole('heading', { level: 1, name: 'Generated reference' })).toBeInTheDocument();
    expect(screen.getByText(/None of it is written by hand/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Routes/ })).toHaveAttribute('href', '/docs/reference/routes');
  });

  it('does not fetch a catalog nobody opened', async () => {
    renderDocs('/docs/reference');
    await screen.findByRole('heading', { level: 1 });
    const asked = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(asked.some((url) => url.includes('reference/'))).toBe(false);
  });

  it('says there is no such catalog rather than showing an empty one', async () => {
    renderDocs('/docs/reference/invented');
    expect(await screen.findByText(/no documentation page at this address/i)).toBeInTheDocument();
  });
});

describe('one catalog', () => {
  it('shows every row and names the artifact it came from', async () => {
    renderDocs('/docs/reference/routes');
    await screen.findByRole('table');
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 shown');
    expect(screen.getByText('routes.json')).toBeInTheDocument();
  });

  it('renders a column for each field the spec names', async () => {
    renderDocs('/docs/reference/routes');
    const table = await screen.findByRole('table');
    for (const heading of ['Path', 'Access', 'Screen', 'Lazy']) {
      expect(within(table).getByRole('columnheader', { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('answers a yes-or-no column with a word', async () => {
    renderDocs('/docs/reference/routes');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Yes').length).toBe(2);
    expect(within(table).getAllByText('No').length).toBe(1);
  });

  it('puts the filter in the address, so a narrowed catalog is a link', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/reference/routes');
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('Filter 3 rows'), 'pricing');

    await waitFor(() => expect(address).toBe('/docs/reference/routes?q=pricing'));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 shown');
  });

  it('answers a filter it was opened with', async () => {
    renderDocs('/docs/reference/routes?access=public');
    await screen.findByRole('table');
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 shown');
  });

  it('narrows by facet and clears back to everything', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/reference/routes');
    await screen.findByRole('table');

    await user.click(screen.getByRole('checkbox', { name: /private/ }));
    await waitFor(() => expect(address).toBe('/docs/reference/routes?access=private'));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 shown');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(address).toBe('/docs/reference/routes'));
  });

  it('says nothing matched rather than showing an empty table', async () => {
    renderDocs('/docs/reference/routes?q=kubernetes');
    expect(await screen.findByText('Nothing in this catalog matches.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('expands a row to the fields no column showed', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/reference/routes');
    await screen.findByRole('table');

    await user.click(screen.getAllByRole('button', { name: /more$/ })[0]!);

    expect(screen.getByText('block')).toBeInTheDocument();
    expect(screen.getByText('The runway.')).toBeInTheDocument();
  });

  it('reports an artifact it could not read', async () => {
    routesOk = false;
    renderDocs('/docs/reference/routes');
    expect(await screen.findByText('Couldn’t load the routes catalog')).toBeInTheDocument();
  });

  it('reports an artifact whose shape changed, rather than an empty table', async () => {
    // A generator renaming its collection would otherwise render as a codebase
    // with no routes in it, which a reader has no way to tell from the truth.
    routesBody = { paths: routes.routes };
    renderDocs('/docs/reference/routes');
    expect(await screen.findByText(/has no "routes" list/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
