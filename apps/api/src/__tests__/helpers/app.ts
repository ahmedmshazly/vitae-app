/**
 * Shared Express app + owner token for route-focused integration suites.
 */
import request from 'supertest';
import type { Express } from 'express';

let cached: { app: Express; token: string } | null = null;

/**
 * The session token, as the route actually returns it.
 *
 * `POST /auth/dev-login` echoes the token in the JSON body **only** under
 * emulators; otherwise it sends it as the httpOnly `vitae_session` cookie and
 * the body carries just the user (routes/v1/auth.ts: "The token is the
 * session; it goes out as an httpOnly cookie… The exception is an emulator
 * run, where supertest has no cookie jar"). Supertest keeps no cookie jar, so
 * the cookie is read off the header here.
 *
 * Reading the body first keeps emulator runs on exactly the path they already
 * take. The cookie branch is what makes the suite work in CI, where no
 * emulator variable is set, and it has the side benefit of exercising the
 * cookie path production actually uses instead of an emulator-only echo.
 */
export function sessionToken(res: request.Response): string | undefined {
  if (typeof res.body?.token === 'string') return res.body.token;
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const cookie of cookies) {
    // Anchored to the name, so a second cookie on the response is skipped
    // rather than mis-parsed. If auth.ts renames the cookie, rename it here.
    const match = /^vitae_session=([^;]*)/.exec(cookie);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/**
 * The same, but loud. Three suites bootstrapped their own token straight off
 * `res.body.token` and got `undefined`, which turned into unexplained 401s on
 * every later assertion rather than one readable failure at the source.
 */
export function requireSessionToken(res: request.Response): string {
  const token = sessionToken(res);
  if (!token) {
    throw new Error(
      `dev-login returned no session token: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return token;
}

/** Boot createApp once per worker and mint a dev-login bearer token. */
export async function getAuthedApp(): Promise<{ app: Express; token: string }> {
  if (cached) return cached;
  process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
  const { createApp } = await import('../../app.js');
  const app = createApp();
  const res = await request(app).post('/api/v1/auth/dev-login');
  cached = { app, token: requireSessionToken(res) };
  return cached;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Find or create the graph's `is_self` person (required for ownership / KNOWS CRM). */
export async function ensureSelfPerson(app: Express, token: string): Promise<string> {
  const people = await request(app)
    .get('/api/v1/nodes?type=person&limit=1000')
    .set(authHeader(token))
    .expect(200);
  const existing = (
    people.body.nodes as Array<{ id: string; props?: { is_self?: boolean } }>
  ).find((p) => p.props?.is_self === true)?.id;
  if (existing) return existing;

  const created = await request(app)
    .post('/api/v1/nodes')
    .set(authHeader(token))
    .send({ type: 'person', title: `Self ${Date.now()}`, props: { is_self: true } })
    .expect(201);
  return created.body.node.id as string;
}

/**
 * Ensure self and create a person. Manual person creates already insert a
 * self→person KNOWS edge (see nodes route); do not add a second one — favors
 * and CRM helpers use `findKnowsEdge`, which returns the first match.
 */
export async function createKnowsPerson(
  app: Express,
  token: string,
  title = `Knows ${Date.now()}`,
): Promise<{ selfId: string; personId: string; edgeId: string }> {
  const selfId = await ensureSelfPerson(app, token);
  const person = await request(app)
    .post('/api/v1/nodes')
    .set(authHeader(token))
    .send({ type: 'person', title, props: {} })
    .expect(201);
  const personId = person.body.node.id as string;
  const detail = await request(app)
    .get(`/api/v1/nodes/${personId}`)
    .set(authHeader(token))
    .expect(200);
  const knows = (detail.body.edges as Array<{ id: string; type: string }>).find((e) => e.type === 'KNOWS');
  if (!knows) throw new Error(`expected auto KNOWS edge for person ${personId}`);
  return { selfId, personId, edgeId: knows.id };
}
