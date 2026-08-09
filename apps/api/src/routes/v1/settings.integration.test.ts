/**
 * Settings: resume defaults patch and validation.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('settings routes', () => {
  it('persists resume defaults and rejects an invalid accent', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .patch('/api/v1/settings')
      .set(authHeader(token))
      .send({ resumeDefaults: { accent: '#0f766e', templateKey: 'cobalt' } })
      .expect(200);

    const settings = await request(app).get('/api/v1/settings').set(authHeader(token)).expect(200);
    expect(settings.body.resumeDefaults).toMatchObject({
      templateKey: 'cobalt',
      accent: '#0f766e',
    });

    await request(app)
      .patch('/api/v1/settings')
      .set(authHeader(token))
      .send({ resumeDefaults: { accent: '#ff00ff' } })
      .expect(422);
  });
});
