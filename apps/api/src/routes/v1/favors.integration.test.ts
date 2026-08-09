/**
 * Favor ledger on the self→person KNOWS edge.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, createKnowsPerson, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('favors routes', () => {
  it('returns 404 when there is no KNOWS relationship', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .get('/api/v1/people/00000000-0000-4000-8000-000000000099/favors')
      .set(authHeader(token))
      .expect(404);
  });

  it('creates, lists, and settles a favor', async () => {
    const { app, token } = await getAuthedApp();
    const { personId } = await createKnowsPerson(app, token, `Favor Suite ${Date.now()}`);
    const what = `Intro ${Date.now()}`;

    const created = await request(app)
      .post(`/api/v1/people/${personId}/favors`)
      .set(authHeader(token))
      .send({ direction: 'owed_to_me', what })
      .expect(201);
    const favor = created.body.favors.find((f: { what: string }) => f.what === what) as {
      id: string;
      settled?: boolean;
    };
    expect(favor?.id).toBeTruthy();

    const listed = await request(app)
      .get(`/api/v1/people/${personId}/favors`)
      .set(authHeader(token))
      .expect(200);
    expect(listed.body.favors.some((f: { what: string }) => f.what === what)).toBe(true);

    const settled = await request(app)
      .patch(`/api/v1/people/${personId}/favors/${favor.id}`)
      .set(authHeader(token))
      .send({ settled: true })
      .expect(200);
    expect(settled.body.favors.find((f: { id: string }) => f.id === favor.id)?.settled).toBe(true);
  });
});
