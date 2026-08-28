/**
 * Route-focused edges matrix: create, validate endpoints, space isolation, soft-delete.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildEdgeCreate, buildNodeCreate } from '@vitae/testkit';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

describe('POST/GET/DELETE /api/v1/edges', () => {
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('rejects unauthenticated create', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/edges')
      .send(buildEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b' }));
    expect(res.status).toBe(401);
  });

  it('creates a KNOWS edge between two people and fetches it', async () => {
    const { app, token } = await getAuthedApp();
    const a = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Edge Person A' }));
    const b = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Edge Person B' }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const edgeBody = buildEdgeCreate({
      type: 'KNOWS',
      src: a.body.node.id,
      dst: b.body.node.id,
      props: { closeness: 3 },
    });
    const created = await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send(edgeBody);
    expect(created.status).toBe(201);
    const id = created.body.edge.id as string;

    const got = await request(app).get(`/api/v1/edges/${id}`).set(authHeader(token));
    expect(got.status).toBe(200);
    expect(got.body.edge.type).toBe('KNOWS');
  });

  it('folds a second KNOWS between the same pair into the first', async () => {
    const { app, token } = await getAuthedApp();
    const a = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Pair Person A' }));
    const b = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Pair Person B' }));

    const first = await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send(
        buildEdgeCreate({
          type: 'KNOWS',
          src: a.body.node.id,
          dst: b.body.node.id,
          props: { closeness: 4, favors: [{ direction: 'owed_to_me', what: 'intro', settled: false }] },
        }),
      );
    expect(first.status).toBe(201);

    // Same pair, recorded the other way round. Sent the way the Add connection
    // dialog sends it, carrying only the fields it puts on screen, because that
    // is what decides whether the rest of the relationship survives. Two KNOWS
    // edges made every reader pick one of them at random.
    const second = await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({
        type: 'KNOWS',
        src: b.body.node.id,
        dst: a.body.node.id,
        props: { topics: ['Business'] },
        notes_md: '',
        source: 'manual',
        confidence: 1,
      });
    expect(second.status).toBe(201);
    expect(second.body.edge.id).toBe(first.body.edge.id);
    expect(second.body.edge.props.topics).toEqual(['Business']);
    // ...and what the caller did not mention survives.
    expect(second.body.edge.props.closeness).toBe(4);
    expect(second.body.edge.props.favors).toHaveLength(1);
  });

  it('rejects an edge with a missing endpoint', async () => {
    const { app, token } = await getAuthedApp();
    const person = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Lonely Endpoint' }));
    const res = await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send(
        buildEdgeCreate({
          type: 'KNOWS',
          src: person.body.node.id,
          dst: 'does-not-exist',
        }),
      );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('keeps demo-space edges out of the real graph', async () => {
    const { app, token } = await getAuthedApp();
    const headers = { ...authHeader(token), 'x-vitae-space': 'demo' };
    const a = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send(buildNodeCreate({ type: 'person', title: 'Demo Edge A' }));
    const b = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send(buildNodeCreate({ type: 'person', title: 'Demo Edge B' }));
    const created = await request(app)
      .post('/api/v1/edges')
      .set(headers)
      .send(buildEdgeCreate({ type: 'KNOWS', src: a.body.node.id, dst: b.body.node.id }));
    expect(created.status).toBe(201);
    const id = created.body.edge.id as string;

    const realGet = await request(app).get(`/api/v1/edges/${id}`).set(authHeader(token));
    expect(realGet.status).toBe(404);

    const demoGet = await request(app).get(`/api/v1/edges/${id}`).set(headers);
    expect(demoGet.status).toBe(200);
  });
});
