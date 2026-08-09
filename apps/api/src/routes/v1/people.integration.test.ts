/**
 * People directory, relationship summary, and owned-records profile.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('people routes', () => {
  it('lists people and serves summary/profile shapes', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `People Suite ${Date.now()}`, props: {} })
      .expect(201);
    const personId = created.body.node.id as string;

    const listed = await request(app).get('/api/v1/people').set(authHeader(token)).expect(200);
    expect(listed.body.people.some((p: { id: string }) => p.id === personId)).toBe(true);

    const summary = await request(app)
      .get(`/api/v1/people/${personId}/summary`)
      .set(authHeader(token))
      .expect(200);
    expect(summary.body).toHaveProperty('strength');
    expect(summary.body).toHaveProperty('relationship');
    expect(Array.isArray(summary.body.favors)).toBe(true);

    const profile = await request(app)
      .get(`/api/v1/people/${personId}/profile`)
      .set(authHeader(token))
      .expect(200);
    expect(profile.body).toHaveProperty('person');
  });

  it('returns 404 for an unknown person summary', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .get('/api/v1/people/00000000-0000-4000-8000-000000000000/summary')
      .set(authHeader(token))
      .expect(404);
  });
});
