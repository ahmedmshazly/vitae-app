/**
 * How the reader asks for a corpus that is no longer public.
 *
 * The corpus moved behind the API's default-deny gate, so the interesting
 * behaviour here is what a refusal says and what every request carries. A
 * reader who is signed out must be told the documentation is private rather
 * than that the build is broken — those send them to entirely different places
 * — and a deployment with no corpus in it is an operator's problem, not theirs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCS_CONTENT_BASE, manifestQueryOptions, pageQueryOptions } from './docsContent.js';
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

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  headers: { get: () => 'application/json' },
  json: async () => body,
});

describe('asking the API for the corpus', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads from the API mount, not from a file beside the application', () => {
    // The static tree is gone. Anything still pointing at `docs-content` would
    // be requesting a path the public host no longer serves — and must not.
    expect(DOCS_CONTENT_BASE).toBe('/docs');
  });

  it('carries the session, because the corpus is behind the owner allow-list', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await manifestQueryOptions().queryFn();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/docs/manifest.json');
    expect(init.credentials).toBe('include');
  });

  it('says the documentation is private when the caller is not the owner', async () => {
    // 401 here is not a broken build, and telling a reader it was one sends
    // them to look at the wrong thing entirely.
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }));
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /documentation is private.*Sign in at \/signin with the account that owns this instance/s,
    );
  });

  it('says the same for a forbidden read', async () => {
    fetchMock.mockResolvedValue(json(403, { error: { code: 'FORBIDDEN', message: 'no' } }));
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(/documentation is private/);
  });

  it('distinguishes a deployment that was built without any corpus', async () => {
    fetchMock.mockResolvedValue(
      json(503, { error: { code: 'DOCS_UNAVAILABLE', message: 'nothing here' } }),
    );
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /No documentation was built into this deployment/,
    );
  });

  it('says the connection failed when the request never completes', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /Couldn't reach the documentation index/,
    );
  });

  it('names the status code when the file is genuinely not there', async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: 'NOT_FOUND', message: 'no' } }));
    await expect(manifestQueryOptions().queryFn()).rejects.toThrow(
      /the documentation index is not available \(404\)/,
    );
  });

  it('quotes the page title when a page fails, so the reader knows which one', async () => {
    fetchMock.mockResolvedValue(json(500, { error: { code: 'ERROR', message: 'no' } }));
    const options = pageQueryOptions(page);
    expect(options.queryKey).toEqual(['docs', 'page', 'ONE']);
    await expect(options.queryFn()).rejects.toThrow(/'First' is not available \(500\)/);
  });

  it('caches the corpus forever, because a build artifact cannot change mid-visit', () => {
    expect(manifestQueryOptions().staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(pageQueryOptions(page).staleTime).toBe(Number.POSITIVE_INFINITY);
  });
});
