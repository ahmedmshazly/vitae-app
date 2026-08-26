/**
 * Capture route matrix: preview (no write), commit, empty body, auth gate.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

describe('POST /api/v1/capture', () => {
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('rejects unauthenticated commit', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).post('/api/v1/capture').send({ raw: 'p Ada' });
    expect(res.status).toBe(401);
  });

  it('previews a capture line without requiring a write', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/capture/preview')
      .set(authHeader(token))
      .send({ raw: 'p Ada Lovelace @@Analytical Engine #math' });
    expect(res.status).toBe(200);
    expect(res.body.plan.primaryType).toBe('person');
    expect(res.body.plan.title).toContain('Ada');
    expect(res.body.plan.tags).toContain('math');
  });

  it('commits a person capture and returns created node ids', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .send({ raw: `p Capture Route ${stamp} #e2e` });
    expect(res.status).toBe(201);
    expect(res.body.primaryId).toBeTruthy();
    expect(res.body.created.nodes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.plan.primaryType).toBe('person');
  });

  it('rejects an empty capture commit with 400', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .send({ raw: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'EMPTY' }),
      }),
    );
  });

  it('commits an interaction capture, defaulting kind and occurrence', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .send({ raw: `int coffee debrief ${stamp} @Int Capture ${stamp}` });
    expect(res.status).toBe(201);
    const node = await request(app)
      .get(`/api/v1/nodes/${res.body.primaryId}`)
      .set(authHeader(token))
      .expect(200);
    expect(node.body.node.props.kind).toBe('coffee');
    expect(typeof node.body.node.props.occurred_at).toBe('string');
  });

  it('a dated interaction capture lands on the calendar day the request timezone names', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const tz = 'Etc/GMT+12'; // UTC-12: the host clock runs up to a day ahead of this calendar.
    const day = (at: Date): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const res = await request(app)
      .post('/api/v1/capture')
      .set(authHeader(token))
      .set('x-vitae-tz', tz)
      .send({ raw: `int call sync ${stamp} @Tz Capture ${stamp} ^today` });
    expect(res.status).toBe(201);
    const node = await request(app)
      .get(`/api/v1/nodes/${res.body.primaryId}`)
      .set(authHeader(token))
      .expect(200);
    expect(day(new Date(String(node.body.node.props.occurred_at)))).toBe(day(new Date()));
  });
});
