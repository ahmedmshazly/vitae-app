/**
 * Route-focused nodes matrix (first split from the monolith integration suite).
 * Covers create/read, validation failure, and demo vs real space isolation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildNodeCreate, resetIdSequence } from '@vitae/testkit';

let app: Express;
let token: string;

describe('POST/GET /api/v1/nodes', () => {
  beforeAll(async () => {
    process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
    const { createApp } = await import('../../app.js');
    app = createApp();
    const res = await request(app).post('/api/v1/auth/dev-login');
    token = res.body.token as string;
  });

  beforeEach(() => {
    resetIdSequence(0);
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('rejects unauthenticated create', async () => {
    const res = await request(app).post('/api/v1/nodes').send({ type: 'person', title: 'X' });
    expect(res.status).toBe(401);
  });

  it('creates a person and returns it by id', async () => {
    const payload = buildNodeCreate({ type: 'person', title: 'Nodes Matrix Person' });
    const created = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    const got = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.node.title).toBe('Nodes Matrix Person');
  });

  it('returns field errors for an invalid role create', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'role', title: 'Missing employment', props: {} });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('keeps demo-space nodes out of the real graph', async () => {
    const payload = buildNodeCreate({ type: 'person', title: `demo-only-${Date.now()}` });
    const create = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo')
      .send(payload);
    expect(create.status).toBe(201);
    const id = create.body.node.id as string;

    const realGet = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(realGet.status).toBe(404);

    const demoGet = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo');
    expect(demoGet.status).toBe(200);
    expect(demoGet.body.node.title).toBe(payload.title);
  });
});
