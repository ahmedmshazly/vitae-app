/**
 * Favor ledger on the self→person KNOWS edge.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, createKnowsPerson, getAuthedApp } from '../../__tests__/helpers/app.js';
import { repository } from '../../db/repository.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('favors routes', () => {
  it('normalizes a legacy null contact date and deduplicates retries before first contact', async () => {
    const { app, token } = await getAuthedApp();
    const { personId } = await createKnowsPerson(app, token, `No contact favors ${Date.now()}`);
    const summary = await request(app)
      .get(`/api/v1/people/${personId}/summary`)
      .set(authHeader(token))
      .expect(200);
    const edgeId = summary.body.relationship.edgeId as string;
    const edge = await repository.getEdge(edgeId);
    expect(edge).toBeTruthy();
    // Reproduce old persisted data; API input validation correctly rejects null.
    await repository.updateEdge(edgeId, {
      props: { ...edge!.props, topics: ['Keep this'], last_interaction_at: null },
    });
    const key = `favor-retry-${personId}`;
    const create = () =>
      request(app)
        .post(`/api/v1/people/${personId}/favors`)
        .set(authHeader(token))
        .set('x-idempotency-key', key)
        .send({ direction: 'owed_by_me', what: 'Review a research proposal' });
    await create().expect(201);
    const retried = await create().expect(201);
    expect(retried.body.favors.filter((favor: { id: string }) => favor.id === key)).toHaveLength(1);
    // Settlement must independently handle an existing legacy ledger too.
    const beforeSettlement = await repository.getEdge(edgeId);
    await repository.updateEdge(edgeId, {
      props: { ...beforeSettlement!.props, last_interaction_at: null },
    });
    await request(app)
      .patch(`/api/v1/people/${personId}/favors/${key}`)
      .set(authHeader(token))
      .send({ settled: true })
      .expect(200);
    const saved = await repository.getEdge(edgeId);
    expect(saved!.props.topics).toEqual(['Keep this']);
    expect(saved!.props.last_interaction_at).toBeUndefined();
    expect(saved!.props.favors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: key, settled: true })]),
    );
    await request(app)
      .patch(`/api/v1/edges/${edgeId}`)
      .set(authHeader(token))
      .send({ props: saved!.props })
      .expect(200);
    expect((await repository.getEdge(edgeId))!.props.last_interaction_at).toBeUndefined();
  });
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
