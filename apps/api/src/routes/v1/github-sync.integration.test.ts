/**
 * GitHub sync with mocked fetch (never hits api.github.com).
 *
 * 401 PAT, ETag 304, pagination, identity-key merge across a rename, forks skipped.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const FIXTURE_ID = 90001001;
const FIXTURE_KEY = `github:repo:${FIXTURE_ID}`;
const PAGE_TWO_ID = 90001002;
const PAGE_TWO_KEY = `github:repo:${PAGE_TWO_ID}`;

function repo(over: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_ID,
    full_name: 'fixture/vitae-qa',
    name: 'vitae-qa',
    description: null,
    html_url: 'https://github.com/fixture/vitae-qa',
    language: 'TypeScript',
    stargazers_count: 1,
    forks_count: 0,
    private: false,
    default_branch: 'main',
    fork: false,
    ...over,
  };
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

async function purgeFixture(): Promise<void> {
  const { repository } = await import('../../db/repository.js');
  const nodes = await repository.allLiveNodes();
  const mine = nodes.filter((n) =>
    (n.identity_keys ?? []).some((k) => k === FIXTURE_KEY || k === PAGE_TWO_KEY),
  );
  const edges = await repository.allLiveEdges();
  await repository.purgeEdges(
    edges.filter((e) => mine.some((n) => n.id === e.src || n.id === e.dst)).map((e) => e.id),
  );
  await repository.purgeNodes(mine.map((n) => n.id));
}

const originalFetch = globalThis.fetch;
const originalPat = process.env.GITHUB_PAT;

describe('GitHub sync', () => {
  beforeAll(async () => {
    process.env.GITHUB_PAT = 'test-github-pat';
    await purgeFixture();
  }, 60_000);

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.GITHUB_PAT = 'test-github-pat';
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.GITHUB_PAT;
    else process.env.GITHUB_PAT = originalPat;
    await purgeFixture();
  }, 60_000);

  it('reports unauthorized when GitHub rejects the token', async () => {
    globalThis.fetch = vi.fn(async () => new Response('Bad credentials', { status: 401 })) as typeof fetch;
    const { app, token } = await getAuthedApp();
    const res = await request(app).post('/api/v1/imports/github/sync').set(authHeader(token));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GITHUB_UNAUTHORIZED');
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).toContain('api.github.com/user/repos');
  });

  it('returns not_modified on an ETag 304 and does not fork records', async () => {
    const { app, token } = await getAuthedApp();
    await purgeFixture();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse([repo()], { headers: { etag: '"etag-1"' } }),
    ) as typeof fetch;
    const first = await request(app).post('/api/v1/imports/github/sync').set(authHeader(token)).expect(200);
    expect(first.body.status).toBe('synced');
    expect(first.body.created).toBeGreaterThanOrEqual(1);

    globalThis.fetch = vi.fn(async () => new Response(null, { status: 304, headers: { etag: '"etag-1"' } })) as typeof fetch;
    const second = await request(app).post('/api/v1/imports/github/sync').set(authHeader(token)).expect(200);
    expect(second.body).toMatchObject({ status: 'not_modified', created: 0, updated: 0 });
  });

  it('paginates, stamps github:repo identity keys, and merges a rename instead of forking', async () => {
    const { app, token } = await getAuthedApp();
    await purgeFixture();

    const page1 = jsonResponse([repo({ full_name: 'fixture/old-name', name: 'old-name' })], {
      headers: {
        link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        etag: '"page"',
      },
    });
    const page2 = jsonResponse([
      repo({
        id: PAGE_TWO_ID,
        full_name: 'fixture/page-two',
        name: 'page-two',
        html_url: 'https://github.com/fixture/page-two',
      }),
    ]);
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('page=2')) return page2;
      return page1;
    }) as typeof fetch;

    const first = await request(app).post('/api/v1/imports/github/sync').set(authHeader(token)).expect(200);
    expect(first.body.status).toBe('synced');
    expect(first.body.created).toBeGreaterThanOrEqual(2);
    expect(first.body.skipped).toBe(0);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);

    globalThis.fetch = vi.fn(async () =>
      jsonResponse([
        repo({ full_name: 'fixture/renamed', name: 'renamed', html_url: 'https://github.com/fixture/renamed' }),
        repo({ id: PAGE_TWO_ID, full_name: 'fixture/page-two', name: 'page-two', fork: true }),
      ]),
    ) as typeof fetch;
    const renamed = await request(app).post('/api/v1/imports/github/sync').set(authHeader(token)).expect(200);
    expect(renamed.body.created).toBe(0);
    expect(renamed.body.skipped).toBe(1);

    const listed = await request(app)
      .get('/api/v1/nodes?type=repository&limit=1000')
      .set(authHeader(token))
      .expect(200);
    const keyed = (listed.body.nodes as Array<{ identity_keys?: string[]; props?: { full_name?: string } }>).filter(
      (n) => (n.identity_keys ?? []).includes(FIXTURE_KEY),
    );
    expect(keyed).toHaveLength(1);
    expect(keyed[0]!.props?.full_name).toBe('fixture/renamed');
  }, 90_000);
});
