/**
 * Imports route: stage a contacts CSV and discard the batch.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('imports routes', () => {
  it('rejects unauthenticated stage', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/imports')
      .send({ kind: 'contacts', filename: 'x.csv', content: 'Name,Email\nA,a@b.c' });
    expect(res.status).toBe(401);
  });

  it('stages a contacts CSV and discards the batch', async () => {
    const { app, token } = await getAuthedApp();
    const csv = 'Name,Email\nImport Split Person,import.split@example.com\n';
    const staged = await request(app)
      .post('/api/v1/imports')
      .set(authHeader(token))
      .send({ kind: 'contacts', filename: 'split.csv', content: csv })
      .expect(201);
    expect(staged.body.batch.stats.rows).toBeGreaterThan(0);
    const id = staged.body.batch.id as string;

    await request(app).post(`/api/v1/imports/${id}/discard`).set(authHeader(token)).expect(200);
  });
});
