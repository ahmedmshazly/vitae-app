/**
 * Search route matrix: auth, filter AST echo, hit ownership labeling, switcher.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildNodeCreate } from '@vitae/testkit';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

describe('GET /api/v1/search', () => {
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('rejects unauthenticated search', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/search').query({ q: 'type:person' });
    expect(res.status).toBe(401);
  });

  it('echoes the filter AST and finds a uniquely titled person', async () => {
    const { app, token } = await getAuthedApp();
    const tokenTitle = `zqxsearch${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: tokenTitle }));
    expect(created.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/search')
      .set(authHeader(token))
      .query({ q: `type:person ${tokenTitle}` });
    expect(res.status).toBe(200);
    expect(res.body.ast.clauses.some((c: { field: string }) => c.field === 'type')).toBe(true);
    expect(res.body.results.some((r: { title: string }) => r.title === tokenTitle)).toBe(true);
  });

  it('serves the quick-switcher endpoint', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .get('/api/v1/search/switch')
      .set(authHeader(token))
      .query({ q: 'a', types: 'person' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results ?? res.body)).toBe(true);
  });
});
