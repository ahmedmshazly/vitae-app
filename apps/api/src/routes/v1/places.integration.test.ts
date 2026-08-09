/**
 * Place registry resolve (offline-safe); geocoder success is not asserted.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('places routes', () => {
  it('rejects resolve without aliases', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .post('/api/v1/places/resolve')
      .set(authHeader(token))
      .send({ label: 'Nowhere', lat: 30.0, lng: 31.0 })
      .expect(400);
  });

  it('serves registry, resolve, suggest-merges, and short search', async () => {
    const { app, token } = await getAuthedApp();
    const alias = `place-alias-${Date.now()}`;

    const registry = await request(app)
      .get('/api/v1/places/registry')
      .set(authHeader(token))
      .expect(200);
    expect(registry.body).toHaveProperty('places');
    expect(registry.body).toHaveProperty('aliases');

    const resolved = await request(app)
      .post('/api/v1/places/resolve')
      .set(authHeader(token))
      .send({ aliases: [alias], label: 'Cairo Test', lat: 30.0444, lng: 31.2357 })
      .expect(200);
    // Aliases are stored under normalizePlaceKey (hyphens → spaces).
    expect(resolved.body.aliases['cairo test']).toBeTruthy();
    expect(Object.keys(resolved.body.places).length).toBeGreaterThan(0);

    const suggestions = await request(app)
      .get('/api/v1/places/suggest-merges?q=Cairo')
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(suggestions.body.suggestions)).toBe(true);

    const short = await request(app)
      .get('/api/v1/places/search?q=a')
      .set(authHeader(token))
      .expect(200);
    expect(short.body.results).toEqual([]);
  });
});
