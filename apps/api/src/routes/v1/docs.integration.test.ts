/**
 * The documentation corpus is private, and this is what makes that true.
 *
 * The corpus moved behind this API because it is a map of the whole system:
 * every trust boundary, every known gap, and a generated half that enumerates
 * every route, endpoint, table and exported symbol in the repository. So the
 * first two tests are the ones that matter: an anonymous request gets nothing,
 * and a request from an identity that is not the owner gets nothing either.
 *
 * The rest is file access. A route that maps a URL onto a path under a
 * directory is the classic way to serve a file nobody meant to publish, so the
 * traversal cases are spelled out rather than assumed.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { env } from '../../env.js';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

// apps/api/src/routes/v1 -> repo root is five levels up, the same walk the
// router makes.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

let app: Express;
let token: string;
let root: string;
let secretOutside: string;
const originalDir = process.env.DOCS_CONTENT_DIR;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'vitae-docs-'));
  mkdirSync(join(root, 'pages/architecture'), { recursive: true });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ pages: [{ id: 'ARC' }] }));
  writeFileSync(join(root, 'pages/architecture/security.json'), JSON.stringify({ id: 'ARC-SECURITY' }));

  // A file the corpus must never reach, one level above its root.
  secretOutside = join(root, '..', `vitae-docs-secret-${process.pid}.json`);
  writeFileSync(secretOutside, JSON.stringify({ secret: 'not for publication' }));

  process.env.DOCS_CONTENT_DIR = root;
  ({ app, token } = await getAuthedApp());
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(secretOutside, { force: true });
  if (originalDir === undefined) delete process.env.DOCS_CONTENT_DIR;
  else process.env.DOCS_CONTENT_DIR = originalDir;
});

describe('who may read the documentation', () => {
  it('refuses a request with no identity at all', async () => {
    await request(app).get('/api/v1/docs/manifest.json').expect(401);
  });

  it('refuses an identity that is not the owner', async () => {
    // A perfectly valid session for somebody else. Self-hosted mode authorises
    // on OWNER_EMAIL, so a real token is not the same thing as permission.
    const stranger = jwt.sign(
      { uid: 'dev:someone@example.com', email: 'someone@example.com', via: 'dev' },
      env.SESSION_SECRET,
      { expiresIn: '1h' },
    );
    await request(app).get('/api/v1/docs/manifest.json').set(authHeader(stranger)).expect(401);
  });

  it('serves the owner the file they asked for', async () => {
    const res = await request(app)
      .get('/api/v1/docs/manifest.json')
      .set(authHeader(token))
      .expect(200);
    expect(res.body.pages).toStrictEqual([{ id: 'ARC' }]);
  });

  it('serves a nested page', async () => {
    const res = await request(app)
      .get('/api/v1/docs/pages/architecture/security.json')
      .set(authHeader(token))
      .expect(200);
    expect(res.body.id).toBe('ARC-SECURITY');
  });
});

describe('who may read it once anyone can sign up', () => {
  // The reason this suite exists. Self-hosted, `authGate` admits nobody but the
  // owner and the router's own check is redundant. In Cloud mode the gate
  // admits every verified Google account, so without that check turning Cloud
  // on would hand the corpus to every subscriber, silently, on a flag flip.
  const originalCloud = process.env.VITAE_CLOUD_ENABLED;

  beforeAll(() => {
    process.env.VITAE_CLOUD_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalCloud === undefined) delete process.env.VITAE_CLOUD_ENABLED;
    else process.env.VITAE_CLOUD_ENABLED = originalCloud;
  });

  it('still serves the owner', async () => {
    const res = await request(app)
      .get('/api/v1/docs/manifest.json')
      .set(authHeader(token))
      .expect(200);
    expect(res.body.pages).toStrictEqual([{ id: 'ARC' }]);
  });

  it('refuses a subscriber who is otherwise perfectly entitled', async () => {
    // A real, verified, signed-in Cloud user. Everything the gate asks for, and
    // still not the owner of this installation.
    const subscriber = jwt.sign(
      { uid: 'dev:subscriber@example.com', email: 'subscriber@example.com', via: 'dev' },
      env.SESSION_SECRET,
      { expiresIn: '1h' },
    );
    const res = await request(app)
      .get('/api/v1/docs/manifest.json')
      .set(authHeader(subscriber));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('ARC');
  });

  it('does not make reading the documentation wait on account setup', async () => {
    // Workspace resolution is skipped for this route. Without that, an owner
    // who had not bootstrapped would be told to finish setup before they could
    // read the page explaining how to.
    const res = await request(app).get('/api/v1/docs/manifest.json').set(authHeader(token));
    expect(res.status).not.toBe(409);
  });
});

describe('keeping the corpus out of shared caches', () => {
  it('marks every file private and unstorable', async () => {
    // A proxy holding a copy would hand it to the next person through it.
    const res = await request(app)
      .get('/api/v1/docs/manifest.json')
      .set(authHeader(token))
      .expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('what the file server refuses', () => {
  const traversals = [
    ['a relative parent', `../vitae-docs-secret-${process.pid}.json`],
    ['a nested parent', `pages/../../vitae-docs-secret-${process.pid}.json`],
    ['a doubled parent', `../../etc/passwd`],
    ['an absolute path', '/etc/passwd'],
  ] as const;

  it.each(traversals)('refuses %s', async (_label, path) => {
    const res = await request(app).get(`/api/v1/docs/${path}`).set(authHeader(token));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('not for publication');
  });

  it('refuses a percent-encoded parent, which arrives already decoded', async () => {
    const res = await request(app)
      .get(`/api/v1/docs/%2e%2e%2fvitae-docs-secret-${process.pid}.json`)
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('refuses a symlink that points out of the corpus', async () => {
    symlinkSync(secretOutside, join(root, 'escape.json'));
    const res = await request(app).get('/api/v1/docs/escape.json').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('refuses a directory', async () => {
    await request(app).get('/api/v1/docs/pages').set(authHeader(token)).expect(404);
  });

  it('answers a missing file and a forbidden one identically', async () => {
    // Telling the two apart would say where the root is and what sits beside
    // it. The encoded form is used because Express normalises a literal `..`
    // out of the path before routing, so only the encoded one ever reaches
    // this handler, which is also why the literal cases above are answered by
    // the router never matching rather than by the check inside it.
    const missing = await request(app).get('/api/v1/docs/nope.json').set(authHeader(token));
    const outside = await request(app)
      .get(`/api/v1/docs/%2e%2e%2fvitae-docs-secret-${process.pid}.json`)
      .set(authHeader(token));
    expect(missing.status).toBe(outside.status);
    expect(missing.body).toStrictEqual(outside.body);
  });
});

describe('where a relative directory points', () => {
  it('resolves against the repository root, not the process working directory', async () => {
    // `.env` sits at the repository root and is written by someone thinking in
    // repository paths. Resolved against the cwd, `docs/.compiled` silently
    // becomes `apps/api/docs/.compiled` and the only symptom is documentation
    // that reports itself unavailable for no visible reason. This is that bug.
    //
    // A corpus is planted at a known relative path rather than pointing at the
    // repository's own `docs/.compiled`, which is a gitignored build artifact:
    // depending on it would pass here and fail in a fresh checkout, which is
    // exactly what it did the first time this was written.
    const relative = `docs/.compiled-test-${process.pid}`;
    const planted = join(REPO_ROOT, relative);
    mkdirSync(planted, { recursive: true });
    writeFileSync(join(planted, 'manifest.json'), JSON.stringify({ pages: [] }));
    try {
      process.env.DOCS_CONTENT_DIR = relative;
      const res = await request(app).get('/api/v1/docs/manifest.json').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ pages: [] });
    } finally {
      process.env.DOCS_CONTENT_DIR = root;
      rmSync(planted, { recursive: true, force: true });
    }
  });
});

describe('a deployment with no corpus published to it', () => {
  it('says so rather than reporting an empty documentation set', async () => {
    delete process.env.DOCS_CONTENT_DIR;
    const res = await request(app).get('/api/v1/docs/manifest.json').set(authHeader(token));
    process.env.DOCS_CONTENT_DIR = root;

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DOCS_UNAVAILABLE');
  });

  it('treats an empty directory as no corpus, not as a corpus with nothing in it', async () => {
    // This is the shape a real deployment fails in. A bind mount whose host
    // path does not exist is created empty by the container runtime, so the
    // directory is there and the manifest is not. Answering 404 per file would
    // send a reader hunting a broken link; the problem is a missing deploy step.
    const empty = mkdtempSync(join(tmpdir(), 'vitae-docs-empty-'));
    process.env.DOCS_CONTENT_DIR = empty;
    const file = await request(app).get('/api/v1/docs/manifest.json').set(authHeader(token));
    const status = await request(app).get('/api/v1/docs').set(authHeader(token));
    process.env.DOCS_CONTENT_DIR = root;
    rmSync(empty, { recursive: true, force: true });

    expect(file.status).toBe(503);
    expect(file.body.code).toBe('DOCS_UNAVAILABLE');
    expect(status.body).toStrictEqual({ available: false, configured: true });
  });

  it('reports availability once a corpus is there', async () => {
    const res = await request(app).get('/api/v1/docs').set(authHeader(token)).expect(200);
    expect(res.body).toStrictEqual({ available: true, configured: true });
  });
});
