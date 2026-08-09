/**
 * Suggest existing values for entry boxes (FR-CAP-003).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('suggest routes', () => {
  it('suggests existing skill values and returns empty for unknown kinds', async () => {
    const { app, token } = await getAuthedApp();
    const marker = `ZsuggestSplit${Date.now()}`;
    await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'skill', title: marker, props: { category: 'language', aliases: [`${marker}-alias`] } })
      .expect(201);

    const skills = await request(app)
      .get(`/api/v1/suggest/values?kind=skill&q=${marker.toLowerCase()}`)
      .set(authHeader(token))
      .expect(200);
    expect(skills.body.values.some((v: { value: string }) => v.value === marker)).toBe(true);

    const bad = await request(app)
      .get('/api/v1/suggest/values?kind=nope')
      .set(authHeader(token))
      .expect(200);
    expect(bad.body.values).toEqual([]);
  });
});
