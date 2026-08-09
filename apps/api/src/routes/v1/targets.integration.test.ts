/**
 * Targets: draft round-trip and archive/restore lifecycle.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('targets routes', () => {
  it('lists targets and round-trips a workspace draft', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Draft Tester Split', jd_raw: 'Requirements\n- Python\n- SQL' })
      .expect(201);
    const id = created.body.target.id;

    const draft = { mode: 'manual', templateKey: 'cobalt', include: ['x1', 'x2'], sectionsEnabled: { awards: false } };
    await request(app).patch(`/api/v1/targets/${id}/draft`).set(authHeader(token)).send({ draft }).expect(200);

    const list = await request(app).get('/api/v1/targets').set(authHeader(token)).expect(200);
    const found = list.body.targets.find((t: { id: string }) => t.id === id);
    expect(found.draft).toEqual(draft);

    await request(app).patch('/api/v1/targets/nope/draft').set(authHeader(token)).send({ draft }).expect(404);
  });

  it('updates fields and soft-archives/restores a target', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Lifecycle Split', company: 'Acme', jd_raw: 'Requirements\n- Python' })
      .expect(201);
    const id = created.body.target.id;

    const patched = await request(app)
      .patch(`/api/v1/targets/${id}`)
      .set(authHeader(token))
      .send({ role_title: 'Senior Lifecycle Split', status: 'active' })
      .expect(200);
    expect(patched.body.target.role_title).toBe('Senior Lifecycle Split');

    await request(app).delete(`/api/v1/targets/${id}`).set(authHeader(token)).expect(200);
    const live = await request(app).get('/api/v1/targets').set(authHeader(token)).expect(200);
    expect(live.body.targets.some((t: { id: string }) => t.id === id)).toBe(false);

    await request(app).post(`/api/v1/targets/${id}/restore`).set(authHeader(token)).expect(200);
    const restored = await request(app).get('/api/v1/targets').set(authHeader(token)).expect(200);
    expect(restored.body.targets.some((t: { id: string; deleted_at: null }) => t.id === id && t.deleted_at === null)).toBe(
      true,
    );
  });
});
