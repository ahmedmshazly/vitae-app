/**
 * Organizations directory and org profile.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('orgs routes', () => {
  it('lists organizations and returns a profile', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'organization', title: `Org Suite ${Date.now()}`, props: {} })
      .expect(201);
    const orgId = created.body.node.id as string;

    const listed = await request(app).get('/api/v1/orgs').set(authHeader(token)).expect(200);
    expect(listed.body.orgs.some((o: { id: string }) => o.id === orgId)).toBe(true);

    const profile = await request(app)
      .get(`/api/v1/orgs/${orgId}`)
      .set(authHeader(token))
      .expect(200);
    expect(profile.body.org.id).toBe(orgId);
  });

  it('returns 404 for an unknown organization', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .get('/api/v1/orgs/00000000-0000-4000-8000-000000000000')
      .set(authHeader(token))
      .expect(404);
  });

  it.each([
    { label: 'canonical HQ', props: { hq_city: 'Alexandria' }, city: 'Alexandria' },
    {
      label: 'canonical precedence',
      props: { hq_city: 'Alexandria', city: 'Cairo' },
      city: 'Alexandria',
    },
    { label: 'legacy fallback', props: { city: 'Cairo' }, city: 'Cairo' },
    { label: 'blank HQ fallback', props: { hq_city: '  ', city: 'Cairo' }, city: 'Cairo' },
    { label: 'trimmed HQ', props: { hq_city: ' Alexandria ' }, city: 'Alexandria' },
    { label: 'missing city', props: {}, city: null },
    { label: 'blank cities', props: { hq_city: '', city: ' ' }, city: null },
  ])('uses $label consistently without changing the saved record', async ({ props, city }) => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'organization', title: `City regression ${Date.now()}`, props })
      .expect(201);
    const id = created.body.node.id as string;
    const listed = await request(app).get('/api/v1/orgs').set(authHeader(token)).expect(200);
    expect(listed.body.orgs.find((org: { id: string }) => org.id === id)?.city).toBe(city);
    const profile = await request(app).get(`/api/v1/orgs/${id}`).set(authHeader(token)).expect(200);
    expect(profile.body.org.city).toBe(city);
    const stored = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);
    expect(stored.body.node.props).toEqual(created.body.node.props);
  });
});
