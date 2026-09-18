/**
 * Today aggregate shape (focus, setup, insights).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('dashboard route', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
  });

  it('serves the enriched Today aggregate', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).get('/api/v1/dashboard').set(authHeader(token)).expect(200);
    expect(res.body.focus).toHaveProperty('tasks');
    expect(res.body.focus).toHaveProperty('goals');
    expect(Array.isArray(res.body.upcoming)).toBe(true);
    expect(res.body.setup).toHaveProperty('done');
    expect(res.body.setup.total).toBe(6);
    expect(typeof res.body.insights.momentum.score).toBe('number');
    const weights = res.body.insights.momentum.factors.map((f: { weight: number }) => f.weight);
    expect(weights.reduce((a: number, b: number) => a + b, 0)).toBe(100);
    expect(res.body.insights.relationships).toHaveProperty('drifting');
    expect(res.body.insights.skills).toHaveProperty('covered');
    expect(res.body.knowledge).toEqual(
      expect.objectContaining({ pending: expect.any(Number), conflicts: expect.any(Number) }),
    );
  });
});
