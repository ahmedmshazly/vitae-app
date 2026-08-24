/**
 * The questions the manifest answers, and what a failed read says out loud.
 *
 * These helpers are the only place the documentation surface makes a decision
 * about structure — which page a URL is, what comes next, what a breadcrumb
 * contains — so they are tested against a manifest rather than against the
 * real corpus. The corpus grows every commit; the rules do not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DocsManifest,
  audienceMeta,
  breadcrumbs,
  docsAsset,
  domainOf,
  manifestQueryOptions,
  neighbours,
  normalizeDocsRoute,
  pageAtRoute,
  pageById,
  pageQueryOptions,
  sectionEntrance,
  sectionPages,
  statusMeta,
  typeMeta,
} from './docsModel.js';

function page(over: Partial<DocsManifest['pages'][number]>): DocsManifest['pages'][number] {
  return {
    id: 'ID',
    route: '/docs/x',
    content: 'pages/x.json',
    source: 'docs/observatory/x.md',
    title: 'A page',
    summary: 'A summary.',
    audience: ['developer'],
    domain: 'meta',
    section: 'meta',
    type: 'explanation',
    status: 'verified',
    ...over,
  };
}

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: { developer: { label: 'Developer', note: 'People changing the code.' } },
  domains: [
    {
      key: 'meta',
      title: 'About these documents',
      summary: 'How the corpus is built.',
      route: '/docs/meta',
      entrance: true,
      pages: 2,
    },
    {
      key: 'ghost',
      title: 'A section with no entrance',
      summary: 'Declared, not written.',
      route: '/docs/ghost',
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
  },
  pages: [
    page({ id: 'HOME', route: '/docs', title: 'Documentation', section: null, type: 'index' }),
    page({
      id: 'META',
      route: '/docs/meta',
      title: 'About these documents',
      type: 'index',
    }),
    page({ id: 'ONE', route: '/docs/meta/one', title: 'First' }),
    page({ id: 'TWO', route: '/docs/meta/two', title: 'Second' }),
  ],
};

describe('reading a route', () => {
  it('treats a trailing slash as the same page', () => {
    expect(normalizeDocsRoute('/docs/meta/one/')).toBe('/docs/meta/one');
    expect(pageAtRoute(manifest, '/docs/meta/one/')?.id).toBe('ONE');
  });

  it('keeps the root as a single slash rather than an empty string', () => {
    expect(normalizeDocsRoute('/')).toBe('/');
  });

  it('reports an unknown path as no page rather than guessing a near match', () => {
    expect(pageAtRoute(manifest, '/docs/meta/on')).toBeNull();
    expect(pageById(manifest, 'NOPE')).toBeNull();
  });
});

describe('sections', () => {
  it('lists a section without repeating its own entrance', () => {
    expect(sectionPages(manifest, 'meta').map((p) => p.id)).toEqual(['ONE', 'TWO']);
    expect(sectionEntrance(manifest, 'meta')?.id).toBe('META');
  });

  it('has nothing to show for a section with no pages', () => {
    expect(sectionPages(manifest, 'ghost')).toEqual([]);
    expect(sectionEntrance(manifest, 'ghost')).toBeNull();
  });

  it('resolves a domain, and nothing for a page filed at the root', () => {
    expect(domainOf(manifest, 'meta')?.title).toBe('About these documents');
    expect(domainOf(manifest, null)).toBeNull();
    expect(domainOf(manifest, 'missing')).toBeNull();
  });
});

describe('reading order', () => {
  it('gives the first page no previous and the last no next', () => {
    expect(neighbours(manifest, manifest.pages[0]!).previous).toBeNull();
    expect(neighbours(manifest, manifest.pages[3]!).next).toBeNull();
  });

  it('walks the manifest order, not the section tree', () => {
    const { previous, next } = neighbours(manifest, manifest.pages[2]!);
    expect(previous?.id).toBe('META');
    expect(next?.id).toBe('TWO');
  });

  it('returns nothing for a page that is not in the manifest', () => {
    expect(neighbours(manifest, page({ id: 'ORPHAN' }))).toEqual({ previous: null, next: null });
  });
});

describe('breadcrumbs', () => {
  it('is a single crumb at the corpus entrance', () => {
    expect(breadcrumbs(manifest, manifest.pages[0]!)).toEqual([
      { label: 'Documentation', route: '/docs' },
    ]);
  });

  // The section crumb would link to the page the reader is already on.
  it('does not link a section entrance to itself', () => {
    expect(breadcrumbs(manifest, manifest.pages[1]!).map((c) => c.route)).toEqual([
      '/docs',
      '/docs/meta',
    ]);
  });

  it('names the whole trail for a page inside a section', () => {
    expect(breadcrumbs(manifest, manifest.pages[2]!)).toEqual([
      { label: 'Documentation', route: '/docs' },
      { label: 'About these documents', route: '/docs/meta' },
      { label: 'First', route: '/docs/meta/one' },
    ]);
  });
});

describe('status and audience vocabulary', () => {
  it('reads a declared status', () => {
    expect(statusMeta(manifest, 'verified').label).toBe('Verified');
  });

  // A status the content model does not define still has to render something
  // truthful, or one bad frontmatter value blanks a badge on a live page.
  it('falls back to the raw value for a status it does not know', () => {
    const meta = statusMeta(manifest, 'invented');
    expect(meta.label).toBe('invented');
    expect(meta.tone).toBe('neutral');
    expect(meta.note).toMatch(/not one the content model defines/);
  });

  // The page header prints the label and the search facets print the note, so
  // an entry that carried only one of the two would put a definition where a
  // name belongs — which is exactly what it used to do.
  it('reads a declared audience as both a name and a sentence', () => {
    expect(audienceMeta(manifest, 'developer')).toEqual({
      label: 'Developer',
      note: 'People changing the code.',
    });
  });

  it('falls back to the raw key for a term it does not know', () => {
    expect(audienceMeta(manifest, 'nobody').label).toBe('nobody');
    expect(typeMeta(manifest, 'invented').label).toBe('invented');
    expect(typeMeta(manifest, 'invented').note).toMatch(/not one the content model defines/);
  });

  it('reads a declared type', () => {
    expect(typeMeta(manifest, 'index').label).toBe('Section index');
  });
});

describe('fetching compiled content', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads from the content root, which is not the client route prefix', () => {
    expect(docsAsset('manifest.json')).toMatch(/\/docs-content\/manifest\.json$/);
    expect(docsAsset('manifest.json')).not.toMatch(/\/docs\/manifest\.json$/);
  });

  it('sends no credentials with a public read', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => manifest });
    await manifestQueryOptions().queryFn();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('manifest.json'), {
      credentials: 'omit',
    });
  });

  // "Failed to fetch" reaches the screen through QueryBoundary and tells a
  // reader nothing they can act on. These two messages separate "your network"
  // from "this build is incomplete".
  it('says the connection failed when the request never completes', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /Couldn’t reach the documentation index/,
    );
  });

  it('names the status code when the file is not there', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /the documentation index is not available \(404\)/,
    );
  });

  it('quotes the page title when a page fails, so the reader knows which one', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const options = pageQueryOptions(manifest.pages[2]!);
    expect(options.queryKey).toEqual(['docs', 'page', 'ONE']);
    await expect(options.queryFn()).rejects.toThrow(/“First” is not available \(500\)/);
  });

  it('caches the corpus forever, because a build artifact cannot change mid-visit', () => {
    expect(manifestQueryOptions().staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(pageQueryOptions(manifest.pages[2]!).staleTime).toBe(Number.POSITIVE_INFINITY);
  });
});
