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

  it('computes the correspondence profile from stated directions, and owns up to unstated ones (FR-COMM-001)', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Correspondent ${Date.now()}`, props: {} })
      .expect(201);
    const personId = created.body.node.id as string;

    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    const log = (body: Record<string, unknown>) =>
      request(app).post('/api/v1/interactions').set(authHeader(token)).send({ personId, ...body }).expect(201);
    await log({ kind: 'email', note: 'they wrote', occurredAt: day(6), initiatedBy: 'them' });
    await log({ kind: 'email', note: 'I answered', occurredAt: day(4), initiatedBy: 'me' });
    await log({ kind: 'coffee', note: 'direction unstated', occurredAt: day(2) });

    const res = await request(app)
      .get(`/api/v1/people/${personId}/correspondence`)
      .set(authHeader(token))
      .expect(200);
    const profile = res.body.profile;
    expect(profile.coverage).toEqual({ withDirection: 2, total: 3 });
    expect(profile.reciprocity).toMatchObject({ outbound: 1, inbound: 1, ratio: 0.5 });
    expect(profile.replyLatency.mine.medianDays).toBe(2);
    expect(profile.replyLatency.mine.samples).toHaveLength(1);
    expect(profile.unansweredInbound.count).toBe(0);
    expect(profile.contactDays.months).toHaveLength(12);

    await request(app)
      .get('/api/v1/people/00000000-0000-4000-8000-000000000000/correspondence')
      .set(authHeader(token))
      .expect(404);
  });
});
