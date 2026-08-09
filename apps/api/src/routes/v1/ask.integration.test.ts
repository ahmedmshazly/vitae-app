/**
 * Ask who-to-call, history, reconnect lane, and tie-strength.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, createKnowsPerson, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('ask routes', () => {
  it('rejects unauthenticated asks', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).post('/api/v1/ask/people').send({ need: 'hiring' });
    expect(res.status).toBe(401);
  });

  it('ranks people, records history, and exposes reconnect + strength', async () => {
    const { app, token } = await getAuthedApp();
    const { personId } = await createKnowsPerson(app, token, `Ask Suite ${Date.now()}`);

    const ask = await request(app)
      .post('/api/v1/ask/people')
      .set(authHeader(token))
      .send({ need: `hiring signal ${Date.now()}` })
      .expect(200);
    expect(Array.isArray(ask.body.results)).toBe(true);
    expect(typeof ask.body.considered).toBe('number');

    const history = await request(app).get('/api/v1/ask/history').set(authHeader(token)).expect(200);
    expect(Array.isArray(history.body.asks)).toBe(true);
    expect(history.body.asks.length).toBeGreaterThan(0);

    const reconnect = await request(app)
      .get('/api/v1/ask/reconnect')
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(reconnect.body.lane)).toBe(true);

    const strength = await request(app)
      .get(`/api/v1/ask/people/${personId}/strength`)
      .set(authHeader(token))
      .expect(200);
    expect(strength.body.strength).toBeTruthy();
  });
});
