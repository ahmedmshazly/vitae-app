/**
 * Interactions: atomic create with edge + reminder; unknown person creates nothing (FR-002).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('interactions routes', () => {
  it('logs an interaction with its edge and reminders atomically', async () => {
    const { app, token } = await getAuthedApp();
    const person = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Atomic Interaction ${Date.now()}`, props: {} })
      .expect(201);
    const personId = person.body.node.id;

    const res = await request(app)
      .post('/api/v1/interactions')
      .set(authHeader(token))
      .send({ personId, kind: 'coffee', note: 'Atomic coffee split', followUpDate: '2026-08-01' })
      .expect(201);

    expect(res.body.edge.src).toBe(res.body.interaction.id);
    expect(res.body.edge.dst).toBe(personId);
    expect(res.body.reminders).toHaveLength(1);

    await request(app)
      .post('/api/v1/interactions')
      .set(authHeader(token))
      .send({ personId: 'no-such-person', kind: 'call', note: 'orphan probe split' })
      .expect(422);
    const search = await request(app)
      .get('/api/v1/nodes?q=orphan%20probe%20split')
      .set(authHeader(token))
      .expect(200);
    expect(search.body.nodes.some((n: { title: string }) => n.title === 'orphan probe split')).toBe(false);
  });
});
