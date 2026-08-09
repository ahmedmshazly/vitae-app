/**
 * Saved views: create, list, delete.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('views routes', () => {
  it('creates, lists, and deletes a saved view', async () => {
    const { app, token } = await getAuthedApp();
    const name = `Split View ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/views')
      .set(authHeader(token))
      .send({ name, query: 'type:skill' })
      .expect(201);
    const id = created.body.view.id as string;

    const listed = await request(app).get('/api/v1/views').set(authHeader(token)).expect(200);
    expect(listed.body.views.some((v: { id: string }) => v.id === id)).toBe(true);

    await request(app).delete(`/api/v1/views/${id}`).set(authHeader(token)).expect(200);
    const after = await request(app).get('/api/v1/views').set(authHeader(token)).expect(200);
    expect(after.body.views.some((v: { id: string }) => v.id === id)).toBe(false);
  });

  it('rejects unauthenticated create', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).post('/api/v1/views').send({ name: 'x', query: 'type:person' });
    expect(res.status).toBe(401);
  });
});
