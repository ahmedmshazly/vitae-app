/**
 * The documentation surface's reported states, and the way through it.
 *
 * This route mounts above the authentication wildcard and outside `Shell`, so
 * a reader arrives with no session, no API and none of the app's chrome. Every
 * failure it can have therefore has to be said on the page itself, and every
 * way out has to be one it draws.
 *
 * The structural claim under test is the split boundary: the manifest decides
 * whether a page exists, and the page's own content is a second, separate
 * request. That is what lets a title, a breadcrumb and the reading-order links
 * render while the prose is still in flight — and what makes a failed prose
 * fetch a compact banner inside the article rather than a blank screen.
 */
import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { runAxe } from '../../test/a11y.js';
import DocsApp from './DocsApp.js';
import type { DocsManifest, DocsPageContent } from './docsModel.js';

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: {
    developer: { label: 'Developer', note: 'People changing the code.' },
    operator: { label: 'Operator', note: 'People running it.' },
  },
  domains: [
    {
      key: 'meta',
      title: 'About these documents',
      summary: 'How the corpus is built and checked.',
      route: '/docs/meta',
      entrance: true,
      pages: 3,
    },
    {
      key: 'operate',
      title: 'Running Vitae',
      summary: 'Deploying, backing up and recovering.',
      route: '/docs/operate',
      entrance: false,
      pages: 0,
    },
  ],
  types: {
    index: { label: 'Section index', note: 'A way in.' },
    explanation: { label: 'Explanation', note: 'Why it is the way it is.' },
  },
  statuses: {
    verified: { label: 'Verified', tone: 'positive', note: 'Checked against source.' },
    deprecated: { label: 'Deprecated', tone: 'caution', note: 'Kept so links resolve.' },
  },
  pages: [
    {
      id: 'DOCS-HOME',
      route: '/docs',
      content: 'pages/index.json',
      source: 'docs/observatory/index.md',
      title: 'Vitae documentation',
      summary: 'Everything written down about Vitae.',
      audience: ['developer'],
      domain: 'meta',
      section: null,
      type: 'index',
      status: 'verified',
      verified_at: '2026-08-24',
    },
    {
      id: 'META-INDEX',
      route: '/docs/meta',
      content: 'pages/meta/index.json',
      source: 'docs/observatory/meta/index.md',
      title: 'About these documents',
      summary: 'How the corpus is built and checked.',
      audience: ['developer', 'operator'],
      domain: 'meta',
      section: 'meta',
      type: 'index',
      status: 'verified',
    },
    {
      id: 'META-COVERAGE',
      route: '/docs/meta/coverage',
      content: 'pages/meta/coverage.json',
      source: 'docs/observatory/meta/coverage.md',
      title: 'Coverage and contradictions',
      summary: 'What is documented, and where the documents disagree.',
      audience: ['developer'],
      domain: 'meta',
      section: 'meta',
      type: 'explanation',
      status: 'verified',
      verified_at: '2026-08-24',
    },
    {
      id: 'META-OLD',
      route: '/docs/meta/old',
      content: 'pages/meta/old.json',
      source: 'docs/observatory/meta/old.md',
      title: 'An earlier note',
      summary: 'Replaced, and kept so old links still work.',
      audience: ['developer'],
      domain: 'meta',
      section: 'meta',
      type: 'explanation',
      status: 'deprecated',
    },
  ],
};

function content(over: Partial<DocsPageContent> & Pick<DocsPageContent, 'id'>): DocsPageContent {
  const summary = manifest.pages.find((p) => p.id === over.id)!;
  // `id` is deliberately absent here: `over` always carries it, and repeating
  // it above the spread is a property TypeScript reports as overwritten.
  return {
    route: summary.route,
    source: summary.source,
    title: summary.title,
    summary: summary.summary,
    audience: summary.audience,
    domain: summary.domain,
    type: summary.type,
    status: summary.status,
    verified_at: summary.verified_at,
    sources: [],
    requirements: [],
    related: [],
    supersedes: [],
    superseded_by: [],
    headings: [],
    blocks: [],
    ...over,
  };
}

const pages: Record<string, DocsPageContent> = {
  'pages/index.json': content({
    id: 'DOCS-HOME',
    blocks: [{ type: 'paragraph', children: [{ type: 'text', value: 'Start anywhere.' }] }],
  }),
  'pages/meta/index.json': content({
    id: 'META-INDEX',
    blocks: [{ type: 'paragraph', children: [{ type: 'text', value: 'What the corpus is.' }] }],
  }),
  'pages/meta/coverage.json': content({
    id: 'META-COVERAGE',
    sources: ['scripts/check-docs-coverage.mjs'],
    // Deliberately not a real identifier, and deliberately missing the three
    // digits a real one ends with. gen-traceability.mjs reads every tracked
    // file, so a correctly spelled identifier here would be recorded as a
    // citation, and the register would hold this test up as evidence for a
    // requirement it does not exercise. This keeps the shape the rail has to
    // render without entering the citation grammar — which is also why this
    // comment describes that spelling rather than demonstrating it.
    requirements: ['FR-EXAMPLE-ONLY'],
    related: [
      {
        id: 'META-INDEX',
        route: '/docs/meta',
        title: 'About these documents',
        summary: 'How the corpus is built.',
      },
    ],
    headings: [
      { level: 2, id: 'in-short', text: 'In short' },
      { level: 2, id: 'mechanics', text: 'Mechanics' },
    ],
    blocks: [
      { type: 'heading', level: 2, id: 'in-short', text: 'In short', children: [{ type: 'text', value: 'In short' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'Nine checks run in CI.' }] },
      { type: 'heading', level: 2, id: 'mechanics', text: 'Mechanics', children: [{ type: 'text', value: 'Mechanics' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'Each one names what it found.' }] },
    ],
  }),
  'pages/meta/old.json': content({
    id: 'META-OLD',
    superseded_by: [
      {
        id: 'META-COVERAGE',
        route: '/docs/meta/coverage',
        title: 'Coverage and contradictions',
        summary: 'What is documented.',
      },
    ],
    blocks: [{ type: 'paragraph', children: [{ type: 'text', value: 'Kept for its links.' }] }],
  }),
};

type Outcome = { ok: true; body: unknown } | { ok: false; status: number } | { throws: true };

let overrides: Record<string, Outcome>;

/** `/docs/pages/meta/one.json` -> `pages/meta/one.json`. */
function file(path: string): string {
  return path.replace(/^\/docs\//, '');
}

beforeEach(() => {
  overrides = {};
  resetMockApi();
  // The corpus arrives through `api.get`, which is where the session cookie and
  // bearer token live. Mocking that rather than `fetch` is what keeps this
  // suite testing the reader instead of re-testing the transport.
  mockApi.get.mockImplementation(async (requested: string) => {
    const path = file(requested);
    const override = overrides[path];
    if (override && 'throws' in override) throw new TypeError('Failed to fetch');
    if (override && !override.ok) throw new ApiError(override.status, 'ERROR', 'no');
    const body = override?.ok ? override.body : path === 'manifest.json' ? manifest : pages[path];
    if (body === undefined) throw new ApiError(404, 'NOT_FOUND', 'no');
    return body;
  });
});

/**
 * The surface as it really mounts: no Shell, no ToastProvider, no auth — and
 * inside `StrictMode`, because `main.tsx` mounts the application inside one.
 *
 * That last part is not decoration. StrictMode runs every mount effect twice
 * to prove the component survives a remount, and a suite that leaves it out
 * tests a component nobody runs. It is how the title-focus effect below was
 * caught: it passed here and drew a focus ring in the browser.
 */
function renderDocs(route = '/docs') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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

describe('reaching the corpus', () => {
  it('reports that the index is loading before it blames anything', async () => {
    const { container } = renderDocs();
    expect(container.querySelector('[data-query-state="loading"]')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Vitae documentation',
    );
  });

  it('says the index itself could not be read, and offers the way to retry', async () => {
    overrides['manifest.json'] = { throws: true };
    renderDocs();
    expect(await screen.findByText('Couldn’t load the documentation')).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t reach the documentation index/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // The corpus is private. Every read goes through the authenticated client, so
  // a reader without the owner's session gets nothing — see docsContent.test.ts
  // for what each refusal says.
  it('reads the corpus through the authenticated API, not from a public file', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    const asked = mockApi.get.mock.calls.map((call) => String(call[0]));
    expect(asked).toContain('/docs/manifest.json');
    expect(asked.every((path) => path.startsWith('/docs/'))).toBe(true);
  });
});

describe('a path the corpus does not publish', () => {
  it('names the address it could not find and offers the one link that works', async () => {
    renderDocs('/docs/meta/renamed');
    expect(
      await screen.findByText('There is no documentation page at this address.'),
    ).toBeInTheDocument();
    expect(screen.getByText('/docs/meta/renamed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the documentation home' })).toHaveAttribute(
      'href',
      '/docs',
    );
  });
});

describe('a page whose prose fails', () => {
  // The whole reason the manifest and the page are two requests: the header
  // and the way onward come from the manifest, so they survive a failed body.
  it('keeps the title, the breadcrumb and the reading order beside the failure', async () => {
    overrides['pages/meta/coverage.json'] = { ok: false, status: 500 };
    renderDocs('/docs/meta/coverage');

    expect(
      await screen.findByText('Couldn’t load “Coverage and contradictions”'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Coverage and contradictions',
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'About these documents',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Reading order' })).getByText(
        'About these documents',
      ),
    ).toBeInTheDocument();
  });
});

describe('a page that loaded', () => {
  it('renders its prose, its status and who it is written for', async () => {
    renderDocs('/docs/meta/coverage');
    expect(await screen.findByText('Nine checks run in CI.')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('2026-08-24')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Written for' })).getByText('Developer'),
    ).toBeInTheDocument();
  });

  // Types and audiences used to be records of bare strings while statuses were
  // records of objects, so the header had no way to tell a name from a
  // definition and printed the definition. The whole sentence is asserted
  // absent, because a `/Explanation/` match would pass against it.
  it('names the kind of page it is, rather than defining the kind', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    expect(screen.getByText('Explanation')).toBeInTheDocument();
    expect(screen.queryByText('Why it is the way it is.')).not.toBeInTheDocument();
  });

  // "security" beside a status badge reads as a subject, not as a reader. The
  // legend is on the page rather than only in the accessibility tree, so the
  // people who were guessing are the ones who stop.
  it('labels the audience row in words anyone can see', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    const legend = screen.getByText('Written for');
    // Deliberately not `toBeVisible`. Everything a QueryBoundary renders sits
    // inside a `motion.div` that mounts at opacity 0 and animates up, and
    // jsdom does not reliably flush that frame — so `toBeVisible` on any
    // loaded content measures the entrance animation rather than the element.
    // What this test is actually about is that the legend is text on the page
    // and not an aria-label nobody can see, which these two assertions say
    // exactly.
    expect(legend).not.toHaveClass('u-visually-hidden');
    expect(legend.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('list', { name: 'Written for' })).toHaveAttribute(
      'aria-labelledby',
      legend.id,
    );
  });

  it('shows what the page was checked against, and where it is written', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    expect(screen.getByText('scripts/check-docs-coverage.mjs')).toBeInTheDocument();
    expect(screen.getByText('FR-EXAMPLE-ONLY')).toBeInTheDocument();
    expect(screen.getByText('docs/observatory/meta/coverage.md')).toBeInTheDocument();
  });

  it('lists its own headings, and nothing when there are too few to navigate', async () => {
    renderDocs('/docs/meta/coverage');
    const toc = await screen.findByRole('navigation', { name: 'On this page' });
    expect(within(toc).getByRole('link', { name: 'In short' })).toHaveAttribute('href', '#in-short');

    renderDocs('/docs/meta');
    await screen.findByText('What the corpus is.');
    expect(screen.queryAllByRole('navigation', { name: 'On this page' })).toHaveLength(1);
  });

  it('says plainly when a page has been replaced, and links the replacement', async () => {
    renderDocs('/docs/meta/old');
    expect(await screen.findByText('This page has been replaced')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read Coverage and contradictions' }),
    ).toHaveAttribute('href', '/docs/meta/coverage');
  });

  // A link to `#anchor` on another page arrives with the hash already set and
  // no element to match it yet, so the scroll has to wait for the prose that
  // carries the heading rather than firing on mount and landing nowhere.
  it('lands on the section a deep link names, once the prose exists', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      renderDocs('/docs/meta/coverage#mechanics');
      await screen.findByText('Each one names what it found.');
      await waitFor(() => expect(scrolled.at(-1)).toHaveAttribute('id', 'mechanics'));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('titles the browser tab after the page, not after the app', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    await waitFor(() =>
      expect(document.title).toBe('Coverage and contradictions · Vitae documentation'),
    );
  });

  // The corpus entrance carries the suffix as its own title, so appending it
  // unconditionally named the tab twice over.
  it('does not repeat the suffix on the page already called that', async () => {
    renderDocs('/docs');
    await screen.findByText('Start anywhere.');
    await waitFor(() => expect(document.title).toBe('Vitae documentation'));
  });

  // Focus is moved to the title so a client-side navigation is audible. A
  // first render is not a navigation: doing it on mount drew a ring around the
  // title of every page opened from a pasted link, and pushed the first Tab
  // past the skip link.
  //
  // `renderDocs` mounts inside StrictMode, so this runs the mount effect twice
  // the way a real browser does. The guard it replaced — a ref set to true on
  // the first pass — passed a single-pass render and failed the double one.
  it('does not take focus on the first page a reader opens', async () => {
    renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  // On a wide screen the rail is a right-hand column and this is invisible.
  // On a phone the column collapses into document order, and with the rail
  // first the measured distance from the title to the first sentence was
  // 1,748px — two and a half screens of table of contents. A screen reader
  // heard "checked against" before the page had said anything.
  it('puts the article before the rail that describes it', async () => {
    renderDocs('/docs/meta/coverage');
    const prose = await screen.findByRole('heading', { level: 2, name: 'Mechanics' });
    const provenance = screen.getByRole('heading', { level: 2, name: 'Checked against' });
    expect(prose.compareDocumentPosition(provenance) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('finding the way', () => {
  it('marks the page being read in the section rail', async () => {
    renderDocs('/docs/meta/coverage');
    const nav = await screen.findByRole('navigation', { name: 'Documentation sections' });
    expect(within(nav).getByRole('link', { name: 'Coverage and contradictions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  // A rail listing every page of every section is a rail nobody scans.
  it('opens only the section being read, and names a section with no entrance', async () => {
    renderDocs('/docs/meta/coverage');
    const nav = await screen.findByRole('navigation', { name: 'Documentation sections' });
    expect(within(nav).getByText('Coverage and contradictions')).toBeInTheDocument();
    expect(within(nav).getByText('Running Vitae')).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Running Vitae' })).toBeNull();
  });

  it('lists the sections at the corpus entrance and the pages at a section entrance', async () => {
    renderDocs();
    await screen.findByText('Start anywhere.');
    expect(screen.getByRole('heading', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByText('3 pages')).toBeInTheDocument();

    renderDocs('/docs/meta');
    await screen.findByText('What the corpus is.');
    expect(screen.getByRole('heading', { name: 'In this section' })).toBeInTheDocument();
  });

  // A client-side navigation replaces the document silently. Moving focus to
  // the new title is what makes the change audible and puts the keyboard at
  // the top of the new page.
  it('moves focus to the new title when the reader follows a link', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/meta');
    await screen.findByText('What the corpus is.');

    const nav = screen.getByRole('navigation', { name: 'Documentation sections' });
    await user.click(within(nav).getByRole('link', { name: 'Coverage and contradictions' }));

    await screen.findByText('Nine checks run in CI.');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
    );
  });

  it('warms the next page before the reader asks for it', async () => {
    const user = userEvent.setup();
    renderDocs('/docs/meta');
    await screen.findByText('What the corpus is.');
    mockApi.get.mockClear();

    const nav = screen.getByRole('navigation', { name: 'Documentation sections' });
    await user.hover(within(nav).getByRole('link', { name: 'Coverage and contradictions' }));

    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith('/docs/pages/meta/coverage.json'),
    );
  });

  // The two identifier assertions here are the ones that passed for the whole
  // time the skip link did not work. A link pointing at `#main-content` and a
  // `main` carrying that id agree with each other and still skip nothing: a
  // browser moves focus to a fragment target only when the target can hold
  // focus, so without `tabIndex={-1}` the page scrolled, focus stayed on the
  // link, and the next Tab went back to the masthead the reader was escaping.
  // Measured in Chrome against the built bundle before the fix: activating the
  // link left `document.activeElement` on `body`. jsdom does not implement
  // fragment focus at all, so what is asserted is the precondition a browser
  // needs, plus that focus lands when it is placed.
  it('offers a way past the section rail, and a way back into the app', async () => {
    renderDocs();
    await screen.findByText('Start anywhere.');
    expect(screen.getByRole('link', { name: 'Skip to the page' })).toHaveAttribute(
      'href',
      '#main-content',
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    main.focus();
    expect(main).toHaveFocus();

    expect(screen.getByRole('link', { name: 'Vitae' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Entity reference' })).toHaveAttribute(
      'href',
      '/reference/entities',
    );
  });

  // The address a reader is most likely to arrive at from a stale link is the
  // one that renders no page, and it renders its own `main`. A skip link that
  // works on every page but that one sends the reader nowhere exactly when
  // they have the least idea where they are.
  it('keeps the skip link working on the page that does not exist', async () => {
    renderDocs('/docs/nowhere');
    await screen.findByText('There is no documentation page at this address.');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    main.focus();
    expect(main).toHaveFocus();
  });
});

describe('accessibility', () => {
  it('has no violations on a loaded page', async () => {
    const { container } = renderDocs('/docs/meta/coverage');
    await screen.findByText('Nine checks run in CI.');
    await act(async () => {});
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('has no violations on the not-found state', async () => {
    const { container } = renderDocs('/docs/nowhere');
    await screen.findByText('There is no documentation page at this address.');
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
