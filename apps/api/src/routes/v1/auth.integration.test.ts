/**
 * Auth route matrix: default-deny, dev-login, /me, logout cookie clear.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

describe('/api/v1/auth', () => {
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('allows /me without a token and reports a null user', async () => {
    const { app } = await getAuthedApp();
    // /auth/me is intentionally public so the SPA can probe session state.
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body).toHaveProperty('localInstall');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('returns the owner on /me with a bearer token', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).get('/api/v1/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user?.email).toBeTruthy();
    expect(res.body).toHaveProperty('devLoginEnabled');
  });

  it('issues a dev-login token for local integration runs', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).post('/api/v1/auth/dev-login');
    expect(res.status).toBe(200);
    // Emulator/test path echoes the token for supertest (no cookie jar).
    expect(typeof res.body.token === 'string' || res.body.user?.via === 'dev').toBe(true);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('clears the session cookie on logout', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).post('/api/v1/auth/logout').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cleared = cookies.find((c) => /^vitae_session=/.test(c));
    expect(cleared, 'logout must emit a matching Set-Cookie').toBeTruthy();
    expect(cleared).toMatch(/HttpOnly/i);
    expect(cleared).toMatch(/SameSite=Lax/i);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});
