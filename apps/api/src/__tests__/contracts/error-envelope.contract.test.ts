/**
 * Contract: every documented error path returns `{ error: { code, message, request_id } }`.
 * This is the shared client envelope until OpenAPI generation lands.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../helpers/app.js';

function expectErrorEnvelope(body: unknown, status: number): void {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(body).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
        request_id: expect.any(String),
      }),
    }),
  );
}

describe('API error envelope contract', () => {
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('uses the envelope for 401 default-deny', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/nodes');
    expectErrorEnvelope(res.body, res.status);
    expect(res.status).toBe(401);
  });

  it('uses the envelope for 404 missing node', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .get('/api/v1/nodes/00000000-0000-4000-8000-000000000000')
      .set(authHeader(token));
    expectErrorEnvelope(res.body, res.status);
    expect(res.status).toBe(404);
  });

  it('uses the envelope for 422 validation failures', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'role', title: 'No employment', props: {} });
    expectErrorEnvelope(res.body, res.status);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details).toBeTruthy();
  });

  it('uses the envelope for 400 empty capture', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .send({ raw: '' });
    expectErrorEnvelope(res.body, res.status);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY');
  });
});
