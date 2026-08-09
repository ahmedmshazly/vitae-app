/**
 * Shared Express app + owner token for route-focused integration suites.
 */
import request from 'supertest';
import type { Express } from 'express';

let cached: { app: Express; token: string } | null = null;

/** Boot createApp once per worker and mint a dev-login bearer token. */
export async function getAuthedApp(): Promise<{ app: Express; token: string }> {
  if (cached) return cached;
  process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
  const { createApp } = await import('../../app.js');
  const app = createApp();
  const res = await request(app).post('/api/v1/auth/dev-login');
  if (!res.body?.token) {
    throw new Error(`dev-login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  cached = { app, token: res.body.token as string };
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
