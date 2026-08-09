/**
 * Warm-intro targets and pathfinding into an organization.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, ensureSelfPerson, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('intros routes', () => {
  it('requires orgId for path lookup', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).get('/api/v1/intros/paths').set(authHeader(token)).expect(400);
  });

  it('lists targets and returns paths for an organization', async () => {
    const { app, token } = await getAuthedApp();
    await ensureSelfPerson(app, token);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'organization', title: `Intro Org ${Date.now()}`, props: {} })
      .expect(201);
    const orgId = org.body.node.id as string;

    const targets = await request(app)
      .get('/api/v1/intros/targets')
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(targets.body.targets)).toBe(true);
    expect(targets.body.targets.some((t: { id: string }) => t.id === orgId)).toBe(true);

    const paths = await request(app)
      .get(`/api/v1/intros/paths?orgId=${orgId}`)
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(paths.body.paths)).toBe(true);
    expect(paths.body.org.id).toBe(orgId);
  });
});
