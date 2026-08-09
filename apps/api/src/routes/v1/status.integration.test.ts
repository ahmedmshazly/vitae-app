/**
 * Ops status: DB write-probe, counts, and env flags.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('status route', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/status');
    expect(res.status).toBe(401);
  });

  it('reports database health, live counts, and env flags', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).get('/api/v1/status').set(authHeader(token)).expect(200);
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.counts).toEqual(expect.objectContaining({ nodes: expect.any(Number) }));
    expect(res.body.env).toHaveProperty('devLogin');
    expect(res.body.env).toHaveProperty('node');
  });
});
