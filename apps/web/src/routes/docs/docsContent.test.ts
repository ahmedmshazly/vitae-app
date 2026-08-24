/**
 * What a failed read says out loud, and what it never sends.
 *
 * The corpus is public static JSON, so the interesting behaviour here is not
 * the happy path. It is the two failure messages, which are the only thing a
 * reader sees when a build shipped without its content, and the absence of
 * credentials on a request that has no business carrying any.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docsAsset, manifestQueryOptions, pageQueryOptions } from './docsContent.js';
import type { DocsPageSummary } from './docsModel.js';

const page: DocsPageSummary = {
  id: 'ONE',
  route: '/docs/meta/one',
  content: 'pages/meta/one.json',
  source: 'docs/observatory/meta/one.md',
  title: 'First',
  summary: 'A summary.',
  audience: ['developer'],
  domain: 'meta',
  section: 'meta',
  type: 'explanation',
  status: 'verified',
};

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
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
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
    const options = pageQueryOptions(page);
    expect(options.queryKey).toEqual(['docs', 'page', 'ONE']);
    await expect(options.queryFn()).rejects.toThrow(/“First” is not available \(500\)/);
  });

  it('caches the corpus forever, because a build artifact cannot change mid-visit', () => {
    expect(manifestQueryOptions().staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(pageQueryOptions(page).staleTime).toBe(Number.POSITIVE_INFINITY);
  });
});
