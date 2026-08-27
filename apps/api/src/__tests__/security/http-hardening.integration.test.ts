/**
 * HTTP hardening contracts: default-deny, CORS allow-list, security headers,
 * body-size limits, and prototype-pollution payloads on capture/create.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('HTTP security hardening', () => {
  it('serves nosniff and frame-ancestors none on liveness', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = String(res.headers['content-security-policy'] ?? '');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('does not reflect an arbitrary Origin on credentialed CORS', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app)
      .options('/api/v1/nodes')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    // cors package omits ACAO when the origin is not allow-listed.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows every comma-separated WEB_ORIGIN and treats 127.0.0.1 as a distinct origin', async () => {
    const { app, token } = await getAuthedApp();
    const { env } = await import('../../env.js');
    const origins = env.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
    expect(origins.length).toBeGreaterThanOrEqual(1);
    for (const origin of origins) {
      const res = await request(app).get('/api/v1/auth/me').set('Origin', origin).set(authHeader(token));
      expect(res.headers['access-control-allow-origin'], origin).toBe(origin);
    }
    const listed = new Set(origins);
    const twin = listed.has('http://localhost:5173')
      ? 'http://127.0.0.1:5173'
      : listed.has('http://127.0.0.1:5173')
        ? 'http://localhost:5173'
        : null;
    if (twin && !listed.has(twin)) {
      const res = await request(app).get('/api/v1/auth/me').set('Origin', twin).set(authHeader(token));
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('rejects a JSON body over the default 2mb limit', async () => {
    const { app, token } = await getAuthedApp();
    const huge = 'x'.repeat(2 * 1024 * 1024 + 1024);
    const res = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .set('content-type', 'application/json')
      .send(JSON.stringify({ type: 'person', title: 'Overflow', props: { note: huge } }));
    expect(res.status).toBe(413);
  });

  it('keeps capture free of Object.prototype pollution via leading keys', async () => {
    const { app, token } = await getAuthedApp();
    const before = Object.hasOwn(Object.prototype, 'pwned');
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .send({ raw: '__proto__ pwned=1 Ada' });
    // Parse may accept or reject the line; the invariant is no prototype write.
    expect([200, 201, 400, 422]).toContain(res.status);
    expect(Object.hasOwn(Object.prototype, 'pwned')).toBe(before);
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });
});
